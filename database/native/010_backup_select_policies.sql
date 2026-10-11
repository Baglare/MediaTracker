-- Additive read-only backup coverage. No runtime grants or RLS/ownership changes.
-- Local installations without a separately provisioned backup login do not use it.
BEGIN;
SET LOCAL ROLE mt_owner;
DO $backup$ DECLARE t record; BEGIN
  IF to_regrole('mt_backup') IS NOT NULL THEN
    GRANT USAGE ON SCHEMA app,private_privacy_ops TO mt_backup;
    REVOKE EXECUTE ON FUNCTION app.set_release_freeze(boolean,bigint) FROM mt_backup;
    GRANT SELECT ON ALL TABLES IN SCHEMA app,private_privacy_ops TO mt_backup;
    GRANT SELECT ON ALL SEQUENCES IN SCHEMA app,private_privacy_ops TO mt_backup;
    FOR t IN SELECT c.oid,n.nspname,c.relname FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
      WHERE n.nspname IN ('app','private_privacy_ops') AND c.relkind IN ('r','p') AND c.relrowsecurity LOOP
      IF EXISTS(SELECT FROM pg_policy p WHERE p.polrelid=t.oid AND NOT p.polpermissive
        AND p.polcmd IN ('r','*') AND EXISTS(SELECT FROM unnest(p.polroles) role_id
          WHERE role_id=0 OR pg_has_role('mt_backup',role_id,'USAGE'))) THEN
        RAISE EXCEPTION 'native_backup_restrictive_policy';
      END IF;
      EXECUTE format('CREATE POLICY native_backup_select ON %I.%I FOR SELECT TO %I USING (current_user=%L AND session_user=%L)',t.nspname,t.relname,'mt_backup','mt_backup','mt_backup');
    END LOOP;
  END IF;
END; $backup$;
RESET ROLE;
SET LOCAL ROLE mt_auth_owner;
DO $backup$ DECLARE t record; BEGIN
  IF to_regrole('mt_backup') IS NOT NULL THEN
    GRANT USAGE ON SCHEMA native_auth TO mt_backup;
    GRANT SELECT ON ALL TABLES IN SCHEMA native_auth TO mt_backup;
    GRANT SELECT ON ALL SEQUENCES IN SCHEMA native_auth TO mt_backup;
    FOR t IN SELECT c.oid,n.nspname,c.relname FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
      WHERE n.nspname='native_auth' AND c.relkind IN ('r','p') AND c.relrowsecurity LOOP
      IF EXISTS(SELECT FROM pg_policy p WHERE p.polrelid=t.oid AND NOT p.polpermissive
        AND p.polcmd IN ('r','*') AND EXISTS(SELECT FROM unnest(p.polroles) role_id
          WHERE role_id=0 OR pg_has_role('mt_backup',role_id,'USAGE'))) THEN
        RAISE EXCEPTION 'native_backup_restrictive_policy';
      END IF;
      EXECUTE format('CREATE POLICY native_backup_select ON %I.%I FOR SELECT TO %I USING (current_user=%L AND session_user=%L)',t.nspname,t.relname,'mt_backup','mt_backup','mt_backup');
    END LOOP;
  END IF;
END; $backup$;
RESET ROLE;
SET LOCAL ROLE mt_limiter;
DO $backup$ DECLARE t record; BEGIN
  IF to_regrole('mt_backup') IS NOT NULL THEN
    GRANT USAGE ON SCHEMA private_rate_limit TO mt_backup;
    GRANT SELECT ON ALL TABLES IN SCHEMA private_rate_limit TO mt_backup;
    GRANT SELECT ON ALL SEQUENCES IN SCHEMA private_rate_limit TO mt_backup;
    FOR t IN SELECT c.oid,n.nspname,c.relname FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
      WHERE n.nspname='private_rate_limit' AND c.relkind IN ('r','p') AND c.relrowsecurity LOOP
      IF EXISTS(SELECT FROM pg_policy p WHERE p.polrelid=t.oid AND NOT p.polpermissive
        AND p.polcmd IN ('r','*') AND EXISTS(SELECT FROM unnest(p.polroles) role_id
          WHERE role_id=0 OR pg_has_role('mt_backup',role_id,'USAGE'))) THEN
        RAISE EXCEPTION 'native_backup_restrictive_policy';
      END IF;
      EXECUTE format('CREATE POLICY native_backup_select ON %I.%I FOR SELECT TO %I USING (current_user=%L AND session_user=%L)',t.nspname,t.relname,'mt_backup','mt_backup','mt_backup');
    END LOOP;
  END IF;
END; $backup$;
RESET ROLE;
COMMIT;
