-- FORCE RLS also applies to the privacy functions' non-BYPASSRLS owner.
-- Keep runtime owner_scope unchanged. Only existing operator entry points may
-- inspect/delete Cloud rows without an application identity; their p_user
-- predicates retain target scope. No INSERT/UPDATE policy or privilege is added.
BEGIN;
SET LOCAL ROLE mt_owner;
DO $privacy$ DECLARE t text; command text; BEGIN
  FOREACH t IN ARRAY ARRAY['media_items','progress_logs','cloud_media_sync_operations','goals','goal_sync_operations'] LOOP
    FOREACH command IN ARRAY ARRAY['SELECT','DELETE'] LOOP
      EXECUTE format('CREATE POLICY %I ON app.%I FOR %s TO %I USING (
        current_user=%L AND session_user<>%L
        AND pg_has_role(session_user,%L,''MEMBER'')
        AND app.current_user_id() IS NULL)',
        'native_privacy_'||lower(command),t,command,
        'mt_owner','mt_owner','mt_runtime','mt_privacy_operator');
    END LOOP;
  END LOOP;
END; $privacy$;
RESET ROLE;
COMMIT;
