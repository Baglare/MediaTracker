-- Durable publication intent survives restart and identity removal.
BEGIN;
SET LOCAL ROLE mt_owner;
CREATE TABLE app.native_asset_objects (
 id uuid PRIMARY KEY, user_id uuid NOT NULL, kind text NOT NULL CHECK(kind IN ('avatar','banner')),
 file_key text NOT NULL UNIQUE CHECK(file_key ~ '^[0-9a-f-]{36}/(avatar|banner)/[0-9a-f-]{36}\.(jpg|png|webp)$'),
 state text NOT NULL CHECK(state IN ('staging','published','cleanup')),
 mime text NOT NULL CHECK(mime IN ('image/jpeg','image/png','image/webp')),
 size bigint CHECK(size BETWEEN 1 AND 10485760), created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
 CHECK(split_part(file_key,'/',1)=user_id::text AND split_part(file_key,'/',2)=kind)
);
ALTER TABLE app.native_asset_objects ENABLE ROW LEVEL SECURITY;
ALTER TABLE app.native_asset_objects FORCE ROW LEVEL SECURITY;
CREATE POLICY asset_internal ON app.native_asset_objects TO mt_owner USING(current_user='mt_owner') WITH CHECK(current_user='mt_owner');
CREATE POLICY asset_owner ON app.native_asset_objects TO mt_runtime USING(user_id=app.current_user_id()) WITH CHECK(user_id=app.current_user_id());
GRANT SELECT,INSERT,UPDATE ON app.native_asset_objects TO mt_runtime;
CREATE TRIGGER asset_admission BEFORE INSERT OR UPDATE ON app.native_asset_objects FOR EACH ROW EXECUTE FUNCTION app.guard_account_write();
CREATE FUNCTION app.native_asset_delivery(p_key text) RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE v_asset app.native_asset_objects%ROWTYPE;
BEGIN
 SELECT a.* INTO v_asset FROM app.native_asset_objects a JOIN app.profiles p ON p.id=a.user_id
 WHERE a.file_key=p_key AND a.state='published' AND p.deleted_at IS NULL AND p_key IN(p.avatar_path,p.banner_path);
 IF NOT FOUND OR NOT app.social_profile_asset_visible(p_key,v_asset.user_id::text,app.current_user_id()) THEN RETURN NULL; END IF;
 RETURN jsonb_build_object('key',v_asset.file_key,'mime',v_asset.mime,'size',v_asset.size);
END; $$;
GRANT EXECUTE ON FUNCTION app.native_asset_delivery(text) TO mt_runtime;
-- Maintenance role gets only unreferenced intents, including interrupted publication.
CREATE FUNCTION app.native_asset_cleanup_candidates(p_user uuid DEFAULT NULL) RETURNS SETOF app.native_asset_objects
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$ BEGIN
 IF session_user='mt_runtime' OR NOT pg_has_role(session_user,'mt_privacy_operator','MEMBER') THEN RAISE EXCEPTION 'privacy_ops_denied'; END IF;
 RETURN QUERY SELECT a.* FROM app.native_asset_objects a WHERE (p_user IS NULL OR a.user_id=p_user)
 AND NOT EXISTS(SELECT FROM app.profiles p WHERE a.file_key IN(p.avatar_path,p.banner_path))
 AND (a.state='cleanup' OR a.created_at<clock_timestamp()-interval '1 hour')
 ORDER BY a.created_at LIMIT 500;
END; $$;
CREATE FUNCTION app.native_asset_cleanup_complete(p_id uuid) RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$ BEGIN
 IF session_user='mt_runtime' OR NOT pg_has_role(session_user,'mt_privacy_operator','MEMBER') THEN RAISE EXCEPTION 'privacy_ops_denied'; END IF;
 DELETE FROM app.native_asset_objects a WHERE id=p_id AND NOT EXISTS(SELECT FROM app.profiles p WHERE a.file_key IN(p.avatar_path,p.banner_path));
 IF NOT FOUND THEN RAISE EXCEPTION 'asset_still_referenced'; END IF;
END; $$;
GRANT EXECUTE ON FUNCTION app.native_asset_cleanup_candidates(uuid),app.native_asset_cleanup_complete(uuid) TO mt_privacy_operator;
RESET ROLE;
COMMIT;
