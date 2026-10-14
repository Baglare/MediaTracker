-- No extension, login, embedded secret, or runtime verified-write grant.
BEGIN;
SET LOCAL ROLE mt_owner;
GRANT EXECUTE ON FUNCTION app.assert_account_write(uuid[]) TO mt_auth_owner;
RESET ROLE;
SET LOCAL ROLE mt_auth_owner;
CREATE TABLE native_auth.email_verification_key (
  singleton boolean PRIMARY KEY DEFAULT true CHECK(singleton),
  epoch bigint NOT NULL CHECK(epoch>0),
  key bytea NOT NULL CHECK(octet_length(key)=32)
);
ALTER TABLE native_auth.email_verification_key ENABLE ROW LEVEL SECURITY;
ALTER TABLE native_auth.email_verification_key FORCE ROW LEVEL SECURITY;
CREATE POLICY email_key_owner ON native_auth.email_verification_key TO mt_auth_owner
USING(current_user='mt_auth_owner') WITH CHECK(current_user='mt_auth_owner');
CREATE TABLE native_auth.email_verification_replay (
  replay text PRIMARY KEY CHECK(replay ~ '^[0-9a-f]{64}$'),
  expires_at timestamptz NOT NULL
);
CREATE TABLE native_auth.email_verification_issuance (
  replay text PRIMARY KEY CHECK(replay ~ '^[0-9a-f]{64}$'),
  user_id uuid NOT NULL REFERENCES native_auth."user"(id) ON DELETE CASCADE,
  epoch bigint NOT NULL, issued bigint NOT NULL, expiry bigint NOT NULL
);
-- Non-secret restore pin. Secret bytes are deliberately never dumped.
CREATE TABLE native_auth.email_verification_epoch (
  singleton boolean PRIMARY KEY DEFAULT true CHECK(singleton),
  epoch bigint NOT NULL CHECK(epoch>0), key_hash bytea NOT NULL CHECK(octet_length(key_hash)=32)
);
REVOKE ALL ON native_auth.email_verification_key,native_auth.email_verification_replay FROM PUBLIC,mt_auth_access,mt_runtime;
REVOKE ALL ON native_auth.email_verification_epoch FROM PUBLIC,mt_auth_access,mt_runtime;
REVOKE ALL ON native_auth.email_verification_issuance FROM PUBLIC,mt_auth_access,mt_runtime;
DO $backup$ BEGIN
  IF to_regrole('mt_backup') IS NOT NULL THEN
    REVOKE ALL ON native_auth.email_verification_key FROM mt_backup;
    -- Schema dump locking needs SELECT, but FORCE RLS exposes zero key rows.
    GRANT SELECT ON native_auth.email_verification_key TO mt_backup;
    GRANT SELECT ON native_auth.email_verification_replay,native_auth.email_verification_epoch,native_auth.email_verification_issuance TO mt_backup;
  END IF;
END; $backup$;
-- RFC 2104: hash long keys, zero-pad to 64 bytes, inner/outer XOR pads.
CREATE FUNCTION native_auth.hmac_sha256(p_key bytea,p_data bytea) RETURNS bytea
LANGUAGE plpgsql IMMUTABLE STRICT SET search_path=pg_catalog AS $$
DECLARE k bytea:=p_key; ip bytea:=decode(repeat('00',64),'hex'); op bytea:=ip; i integer; b integer;
BEGIN
  IF octet_length(k)>64 THEN k:=sha256(k); END IF;
  FOR i IN 0..63 LOOP
    b:=CASE WHEN i<octet_length(k) THEN get_byte(k,i) ELSE 0 END;
    ip:=set_byte(ip,i,b # 54); op:=set_byte(op,i,b # 92);
  END LOOP;
  RETURN sha256(op || sha256(ip || p_data));
END; $$;
REVOKE ALL ON FUNCTION native_auth.hmac_sha256(bytea,bytea) FROM PUBLIC,mt_auth_access,mt_runtime;

CREATE FUNCTION native_auth.guard_verified_write() RETURNS trigger
LANGUAGE plpgsql SET search_path=pg_catalog AS $$
BEGIN
  IF current_user<>'mt_auth_owner' AND ((TG_OP='INSERT' AND NEW."emailVerified")
    OR (TG_OP='UPDATE' AND NEW."emailVerified" IS DISTINCT FROM OLD."emailVerified"))
    THEN RAISE EXCEPTION 'email_verification_required'; END IF;
  RETURN NEW;
END; $$;
REVOKE ALL ON FUNCTION native_auth.guard_verified_write() FROM PUBLIC;
CREATE TRIGGER guard_verified_write BEFORE INSERT OR UPDATE ON native_auth."user"
FOR EACH ROW EXECUTE FUNCTION native_auth.guard_verified_write();

CREATE FUNCTION native_auth.email_verification_payload(p_envelope text,p_signature text,p_purpose text) RETURNS jsonb
LANGUAGE plpgsql SET search_path=pg_catalog AS $$
DECLARE p jsonb; k native_auth.email_verification_key%ROWTYPE; u uuid;
  mac bytea; supplied bytea; difference integer:=0; i integer;
  issued bigint; expiry bigint; issuance_epoch bigint; now_epoch bigint:=extract(epoch FROM clock_timestamp())::bigint;
BEGIN
  IF p_envelope IS NULL OR octet_length(p_envelope)>4096 OR p_signature IS NULL OR p_signature !~ '^[0-9a-f]{64}$'
    THEN RAISE EXCEPTION 'email_verification_rejected'; END IF;
  SELECT * INTO k FROM native_auth.email_verification_key WHERE singleton FOR SHARE;
  IF NOT FOUND OR NOT EXISTS(SELECT FROM native_auth.email_verification_epoch WHERE singleton AND epoch=k.epoch AND key_hash=sha256(k.key))
    THEN RAISE EXCEPTION 'email_verification_rejected'; END IF;
  mac:=native_auth.hmac_sha256(k.key,convert_to(p_envelope,'UTF8')); supplied:=decode(p_signature,'hex');
  FOR i IN 0..31 LOOP difference:=difference | (get_byte(mac,i) # get_byte(supplied,i)); END LOOP;
  IF difference<>0 THEN RAISE EXCEPTION 'email_verification_rejected'; END IF;
  p:=p_envelope::jsonb;
  IF jsonb_typeof(p) IS DISTINCT FROM 'array' OR jsonb_array_length(p)<>8
    OR p->>0 IS DISTINCT FROM '1' OR p->>3 IS DISTINCT FROM p_purpose
    OR p->>7 IS NULL OR (p->>7) !~ '^[0-9a-f]{64}$'
    OR jsonb_typeof(p->1) IS DISTINCT FROM 'string' OR jsonb_typeof(p->2) IS DISTINCT FROM 'string'
    OR jsonb_typeof(p->4) IS DISTINCT FROM 'number' OR jsonb_typeof(p->5) IS DISTINCT FROM 'number'
    OR jsonb_typeof(p->6) IS DISTINCT FROM 'number'
    THEN RAISE EXCEPTION 'email_verification_rejected'; END IF;
  u:=(p->>1)::uuid; issued:=(p->>4)::bigint; expiry:=(p->>5)::bigint; issuance_epoch:=(p->>6)::bigint;
  IF u IS NULL OR issued IS NULL OR expiry IS NULL OR issuance_epoch IS DISTINCT FROM k.epoch OR issued<issuance_epoch
    OR issued>now_epoch OR expiry<=now_epoch OR expiry<=issued OR expiry-issued>3600
    THEN RAISE EXCEPTION 'email_verification_rejected'; END IF;
  RETURN p;
END; $$;
REVOKE ALL ON FUNCTION native_auth.email_verification_payload(text,text,text) FROM PUBLIC,mt_auth_access,mt_runtime;

CREATE FUNCTION native_auth.register_email_verification(p_envelope text,p_signature text) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE p jsonb; u uuid;
BEGIN
  p:=native_auth.email_verification_payload(p_envelope,p_signature,'email-verification-issue'); u:=(p->>1)::uuid;
  PERFORM app.assert_account_write(ARRAY[u]);
  PERFORM 1 FROM native_auth."user" WHERE id=u AND email=p->>2 AND NOT "emailVerified"
    AND date_trunc('second',"createdAt")<=to_timestamp((p->>4)::bigint) FOR SHARE;
  IF NOT FOUND OR EXISTS(SELECT FROM native_auth.email_verification_replay WHERE replay=p->>7)
    THEN RAISE EXCEPTION 'email_verification_rejected'; END IF;
  INSERT INTO native_auth.email_verification_issuance(replay,user_id,epoch,issued,expiry)
    VALUES(p->>7,u,(p->>6)::bigint,(p->>4)::bigint,(p->>5)::bigint)
    ON CONFLICT(replay) DO UPDATE SET replay=excluded.replay
      WHERE email_verification_issuance.user_id=excluded.user_id AND email_verification_issuance.epoch=excluded.epoch
        AND email_verification_issuance.issued=excluded.issued AND email_verification_issuance.expiry=excluded.expiry;
  IF NOT FOUND THEN RAISE EXCEPTION 'email_verification_rejected'; END IF;
END; $$;
REVOKE ALL ON FUNCTION native_auth.register_email_verification(text,text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION native_auth.register_email_verification(text,text) TO mt_auth_access;

CREATE FUNCTION native_auth.verify_email(p_envelope text,p_signature text) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE p jsonb; u uuid;
BEGIN
  p:=native_auth.email_verification_payload(p_envelope,p_signature,'email-verification'); u:=(p->>1)::uuid;
  -- Row lock serializes concurrent verification and deletion. Existing UPDATE
  -- guard obtains freeze/lifecycle locks; any failure rolls back the receipt.
  PERFORM 1 FROM native_auth."user" WHERE id=u AND email=p->>2 AND NOT "emailVerified" FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'email_verification_rejected'; END IF;
  DELETE FROM native_auth.email_verification_issuance WHERE replay=p->>7 AND user_id=u
    AND epoch=(p->>6)::bigint AND issued=(p->>4)::bigint AND expiry=(p->>5)::bigint;
  IF NOT FOUND THEN RAISE EXCEPTION 'email_verification_rejected'; END IF;
  INSERT INTO native_auth.email_verification_replay(replay,expires_at) VALUES(p->>7,to_timestamp((p->>5)::bigint));
  UPDATE native_auth."user" SET "emailVerified"=true,"updatedAt"=clock_timestamp() WHERE id=u;
END; $$;
REVOKE ALL ON FUNCTION native_auth.verify_email(text,text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION native_auth.verify_email(text,text) TO mt_auth_access;
RESET ROLE;
COMMIT;
