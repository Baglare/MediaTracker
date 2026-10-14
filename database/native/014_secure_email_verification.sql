-- No extension, login, embedded secret, or runtime verified-write grant.
BEGIN;
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
  user_id uuid NOT NULL REFERENCES native_auth."user"(id) ON DELETE CASCADE,
  expires_at timestamptz NOT NULL
);
-- Non-secret restore pin. Secret bytes are deliberately never dumped.
CREATE TABLE native_auth.email_verification_epoch (
  singleton boolean PRIMARY KEY DEFAULT true CHECK(singleton),
  epoch bigint NOT NULL CHECK(epoch>0), key_hash bytea NOT NULL CHECK(octet_length(key_hash)=32)
);
REVOKE ALL ON native_auth.email_verification_key,native_auth.email_verification_replay FROM PUBLIC,mt_auth_access,mt_runtime;
REVOKE ALL ON native_auth.email_verification_epoch FROM PUBLIC,mt_auth_access,mt_runtime;
DO $backup$ BEGIN
  IF to_regrole('mt_backup') IS NOT NULL THEN
    REVOKE ALL ON native_auth.email_verification_key FROM mt_backup;
    -- Schema dump locking needs SELECT, but FORCE RLS exposes zero key rows.
    GRANT SELECT ON native_auth.email_verification_key TO mt_backup;
    GRANT SELECT ON native_auth.email_verification_replay,native_auth.email_verification_epoch TO mt_backup;
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

CREATE FUNCTION native_auth.verify_email(p_envelope text,p_signature text) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE p jsonb; k native_auth.email_verification_key%ROWTYPE; u uuid;
  mac bytea; supplied bytea; difference integer:=0; i integer;
  issued bigint; expiry bigint; epoch bigint; replay_id text; now_epoch bigint:=extract(epoch FROM clock_timestamp())::bigint;
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
    OR p->>0 IS DISTINCT FROM '1' OR p->>3 IS DISTINCT FROM 'email-verification'
    OR p->>7 IS NULL OR (p->>7) !~ '^[0-9a-f]{64}$'
    OR jsonb_typeof(p->1) IS DISTINCT FROM 'string' OR jsonb_typeof(p->2) IS DISTINCT FROM 'string'
    OR jsonb_typeof(p->4) IS DISTINCT FROM 'number' OR jsonb_typeof(p->5) IS DISTINCT FROM 'number'
    OR jsonb_typeof(p->6) IS DISTINCT FROM 'number'
    THEN RAISE EXCEPTION 'email_verification_rejected'; END IF;
  u:=(p->>1)::uuid; issued:=(p->>4)::bigint; expiry:=(p->>5)::bigint; epoch:=(p->>6)::bigint; replay_id:=p->>7;
  IF u IS NULL OR issued IS NULL OR expiry IS NULL OR epoch IS DISTINCT FROM k.epoch OR issued<epoch
    OR issued>now_epoch OR expiry<=now_epoch OR expiry<=issued OR expiry-issued>3600
    THEN RAISE EXCEPTION 'email_verification_rejected'; END IF;
  -- Row lock serializes concurrent verification and deletion. Existing UPDATE
  -- guard obtains freeze/lifecycle locks; any failure rolls back the receipt.
  PERFORM 1 FROM native_auth."user" WHERE id=u AND email=p->>2 AND NOT "emailVerified" FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'email_verification_rejected'; END IF;
  INSERT INTO native_auth.email_verification_replay(replay,user_id,expires_at)
    VALUES(replay_id,u,to_timestamp(expiry));
  UPDATE native_auth."user" SET "emailVerified"=true,"updatedAt"=clock_timestamp() WHERE id=u;
END; $$;
REVOKE ALL ON FUNCTION native_auth.verify_email(text,text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION native_auth.verify_email(text,text) TO mt_auth_access;
RESET ROLE;
COMMIT;
