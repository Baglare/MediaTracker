-- Only the fresh runner-owned disposable database. No existing user/data target.
GRANT mt_privacy_operator TO CURRENT_USER;
SET ROLE mt_auth_owner;
INSERT INTO native_auth."user"(id,name,email) VALUES
('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa','Synthetic A','p2-a@example.invalid'),
('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb','Synthetic B','p2-b@example.invalid');
RESET ROLE;
SET ROLE mt_runtime;
BEGIN;
SELECT set_config('app.user_id','aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',true);
DO $$
DECLARE r jsonb; replay jsonb;
  payload jsonb := '{"title":"Synthetic","type":"movie","status":"planning","current_progress":0,"total_progress":1,"favorite":false,"tags":[],"metadata":{},"identity_status":"unresolved"}';
  goal jsonb := '{"id":"goal-a","title":"Synthetic goal","origin":"manual","lifecycle":"active","scope":{},"metric":{},"schedule":{},"createdAt":"2026-10-07T00:00:00Z","updatedAt":"2026-10-07T00:00:00Z"}';
BEGIN
  r:=app.apply_media_item_sync_operation('p2-create-media','shared-local-id','upsert',0,payload);
  IF r->>'reason'<>'created' OR (r->>'revision')::integer<>1 THEN RAISE EXCEPTION 'native_create_failed'; END IF;
  replay:=app.apply_media_item_sync_operation('p2-create-media','shared-local-id','upsert',0,payload);
  IF replay<>r THEN RAISE EXCEPTION 'native_receipt_failed'; END IF;
  r:=app.apply_media_item_sync_operation('p2-media-conflict','shared-local-id','delete',0,NULL);
  IF r->>'reason'<>'revision_mismatch' THEN RAISE EXCEPTION 'native_cas_failed'; END IF;
  r:=app.apply_cloud_goal_v1('cccccccc-cccc-4ccc-8ccc-cccccccccccc','goal-a',0,goal,false);
  IF r->>'status'<>'applied' OR (r->>'revision')::integer<>1 THEN RAISE EXCEPTION 'native_goal_failed'; END IF;
  replay:=app.apply_cloud_goal_v1('cccccccc-cccc-4ccc-8ccc-cccccccccccc','goal-a',0,goal,false);
  IF replay->>'status'<>'idempotent_replay' THEN RAISE EXCEPTION 'native_goal_receipt_failed'; END IF;
  IF has_table_privilege(current_user,'native_auth."user"','DELETE')
    OR has_table_privilege(current_user,'native_auth."user"','INSERT')
    OR has_function_privilege(current_user,'app.transition_account(uuid,text,text)','EXECUTE')
    OR has_function_privilege(current_user,'app.set_release_freeze(boolean,bigint)','EXECUTE') THEN
    RAISE EXCEPTION 'native_operator_authority_leaked';
  END IF;
END; $$;
COMMIT;
BEGIN;
SELECT set_config('app.user_id','bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',true);
DO $$ BEGIN
  IF EXISTS(SELECT FROM app.media_items) OR EXISTS(SELECT FROM app.goals) THEN RAISE EXCEPTION 'cross_owner_read'; END IF;
END; $$;
COMMIT;
BEGIN;
SELECT set_config('app.user_id','',true);
DO $$ BEGIN
  IF EXISTS(SELECT FROM app.media_items) OR EXISTS(SELECT FROM app.goals) THEN RAISE EXCEPTION 'anonymous_read'; END IF;
END; $$;
COMMIT;
RESET ROLE;
SELECT app.transition_account('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa','ERASURE_PENDING','PRIVACY aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa');
SET ROLE mt_runtime;
BEGIN;
SELECT set_config('app.user_id','aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',true);
DO $$ BEGIN
  BEGIN
    PERFORM app.apply_media_item_sync_operation('p2-after-barrier','shared-local-id','delete',1,NULL);
    RAISE EXCEPTION 'native_barrier_bypassed';
  EXCEPTION WHEN SQLSTATE 'P0001' THEN
    IF SQLERRM<>'account_write_locked' THEN RAISE; END IF;
  END;
END; $$;
ROLLBACK;
RESET ROLE;
SELECT 'P2_CLOUD_GOALS_PROOF_PASS';
