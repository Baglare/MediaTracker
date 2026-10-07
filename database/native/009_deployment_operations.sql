-- Additive P3 operator/readiness helpers. Never run automatically at startup.
BEGIN;
GRANT USAGE ON SCHEMA native_migrations TO mt_owner,mt_privacy_operator;
GRANT SELECT ON native_migrations.ledger TO mt_owner,mt_privacy_operator;
SET LOCAL ROLE mt_owner;
CREATE FUNCTION app.native_migration_state() RETURNS jsonb
LANGUAGE sql STABLE SECURITY DEFINER SET search_path=pg_catalog AS $$
  SELECT coalesce(jsonb_agg(jsonb_build_object('name',name,'checksum',checksum) ORDER BY name),'[]'::jsonb)
  FROM native_migrations.ledger
$$;
GRANT EXECUTE ON FUNCTION app.native_migration_state() TO mt_runtime;
CREATE FUNCTION app.native_runtime_ready() RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path=pg_catalog AS $$
  SELECT coalesce((SELECT NOT frozen FROM app.release_write_state WHERE singleton),false)
$$;
GRANT EXECUTE ON FUNCTION app.native_runtime_ready() TO mt_runtime;
CREATE FUNCTION app.native_ops_state() RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=pg_catalog AS $$
BEGIN
  IF session_user='mt_runtime' OR NOT pg_has_role(session_user,'mt_privacy_operator','MEMBER') THEN RAISE EXCEPTION 'native_ops_denied'; END IF;
  RETURN (SELECT jsonb_build_object('frozen',frozen,'revision',revision) FROM app.release_write_state WHERE singleton);
END; $$;
CREATE FUNCTION app.native_ops_assets() RETURNS TABLE(file_key text,size bigint)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=pg_catalog AS $$
BEGIN
  IF session_user='mt_runtime' OR NOT pg_has_role(session_user,'mt_privacy_operator','MEMBER') THEN RAISE EXCEPTION 'native_ops_denied'; END IF;
  RETURN QUERY SELECT refs.key,a.size FROM app.profiles p
    CROSS JOIN LATERAL (VALUES(p.avatar_path),(p.banner_path)) AS refs(key)
    LEFT JOIN app.native_asset_objects a ON a.file_key=refs.key AND a.user_id=p.id AND a.state='published'
    WHERE p.deleted_at IS NULL AND refs.key IS NOT NULL ORDER BY refs.key LIMIT 10001;
END; $$;
CREATE FUNCTION app.native_ops_lifecycle_state() RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=pg_catalog AS $$
BEGIN
  IF session_user='mt_runtime' OR NOT pg_has_role(session_user,'mt_privacy_operator','MEMBER') THEN RAISE EXCEPTION 'native_ops_denied'; END IF;
  RETURN jsonb_build_object('pending', (SELECT count(*) FROM app.account_lifecycle WHERE state<>'ACTIVE'),
    'missing', (SELECT count(*) FROM native_auth."user" u LEFT JOIN app.account_lifecycle a ON a.user_id=u.id WHERE a.user_id IS NULL));
END; $$;
CREATE FUNCTION app.native_ops_stale_temporary(p_ids uuid[]) RETURNS SETOF uuid
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=pg_catalog AS $$
BEGIN
  IF session_user='mt_runtime' OR NOT pg_has_role(session_user,'mt_privacy_operator','MEMBER') OR cardinality(p_ids)>500 THEN RAISE EXCEPTION 'native_ops_denied'; END IF;
  RETURN QUERY SELECT id FROM unnest(p_ids) t(id) WHERE NOT EXISTS
    (SELECT FROM app.native_asset_objects a WHERE a.id=t.id AND a.created_at>clock_timestamp()-interval '1 hour');
END; $$;
GRANT EXECUTE ON FUNCTION app.native_ops_state(),app.native_ops_assets(),app.native_ops_stale_temporary(uuid[]),app.native_ops_lifecycle_state() TO mt_privacy_operator;
RESET ROLE;
COMMIT;
