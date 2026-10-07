-- Native lifecycle admission. Operator membership must be provisioned separately.
-- Runtime cannot transition state, create/delete identities, or restore a UUID.
BEGIN;
SET LOCAL ROLE mt_auth_owner;
GRANT USAGE ON SCHEMA native_auth TO mt_owner;
GRANT REFERENCES ON native_auth."user" TO mt_owner;
GRANT DELETE ON native_auth.session TO mt_owner;
REVOKE INSERT, UPDATE, DELETE ON native_auth."user" FROM mt_auth_access;
GRANT UPDATE(name,image,"updatedAt") ON native_auth."user" TO mt_auth_access;
RESET ROLE;
SET LOCAL ROLE mt_owner;
CREATE TABLE app.release_write_state (
  singleton boolean PRIMARY KEY DEFAULT true CHECK(singleton),
  frozen boolean NOT NULL DEFAULT false,
  revision bigint NOT NULL DEFAULT 0 CHECK(revision>=0)
);
INSERT INTO app.release_write_state(singleton) VALUES(true);
ALTER TABLE app.release_write_state ENABLE ROW LEVEL SECURITY;
ALTER TABLE app.release_write_state FORCE ROW LEVEL SECURITY;
CREATE POLICY release_internal ON app.release_write_state TO mt_owner
USING(current_user='mt_owner') WITH CHECK(current_user='mt_owner');
CREATE FUNCTION app.assert_release_write() RETURNS void
LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE v_frozen boolean;
BEGIN
  SELECT frozen INTO v_frozen FROM app.release_write_state WHERE singleton FOR SHARE;
  IF NOT FOUND OR v_frozen THEN RAISE EXCEPTION USING ERRCODE='P0001',MESSAGE='account_write_locked'; END IF;
END; $$;
CREATE FUNCTION app.guard_release_write() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
BEGIN PERFORM app.assert_release_write(); RETURN NULL; END; $$;
CREATE FUNCTION app.set_release_freeze(p_frozen boolean,p_revision bigint) RETURNS bigint
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE v_revision bigint;
BEGIN
  IF session_user='mt_runtime' OR NOT pg_has_role(session_user,'mt_privacy_operator','MEMBER')
    OR p_frozen IS NULL OR p_revision IS NULL THEN RAISE EXCEPTION 'release_ops_denied'; END IF;
  UPDATE app.release_write_state SET frozen=p_frozen,revision=revision+1
    WHERE singleton AND revision=p_revision RETURNING revision INTO v_revision;
  IF NOT FOUND THEN RAISE EXCEPTION 'release_state_conflict'; END IF;
  RETURN v_revision;
END; $$;
CREATE TABLE app.account_lifecycle (
  user_id uuid PRIMARY KEY REFERENCES native_auth."user"(id) ON DELETE CASCADE,
  state text NOT NULL DEFAULT 'ACTIVE' CHECK(state IN ('ACTIVE','ERASURE_PENDING','ERASING')),
  destructive_started boolean NOT NULL DEFAULT false,
  erasure_context jsonb NOT NULL DEFAULT '{}'::jsonb,
  CHECK(NOT destructive_started OR state='ERASING')
);
ALTER TABLE app.account_lifecycle ENABLE ROW LEVEL SECURITY;
ALTER TABLE app.account_lifecycle FORCE ROW LEVEL SECURITY;
-- Only the non-login function owner can operate on participant lifecycle rows.
-- mt_runtime has no membership, state write grant or executable transition.
CREATE POLICY lifecycle_internal ON app.account_lifecycle TO mt_owner
USING(current_user='mt_owner') WITH CHECK(current_user='mt_owner');
CREATE POLICY lifecycle_read_own ON app.account_lifecycle FOR SELECT TO mt_runtime
USING(user_id=app.current_user_id());
GRANT SELECT ON app.account_lifecycle TO mt_runtime;
CREATE TRIGGER release_admission BEFORE INSERT OR UPDATE OR DELETE OR TRUNCATE ON app.account_lifecycle
FOR EACH STATEMENT EXECUTE FUNCTION app.guard_release_write();

CREATE FUNCTION app.assert_account_write(p_users uuid[]) RETURNS void
LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE v_user uuid; v_state text;
BEGIN
  PERFORM app.assert_release_write();
  FOR v_user IN SELECT DISTINCT u FROM unnest(p_users) u WHERE u IS NOT NULL ORDER BY u LOOP
    SELECT state INTO v_state FROM app.account_lifecycle WHERE user_id=v_user FOR SHARE;
    IF NOT FOUND OR v_state<>'ACTIVE' THEN
      RAISE EXCEPTION USING ERRCODE='P0001',MESSAGE='account_write_locked';
    END IF;
  END LOOP;
END; $$;
CREATE FUNCTION app.guard_account_write() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
BEGIN
  IF TG_OP='DELETE' THEN PERFORM app.assert_account_write(ARRAY[OLD.user_id]); RETURN OLD;
  ELSIF TG_OP='UPDATE' THEN PERFORM app.assert_account_write(ARRAY[OLD.user_id,NEW.user_id]); RETURN NEW;
  ELSE PERFORM app.assert_account_write(ARRAY[NEW.user_id]); RETURN NEW; END IF;
END; $$;
CREATE FUNCTION app.initialize_account() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
BEGIN
  INSERT INTO app.account_lifecycle(user_id) VALUES(NEW.id);
  RETURN NEW;
END; $$;
CREATE FUNCTION app.guard_auth_admission() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
BEGIN
  IF TG_TABLE_NAME='user' THEN PERFORM app.assert_account_write(ARRAY[OLD.id]);
  ELSE PERFORM app.assert_account_write(ARRAY[NEW."userId"]); END IF;
  RETURN NEW;
END; $$;
CREATE FUNCTION app.transition_account(p_user uuid,p_state text,p_confirmation text) RETURNS text
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE v_row app.account_lifecycle%ROWTYPE;
BEGIN
  IF session_user='mt_runtime' OR NOT pg_has_role(session_user,'mt_privacy_operator','MEMBER')
    OR p_confirmation IS DISTINCT FROM 'PRIVACY '||p_user::text
    THEN RAISE EXCEPTION 'privacy_ops_denied'; END IF;
  SELECT * INTO v_row FROM app.account_lifecycle WHERE user_id=p_user FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'privacy_target_absent'; END IF;
  IF p_state='ACTIVE' THEN
    IF v_row.state<>'ERASURE_PENDING' OR v_row.destructive_started THEN RAISE EXCEPTION 'privacy_unlock_denied'; END IF;
  ELSIF p_state='ERASURE_PENDING' THEN
    IF v_row.state='ERASING' THEN RETURN v_row.state; END IF;
  ELSIF p_state='ERASING' THEN
    IF v_row.state NOT IN ('ERASURE_PENDING','ERASING') THEN RAISE EXCEPTION 'privacy_transition_denied'; END IF;
  ELSE RAISE EXCEPTION 'privacy_transition_denied'; END IF;
  UPDATE app.account_lifecycle SET state=p_state WHERE user_id=p_user;
  IF p_state<>'ACTIVE' THEN DELETE FROM native_auth.session WHERE "userId"=p_user; END IF;
  RETURN p_state;
END; $$;
GRANT USAGE ON SCHEMA app TO mt_auth_owner,mt_privacy_operator;
GRANT EXECUTE ON FUNCTION app.initialize_account(),app.guard_auth_admission() TO mt_auth_owner;
GRANT EXECUTE ON FUNCTION app.transition_account(uuid,text,text) TO mt_privacy_operator;
GRANT EXECUTE ON FUNCTION app.set_release_freeze(boolean,bigint) TO mt_privacy_operator;
RESET ROLE;
SET LOCAL ROLE mt_auth_owner;
CREATE TRIGGER initialize_account AFTER INSERT ON native_auth."user"
FOR EACH ROW EXECUTE FUNCTION app.initialize_account();
CREATE TRIGGER guard_user_write BEFORE UPDATE ON native_auth."user"
FOR EACH ROW EXECUTE FUNCTION app.guard_auth_admission();
CREATE TRIGGER guard_session_write BEFORE INSERT OR UPDATE ON native_auth.session
FOR EACH ROW EXECUTE FUNCTION app.guard_auth_admission();
CREATE TRIGGER guard_credential_write BEFORE INSERT OR UPDATE ON native_auth.account
FOR EACH ROW EXECUTE FUNCTION app.guard_auth_admission();
RESET ROLE;
COMMIT;
-- Fresh bootstrap only: existing accounts are imported explicitly by P5 operators.
