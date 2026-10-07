\set ON_ERROR_STOP on
-- Disposable proof only. Transactional fixture; never a domain migration.
BEGIN;
SET LOCAL ROLE mt_owner;
CREATE TABLE app.p1_probe (id integer PRIMARY KEY, owner_id uuid NOT NULL, value text NOT NULL);
ALTER TABLE app.p1_probe ENABLE ROW LEVEL SECURITY;
ALTER TABLE app.p1_probe FORCE ROW LEVEL SECURITY;
CREATE POLICY owner_policy ON app.p1_probe TO mt_runtime
  USING (owner_id = app.current_user_id()) WITH CHECK (owner_id = app.current_user_id());
GRANT SELECT, INSERT, UPDATE, DELETE ON app.p1_probe TO mt_runtime;
RESET ROLE;
COMMIT;

SET ROLE mt_runtime;
BEGIN;
SELECT set_config('app.user_id', 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', true);
INSERT INTO app.p1_probe VALUES (1, app.current_user_id(), 'A');
DO $$ BEGIN
  IF (SELECT count(*) FROM app.p1_probe) <> 1 THEN RAISE EXCEPTION 'A select failed'; END IF;
  BEGIN
    INSERT INTO app.p1_probe VALUES (9, 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb', 'forged');
    RAISE EXCEPTION 'cross insert allowed';
  EXCEPTION WHEN insufficient_privilege THEN NULL; END;
  BEGIN
    UPDATE app.p1_probe SET owner_id = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb' WHERE id=1;
    RAISE EXCEPTION 'owner reassignment allowed';
  EXCEPTION WHEN insufficient_privilege THEN NULL; END;
END $$;
UPDATE app.p1_probe SET value='A-updated' WHERE id=1;
COMMIT;
-- Same physical connection, no identity after COMMIT.
DO $$ BEGIN
  IF app.current_user_id() IS NOT NULL OR (SELECT count(*) FROM app.p1_probe) <> 0 THEN RAISE EXCEPTION 'commit leaked identity'; END IF;
  BEGIN
    INSERT INTO app.p1_probe VALUES (8, 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', 'anonymous');
    RAISE EXCEPTION 'anonymous insert allowed';
  EXCEPTION WHEN insufficient_privilege THEN NULL; END;
END $$;
BEGIN;
SELECT set_config('app.user_id', 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb', true);
INSERT INTO app.p1_probe VALUES (2, app.current_user_id(), 'B');
DO $$ DECLARE affected integer; BEGIN
  IF (SELECT count(*) FROM app.p1_probe) <> 1 OR EXISTS(SELECT FROM app.p1_probe WHERE id=1)
    OR NOT EXISTS(SELECT FROM app.p1_probe WHERE id=2) THEN RAISE EXCEPTION 'B isolation failed'; END IF;
  UPDATE app.p1_probe SET value='forged' WHERE id=1;
  GET DIAGNOSTICS affected = ROW_COUNT;
  IF affected <> 0 THEN RAISE EXCEPTION 'cross update allowed'; END IF;
END $$;
COMMIT;
BEGIN;
SELECT set_config('app.user_id', 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', true);
UPDATE app.p1_probe SET value='rolled-back' WHERE id=1;
ROLLBACK;
DO $$ BEGIN
  IF app.current_user_id() IS NOT NULL THEN RAISE EXCEPTION 'rollback leaked identity'; END IF;
  IF EXISTS (SELECT FROM pg_roles WHERE rolname=current_user AND (rolsuper OR rolbypassrls OR rolcreaterole OR rolcreatedb)) THEN RAISE EXCEPTION 'unsafe runtime role'; END IF;
  IF pg_has_role(current_user,'mt_owner','MEMBER') OR pg_has_role(current_user,'mt_auth_owner','MEMBER')
    OR pg_has_role(current_user,'mt_privacy_operator','MEMBER') THEN RAISE EXCEPTION 'privileged membership'; END IF;
  IF has_schema_privilege(current_user,'app','CREATE') OR has_schema_privilege(current_user,'native_auth','CREATE')
    OR has_schema_privilege(current_user,'public','CREATE') THEN RAISE EXCEPTION 'schema creation allowed'; END IF;
END $$;
BEGIN;
SELECT set_config('app.user_id', 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', true);
DO $$ BEGIN
  IF (SELECT value FROM app.p1_probe WHERE id=1) <> 'A-updated' THEN RAISE EXCEPTION 'rollback failed'; END IF;
END $$;
COMMIT;
RESET ROLE;
SET ROLE mt_privacy_operator;
DO $$ BEGIN
  IF has_schema_privilege(current_user,'app','USAGE') THEN RAISE EXCEPTION 'operator access leaked'; END IF;
END $$;
RESET ROLE;
DROP TABLE app.p1_probe;
SELECT 'P1_RLS_PROOF_PASS';
