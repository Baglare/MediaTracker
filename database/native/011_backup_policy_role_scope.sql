-- Legacy social SELECT/ALL policies omitted TO and therefore applied to backup.
-- Preserve their expressions and effective owner/runtime behavior, without giving
-- backup EXECUTE on business functions or changing RLS/FORCE RLS.
BEGIN;
SET LOCAL ROLE mt_owner;
DO $scope$ DECLARE p record; BEGIN
  IF to_regrole('mt_backup') IS NOT NULL THEN
    FOR p IN SELECT pol.polname,c.oid,c.relname FROM pg_policy pol
      JOIN pg_class c ON c.oid=pol.polrelid JOIN pg_namespace n ON n.oid=c.relnamespace
      WHERE n.nspname='app' AND pol.polpermissive AND pol.polcmd IN ('r','*')
        AND pol.polroles=ARRAY[0::oid] LOOP
      -- Do not silently remove access belonging to an unexpected direct reader.
      IF EXISTS(SELECT FROM aclexplode(cast((SELECT relacl FROM pg_class WHERE oid=p.oid) AS aclitem[])) a
        WHERE a.privilege_type='SELECT' AND a.grantee NOT IN
          ('mt_owner'::regrole,'mt_runtime'::regrole,'mt_backup'::regrole)) THEN
        RAISE EXCEPTION 'native_backup_policy_reader_unexpected';
      END IF;
      EXECUTE format('ALTER POLICY %I ON app.%I TO %I,%I',p.polname,p.relname,'mt_owner','mt_runtime');
    END LOOP;
  END IF;
END; $scope$;
RESET ROLE;
COMMIT;
