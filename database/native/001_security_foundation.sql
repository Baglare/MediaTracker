-- Fresh native database only. Run as a provisioning operator with CREATEROLE
-- and database ownership, never as the web runtime. Existing roles fail closed.
BEGIN;
CREATE ROLE mt_owner NOLOGIN NOSUPERUSER NOBYPASSRLS NOCREATEDB NOCREATEROLE NOREPLICATION;
CREATE ROLE mt_auth_owner NOLOGIN NOSUPERUSER NOBYPASSRLS NOCREATEDB NOCREATEROLE NOREPLICATION;
CREATE ROLE mt_auth_access NOLOGIN NOSUPERUSER NOBYPASSRLS NOCREATEDB NOCREATEROLE NOREPLICATION;
CREATE ROLE mt_privacy_operator NOLOGIN NOSUPERUSER NOBYPASSRLS NOCREATEDB NOCREATEROLE NOREPLICATION;
CREATE ROLE mt_runtime LOGIN NOSUPERUSER NOBYPASSRLS NOCREATEDB NOCREATEROLE NOREPLICATION CONNECTION LIMIT 5;
-- Provision runtime password out-of-band; never put it into this file.
GRANT mt_auth_access TO mt_runtime;
-- Provisioning login owns migrations, not the web process. CREATEROLE alone
-- does not imply SET ROLE on modern PostgreSQL.
GRANT mt_owner, mt_auth_owner TO CURRENT_USER;
REVOKE CREATE ON SCHEMA public FROM PUBLIC;
DO $$ BEGIN
  EXECUTE format('REVOKE CREATE, TEMPORARY, CONNECT ON DATABASE %I FROM PUBLIC', current_database());
  EXECUTE format('GRANT CONNECT ON DATABASE %I TO mt_runtime', current_database());
END $$;
CREATE SCHEMA app AUTHORIZATION mt_owner;
CREATE SCHEMA native_auth AUTHORIZATION mt_auth_owner;
REVOKE ALL ON SCHEMA app, native_auth FROM PUBLIC;
GRANT USAGE ON SCHEMA app TO mt_runtime;
GRANT USAGE ON SCHEMA native_auth TO mt_auth_access;
ALTER ROLE mt_runtime SET search_path = native_auth, pg_catalog;
ALTER ROLE mt_runtime SET statement_timeout = '5s';
ALTER ROLE mt_runtime SET lock_timeout = '2s';
ALTER ROLE mt_runtime SET idle_in_transaction_session_timeout = '10s';
ALTER DEFAULT PRIVILEGES FOR ROLE mt_owner REVOKE EXECUTE ON FUNCTIONS FROM PUBLIC;
ALTER DEFAULT PRIVILEGES FOR ROLE mt_auth_owner REVOKE EXECUTE ON FUNCTIONS FROM PUBLIC;
SET LOCAL ROLE mt_owner;
CREATE FUNCTION app.current_user_id() RETURNS uuid
LANGUAGE sql STABLE SECURITY INVOKER SET search_path = pg_catalog
AS $$ SELECT NULLIF(current_setting('app.user_id', true), '')::uuid $$;
REVOKE ALL ON FUNCTION app.current_user_id() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION app.current_user_id() TO mt_runtime;
RESET ROLE;
COMMIT;
-- P2: explicitly grant each domain operation; ENABLE + FORCE RLS on protected
-- tables, USING / WITH CHECK against app.current_user_id(). No blanket grants.
-- No Supabase auth/users/Vault/service-role dependency. No privileged function
-- executable by PUBLIC. mt_privacy_operator intentionally has no access in P1.
