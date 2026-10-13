-- Additive, native-only public search admission. Historical limiter policies,
-- quotas, signatures and user/IP RPCs remain unchanged. No browser identity.
BEGIN;
SET LOCAL ROLE mt_owner;
GRANT CREATE ON SCHEMA app TO mt_limiter;
RESET ROLE;
SET LOCAL ROLE mt_limiter;

CREATE TABLE private_rate_limit.tvmaze_guest_pool (
  singleton boolean PRIMARY KEY CHECK(singleton),
  next_attempt_at timestamptz NOT NULL DEFAULT '-infinity',
  daily_epoch bigint NOT NULL DEFAULT 0,
  daily_attempts integer NOT NULL DEFAULT 0 CHECK(daily_attempts BETWEEN 0 AND 500),
  admitted_total bigint NOT NULL DEFAULT 0 CHECK(admitted_total>=0)
);
INSERT INTO private_rate_limit.tvmaze_guest_pool(singleton) VALUES(true);
ALTER TABLE private_rate_limit.tvmaze_guest_pool ENABLE ROW LEVEL SECURITY;
ALTER TABLE private_rate_limit.tvmaze_guest_pool FORCE ROW LEVEL SECURITY;
CREATE POLICY limiter_internal ON private_rate_limit.tvmaze_guest_pool TO mt_limiter
  USING(current_user='mt_limiter') WITH CHECK(current_user='mt_limiter');
REVOKE ALL ON private_rate_limit.tvmaze_guest_pool FROM PUBLIC,mt_runtime;
DO $backup$ BEGIN
  IF to_regrole('mt_backup') IS NOT NULL THEN
    GRANT SELECT ON private_rate_limit.tvmaze_guest_pool TO mt_backup;
    CREATE POLICY native_backup_select ON private_rate_limit.tvmaze_guest_pool FOR SELECT TO mt_backup
      USING(current_user='mt_backup' AND session_user='mt_backup');
  END IF;
END; $backup$;

-- HMAC is verified by the native adapter before this runtime-only transport.
-- SQL independently restricts the envelope, session and the fixed shared pool.
CREATE FUNCTION app.tvmaze_guest_rate_limit_v1(p_envelope text,p_signature_hex text) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' SET statement_timeout='500ms' SET lock_timeout='100ms' AS $$
DECLARE e jsonb; s jsonb; v_now timestamptz; v_seconds bigint; v_day bigint;
  pool private_rate_limit.tvmaze_guest_pool%rowtype; g private_rate_limit.global_state%rowtype;
  v_wait integer:=0; v_tokens numeric; v_result jsonb; v_subjects jsonb;
BEGIN
  IF p_envelope IS NULL OR octet_length(p_envelope)>2048 OR p_signature_hex IS NULL
    OR p_signature_hex !~ '^[0-9a-f]{64}$' THEN RAISE EXCEPTION 'rate_limit_proof_invalid'; END IF;
  e:=p_envelope::jsonb;
  v_now:=clock_timestamp(); v_seconds:=floor(extract(epoch FROM v_now)); v_day:=floor(v_seconds/86400.0);
  IF jsonb_typeof(e)<>'object' OR (SELECT count(*) FROM jsonb_object_keys(e))<>13
    OR e-ARRAY['version','operation','audience','key_version','policy_id','identity_class','subjects','ingress','nonce','issued_at','expires_at','cost','cooldown']<>'{}'::jsonb
    OR EXISTS(SELECT FROM jsonb_each(e) WHERE value='null'::jsonb)
    OR EXISTS(SELECT FROM jsonb_each(e) WHERE key IN ('version','issued_at','expires_at','cost','cooldown') AND (jsonb_typeof(value)<>'number' OR value::text !~ '^[0-9]{1,12}$'))
    OR EXISTS(SELECT FROM jsonb_each(e) WHERE key IN ('operation','audience','key_version','policy_id','identity_class','nonce') AND jsonb_typeof(value)<>'string')
    OR session_user<>'mt_runtime' OR nullif(current_setting('app.user_id',true),'') IS NOT NULL
    OR e->>'audience' IS DISTINCT FROM current_setting('app.limiter_audience',true)
    OR e->>'key_version' IS DISTINCT FROM current_setting('app.limiter_key_version',true)
    OR e->>'version'<>'1' OR e->>'identity_class'<>'guest_pool' OR e->>'policy_id'<>'tvmaze_search'
    OR e->>'operation' NOT IN ('consume','cooldown') OR e->>'cost'<>'1'
    OR NOT EXISTS(SELECT FROM private_rate_limit.policies WHERE policy_id='tvmaze_search' AND enabled AND cost=1 AND scope='search')
    OR (e->>'issued_at')::bigint>v_seconds+5 OR (e->>'issued_at')::bigint<v_seconds-15
    OR (e->>'expires_at')::bigint<v_seconds-5 OR (e->>'expires_at')::bigint-(e->>'issued_at')::bigint NOT BETWEEN 1 AND 10
    OR e->>'nonce' !~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
    OR jsonb_typeof(e->'subjects')<>'array' OR jsonb_array_length(e->'subjects') NOT BETWEEN 1 AND 4
    OR e->'ingress'<>'[]'::jsonb
    OR (e->>'cooldown')::integer NOT BETWEEN 0 AND 86400
    OR (e->>'operation'='consume' AND e->>'cooldown'<>'0')
    OR (e->>'operation'='cooldown' AND (e->>'cooldown')::integer<1)
    THEN RAISE EXCEPTION 'rate_limit_proof_invalid'; END IF;
  FOR s IN SELECT value FROM jsonb_array_elements(e->'subjects') LOOP
    IF jsonb_typeof(s)<>'object' OR (SELECT count(*) FROM jsonb_object_keys(s))<>2 OR s-ARRAY['epoch','digest']<>'{}'::jsonb
      OR jsonb_typeof(s->'digest')<>'string' OR jsonb_typeof(s->'epoch')<>'number'
      OR s->>'epoch' !~ '^[0-9]{1,6}$' OR s->>'digest' !~ '^[0-9a-f]{64}$'
      OR (s->>'epoch')::bigint NOT IN (v_day,v_day-1)
      OR ((s->>'epoch')::bigint=v_day-1 AND v_seconds%86400>65) THEN RAISE EXCEPTION 'rate_limit_proof_invalid'; END IF;
  END LOOP;
  IF NOT EXISTS(SELECT FROM jsonb_array_elements(e->'subjects') AS subject_row(value) WHERE (subject_row.value->>'epoch')::bigint=v_day)
    OR (SELECT count(DISTINCT value) FROM jsonb_array_elements(e->'subjects'))<>jsonb_array_length(e->'subjects')
    THEN RAISE EXCEPTION 'rate_limit_proof_invalid'; END IF;
  -- Same lock as reserve_v1: all guest and authenticated budgets are serialized.
  PERFORM pg_catalog.pg_advisory_xact_lock(207402,1);
  IF EXISTS(SELECT FROM private_rate_limit.request_receipts WHERE nonce=(e->>'nonce')::uuid) THEN
    RETURN jsonb_build_object('allowed',false,'reason','replay','retry_after_seconds',5);
  END IF;
  SELECT * INTO STRICT pool FROM private_rate_limit.tvmaze_guest_pool WHERE singleton FOR UPDATE;
  -- Never use envelope digests as independently renewable anonymous quotas.
  v_subjects:=jsonb_build_array(jsonb_build_object('epoch',v_day,'digest',encode(pg_catalog.sha256(convert_to('tvmaze:shared-guest-search:v1','UTF8')),'hex')));
  IF e->>'operation'='cooldown' THEN
    RETURN private_rate_limit.reserve_v1('tvmaze_search',v_subjects,'[]'::jsonb,(e->>'nonce')::uuid,
      pg_catalog.sha256(convert_to(p_envelope,'UTF8')),(e->>'cooldown')::integer);
  END IF;
  IF pool.next_attempt_at>v_now THEN v_wait:=ceil(extract(epoch FROM pool.next_attempt_at-v_now)); END IF;
  IF pool.daily_epoch=v_day AND pool.daily_attempts>=500 THEN
    v_wait:=greatest(v_wait,ceil((v_day+1)*86400-extract(epoch FROM v_now))::integer);
  END IF;
  IF v_wait>0 THEN RETURN jsonb_build_object('allowed',false,'reason','limited','retry_after_seconds',least(86400,greatest(1,v_wait))); END IF;
  -- Throttle attempts before reserve_v1 creates a receipt, including denials.
  UPDATE private_rate_limit.tvmaze_guest_pool SET next_attempt_at=v_now+interval '10 seconds',daily_epoch=v_day,
    daily_attempts=CASE WHEN daily_epoch=v_day THEN daily_attempts+1 ELSE 1 END WHERE singleton;
  IF (SELECT count(*) FROM private_rate_limit.global_state WHERE policy_id IN ('dynamic','tvmaze'))<>2 THEN
    RAISE EXCEPTION 'rate_limit_unavailable';
  END IF;
  FOR g IN SELECT * FROM private_rate_limit.global_state WHERE policy_id IN ('dynamic','tvmaze') ORDER BY policy_id FOR UPDATE LOOP
    v_tokens:=least(g.capacity,g.tokens+greatest(0,extract(epoch FROM v_now-g.refilled_at))*g.refill_rate);
    -- Leave at least one token for non-guest work; retain every existing budget.
    IF v_tokens<2 THEN v_wait:=greatest(v_wait,ceil((2-v_tokens)/g.refill_rate)::integer); END IF;
  END LOOP;
  IF v_wait>0 THEN RETURN jsonb_build_object('allowed',false,'reason','limited','retry_after_seconds',greatest(10,v_wait)); END IF;
  v_result:=private_rate_limit.reserve_v1('tvmaze_search',v_subjects,'[]'::jsonb,(e->>'nonce')::uuid,pg_catalog.sha256(convert_to(p_envelope,'UTF8')));
  IF (v_result->>'allowed')::boolean THEN
    UPDATE private_rate_limit.tvmaze_guest_pool SET admitted_total=admitted_total+1 WHERE singleton;
  END IF;
  RETURN v_result;
END; $$;
REVOKE ALL ON FUNCTION app.tvmaze_guest_rate_limit_v1(text,text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION app.tvmaze_guest_rate_limit_v1(text,text) TO mt_runtime;
RESET ROLE;
SET LOCAL ROLE mt_owner;
REVOKE CREATE ON SCHEMA app FROM mt_limiter;
RESET ROLE;
COMMIT;
