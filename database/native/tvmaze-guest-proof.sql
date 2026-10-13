-- Disposable P2 proof only. All fixture mutations are rolled back; never production.
BEGIN;
CREATE FUNCTION pg_temp.guest_envelope(p_policy text DEFAULT 'tvmaze_search',p_operation text DEFAULT 'consume',p_digest text DEFAULT repeat('a',64)) RETURNS text
LANGUAGE sql AS $$ SELECT jsonb_build_object('version',1,'operation',p_operation,'audience','mt:guest-proof','key_version','v1',
  'policy_id',p_policy,'identity_class','guest_pool','subjects',jsonb_build_array(jsonb_build_object('epoch',floor(extract(epoch FROM clock_timestamp())/86400),'digest',p_digest)),
  'ingress','[]'::jsonb,'nonce',gen_random_uuid(),'issued_at',floor(extract(epoch FROM clock_timestamp())),
  'expires_at',floor(extract(epoch FROM clock_timestamp()))+10,'cost',1,'cooldown',CASE WHEN p_operation='cooldown' THEN 30 ELSE 0 END)::text $$;
GRANT USAGE ON SCHEMA pg_temp TO mt_runtime;
GRANT EXECUTE ON FUNCTION pg_temp.guest_envelope(text,text,text) TO mt_runtime;
UPDATE private_rate_limit.global_state SET tokens=capacity,refilled_at=clock_timestamp(),blocked_until='-infinity',disabled=false,daily_count=0,daily_epoch=0;
UPDATE private_rate_limit.tvmaze_guest_pool SET next_attempt_at='-infinity',daily_epoch=0,daily_attempts=0,admitted_total=0;
DELETE FROM private_rate_limit.request_receipts;
UPDATE private_rate_limit.capacity SET live_rows=0 WHERE table_kind='receipts';
SET SESSION AUTHORIZATION mt_runtime;
SELECT set_config('app.user_id','',true),set_config('app.limiter_audience','mt:guest-proof',true),set_config('app.limiter_key_version','v1',true);
DO $$ DECLARE e text:=pg_temp.guest_envelope(); r jsonb; BEGIN
  r:=app.tvmaze_guest_rate_limit_v1(e,repeat('0',64));
  IF r->>'allowed'<>'true' THEN RAISE EXCEPTION 'guest_admission_failed'; END IF;
  r:=app.tvmaze_guest_rate_limit_v1(e,repeat('0',64));
  IF r->>'reason'<>'replay' THEN RAISE EXCEPTION 'guest_replay_failed'; END IF;
  r:=app.tvmaze_guest_rate_limit_v1(pg_temp.guest_envelope('tvmaze_search','consume',repeat('b',64)),repeat('0',64));
  IF r->>'reason'<>'limited' OR (r->>'retry_after_seconds')::integer NOT BETWEEN 1 AND 10 THEN RAISE EXCEPTION 'guest_rotation_bypass'; END IF;
END $$;
RESET SESSION AUTHORIZATION;
DO $$ BEGIN
  IF (SELECT daily_attempts FROM private_rate_limit.tvmaze_guest_pool)<>1
    OR (SELECT admitted_total FROM private_rate_limit.tvmaze_guest_pool)<>1
    OR (SELECT tokens FROM private_rate_limit.global_state WHERE policy_id='tvmaze')<1
    OR (SELECT daily_count FROM private_rate_limit.global_state WHERE policy_id='dynamic')<>1
    OR (SELECT count(*) FROM private_rate_limit.request_receipts)<>1 THEN RAISE EXCEPTION 'guest_atomic_debit_failed'; END IF;
END $$;
-- Denied attempts do not allocate more receipts or consume user/global budgets.
UPDATE private_rate_limit.tvmaze_guest_pool SET next_attempt_at='-infinity';
UPDATE private_rate_limit.global_state SET tokens=0,refilled_at=clock_timestamp() WHERE policy_id='tvmaze';
SET SESSION AUTHORIZATION mt_runtime;
DO $$ DECLARE r jsonb; BEGIN
  r:=app.tvmaze_guest_rate_limit_v1(pg_temp.guest_envelope(),repeat('0',64));
  IF r->>'reason'<>'limited' THEN RAISE EXCEPTION 'guest_provider_reserve_failed'; END IF;
END $$;
RESET SESSION AUTHORIZATION;
DO $$ BEGIN
  IF (SELECT count(*) FROM private_rate_limit.request_receipts)<>1
    OR (SELECT daily_count FROM private_rate_limit.global_state WHERE policy_id='dynamic')<>1 THEN RAISE EXCEPTION 'guest_denial_allocated'; END IF;
END $$;
UPDATE private_rate_limit.tvmaze_guest_pool SET next_attempt_at='-infinity',daily_epoch=floor(extract(epoch FROM clock_timestamp())/86400),daily_attempts=500;
UPDATE private_rate_limit.global_state SET tokens=capacity,refilled_at=clock_timestamp();
SET SESSION AUTHORIZATION mt_runtime;
DO $$ DECLARE e jsonb; r jsonb; denied boolean; BEGIN
  r:=app.tvmaze_guest_rate_limit_v1(pg_temp.guest_envelope(),repeat('0',64));
  IF r->>'reason'<>'limited' THEN RAISE EXCEPTION 'guest_daily_cap_failed'; END IF;
  -- Authenticated work remains admitted when the anonymous daily pool is spent.
  PERFORM set_config('app.user_id','aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',true);
  e:=pg_temp.guest_envelope()::jsonb;
  denied:=false;
  BEGIN PERFORM app.tvmaze_guest_rate_limit_v1(e::text,repeat('0',64)); EXCEPTION WHEN OTHERS THEN denied:=true; END;
  IF NOT denied THEN RAISE EXCEPTION 'guest_authenticated_context_bypass'; END IF;
  e:=jsonb_set(e,'{identity_class}','"user"'::jsonb);
  r:=app.consume_application_rate_limit_v1(e::text,repeat('0',64));
  IF r->>'allowed'<>'true' THEN RAISE EXCEPTION 'guest_user_capacity_failed'; END IF;
  PERFORM set_config('app.user_id','',true);
  FOREACH e IN ARRAY ARRAY[pg_temp.guest_envelope('social_read')::jsonb,pg_temp.guest_envelope('tvmaze_details')::jsonb,
    pg_temp.guest_envelope('tvmaze_calendar')::jsonb,jsonb_set(pg_temp.guest_envelope()::jsonb,'{ingress}','[{"epoch":1,"digest":"forged"}]'::jsonb)] LOOP
    denied:=false;
    BEGIN PERFORM app.tvmaze_guest_rate_limit_v1(e::text,repeat('0',64)); EXCEPTION WHEN OTHERS THEN denied:=true; END;
    IF NOT denied THEN RAISE EXCEPTION 'guest_policy_or_ingress_bypass'; END IF;
  END LOOP;
  r:=app.tvmaze_guest_rate_limit_v1(pg_temp.guest_envelope('tvmaze_search','cooldown'),repeat('0',64));
  IF r->>'allowed'<>'true' THEN RAISE EXCEPTION 'guest_cooldown_failed'; END IF;
END $$;
RESET SESSION AUTHORIZATION;
DO $$ BEGIN
  IF (SELECT blocked_until FROM private_rate_limit.global_state WHERE policy_id='tvmaze')<=clock_timestamp()
    THEN RAISE EXCEPTION 'guest_cooldown_not_global'; END IF;
  IF has_table_privilege('mt_runtime','private_rate_limit.tvmaze_guest_pool','SELECT')
    OR has_table_privilege('mt_runtime','private_rate_limit.tvmaze_guest_pool','UPDATE')
    OR NOT (SELECT relrowsecurity AND relforcerowsecurity FROM pg_class WHERE oid='private_rate_limit.tvmaze_guest_pool'::regclass)
    THEN RAISE EXCEPTION 'guest_acl_failed'; END IF;
END $$;
ROLLBACK;
SELECT 'TVMAZE_GUEST_POOL_PROOF_PASS';
