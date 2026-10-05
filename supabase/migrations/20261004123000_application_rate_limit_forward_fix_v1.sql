-- V1-HARDENING-02D.3A forward fix. The applied base migration is immutable.
-- No secrets, provider enablement, business data changes or client state grants.
begin;
do $preflight$
begin
  if to_regprocedure('private_rate_limit.verify_v1(text,text,text)') is null
     or to_regprocedure('private_rate_limit.consume_authenticated_v1(text)') is null
     or to_regprocedure('vault._crypto_aead_det_decrypt(bytea,bytea,bigint,bytea,bytea)') is null
     or to_regprocedure('auth.uid()') is null then
    raise exception 'rate_limit_forward_fix_prerequisite_missing';
  end if;
end $preflight$;

-- Existing migration operator has grant options on exactly these dependencies.
-- No SELECT on vault.secrets/decrypted_secrets, encryption or secret mutation grant.
grant usage on schema vault to media_tracker_limiter;
grant execute on function vault._crypto_aead_det_decrypt(bytea,bytea,bigint,bytea,bytea) to media_tracker_limiter;

-- Supabase postgres has auth USAGE but cannot delegate auth schema USAGE.
-- Fixed, parameterless projection retains auth.uid() as identity authority.
-- postgres owns only this no-data-write helper; existing limiter owners are unchanged.
create function private_rate_limit.auth_uid_v1() returns uuid
language sql stable security definer set search_path='' as $$
  select auth.uid();
$$;
alter function private_rate_limit.auth_uid_v1() owner to postgres;
revoke all on function private_rate_limit.auth_uid_v1() from public,anon,authenticated;
grant execute on function private_rate_limit.auth_uid_v1() to media_tracker_limiter;

-- Temporary SET membership for replacement of limiter-owned functions.
grant media_tracker_limiter to postgres;
grant create on schema private_rate_limit to media_tracker_limiter;
set local role media_tracker_limiter;
create or replace function private_rate_limit.verify_v1(p_envelope text,p_signature_hex text,p_operation text) returns jsonb
language plpgsql security definer set search_path='' as $$
declare e jsonb; v_key text; v_now bigint:=floor(extract(epoch from clock_timestamp())); v_day bigint:=floor(v_now/86400.0); s jsonb; a jsonb;
begin
  if p_envelope is null or octet_length(p_envelope)>2048 or p_signature_hex is null or p_signature_hex !~ '^[0-9a-f]{64}$' then return null; end if;
  e:=p_envelope::jsonb;
  if jsonb_typeof(e)<>'object' or (select count(*) from jsonb_object_keys(e))<>13
    or e - array['version','operation','audience','key_version','policy_id','identity_class','subjects','ingress','nonce','issued_at','expires_at','cost','cooldown'] <> '{}'::jsonb then return null; end if;
  if exists(select 1 from jsonb_each(e) where value='null'::jsonb)
    or exists(select 1 from jsonb_each(e) where key in ('version','issued_at','expires_at','cost','cooldown') and (jsonb_typeof(value)<>'number' or value::text !~ '^[0-9]{1,12}$'))
    or exists(select 1 from jsonb_each(e) where key in ('operation','audience','key_version','policy_id','identity_class','nonce') and jsonb_typeof(value)<>'string') then return null; end if;
  select decrypted_secret into v_key from private_rate_limit.selected_secrets
    where key_version=e->>'key_version' and kind='signing' and audience=e->>'audience'
    and valid_from<=clock_timestamp() and valid_until>clock_timestamp();
  if v_key is null or length(v_key)<32 or encode(extensions.hmac(convert_to(p_envelope,'UTF8'),convert_to(v_key,'UTF8'),'sha256'),'hex')<>p_signature_hex then return null; end if;
  if e->>'version'<>'1' or e->>'operation'<>p_operation or e->>'identity_class' not in ('user','ip')
    or (e->>'issued_at')::bigint>v_now+5 or (e->>'issued_at')::bigint<v_now-15
    or (e->>'expires_at')::bigint<v_now-5 or (e->>'expires_at')::bigint-(e->>'issued_at')::bigint not between 1 and 10
    or (e->>'nonce') !~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
    or not exists(select 1 from private_rate_limit.policies where policy_id=e->>'policy_id' and enabled and cost=(e->>'cost')::integer)
    or jsonb_typeof(e->'subjects')<>'array' or jsonb_array_length(e->'subjects') not between 1 and 4
    or jsonb_typeof(e->'ingress')<>'array' or jsonb_array_length(e->'ingress')>4
    or (e->>'cooldown')::integer not between 0 and 86400
    or (p_operation='consume' and (e->>'cooldown')::integer<>0)
    or (p_operation='cooldown' and ((e->>'cooldown')::integer<1 or not exists(select 1 from private_rate_limit.policies where policy_id=e->>'policy_id' and provider is not null))) then return null; end if;
  foreach a in array array[e->'subjects',e->'ingress'] loop
    for s in select value from jsonb_array_elements(a) loop
      if jsonb_typeof(s)<>'object' or (select count(*) from jsonb_object_keys(s))<>2 or s-array['epoch','digest']<>'{}'::jsonb
        or jsonb_typeof(s->'digest')<>'string' or jsonb_typeof(s->'epoch')<>'number' or s->>'epoch' !~ '^[0-9]{1,6}$'
        or s->>'digest' !~ '^[0-9a-f]{64}$' or (s->>'epoch')::bigint not in (v_day,v_day-1)
        or ((s->>'epoch')::bigint=v_day-1 and v_now%86400>65) then return null; end if;
    end loop;
    if (select count(distinct value) from jsonb_array_elements(a))<>jsonb_array_length(a) then return null; end if;
  end loop;
  if not exists(select 1 from jsonb_array_elements(e->'subjects') as subject_row(value) where (subject_row.value->>'epoch')::bigint=v_day)
    or (e->>'identity_class'='ip' and jsonb_array_length(e->'ingress')=0) then return null; end if;
  return e;
exception when others then return null;
end $$;



create or replace function private_rate_limit.consume_authenticated_v1(p_policy text) returns void
language plpgsql security definer set search_path='' set statement_timeout='500ms' set lock_timeout='100ms' as $$
declare v_user uuid:=private_rate_limit.auth_uid_v1(); v_epoch bigint:=floor(extract(epoch from clock_timestamp())/86400); v_subjects jsonb; v_result jsonb;
begin
  if v_user is null then raise exception 'authentication_required'; end if;
  if p_policy<>'social_domain' then raise exception 'rate_limit_policy_invalid'; end if;
  -- Compact versioned serialization matches the Node identity helper.
  select jsonb_agg(jsonb_build_object('epoch',d,'digest',encode(extensions.hmac(convert_to(format('[1,"%s","user","social_domain",%s,"%s"]',k.audience,d,v_user),'UTF8'),convert_to(k.decrypted_secret,'UTF8'),'sha256'),'hex')))
    into v_subjects from private_rate_limit.selected_secrets k cross join
    generate_series(v_epoch-case when extract(epoch from clock_timestamp())::bigint%86400<60 then 1 else 0 end,v_epoch) d
    where k.kind='identity' and length(k.decrypted_secret)>=32 and k.valid_from<=clock_timestamp() and k.valid_until>clock_timestamp();
  if v_subjects is null or jsonb_array_length(v_subjects)>4 then raise exception 'rate_limit_unavailable'; end if;
  v_result:=private_rate_limit.reserve_v1(p_policy,v_subjects,'[]'::jsonb,null,null);
  if not (v_result->>'allowed')::boolean then
    if v_result->>'reason'='limited' then raise exception 'rate_limited'; end if;
    raise exception 'rate_limit_unavailable';
  end if;
end $$;



reset role;
revoke create on schema private_rate_limit from media_tracker_limiter;
revoke media_tracker_limiter from postgres;

-- Fail the transaction if managed-platform GRANT silently did nothing.
do $postcheck$
begin
  if not has_schema_privilege('media_tracker_limiter','vault','USAGE')
     or not has_function_privilege('media_tracker_limiter','vault._crypto_aead_det_decrypt(bytea,bytea,bigint,bytea,bytea)','EXECUTE')
     or not has_function_privilege('media_tracker_limiter','private_rate_limit.auth_uid_v1()','EXECUTE')
     or has_table_privilege('media_tracker_limiter','vault.secrets','SELECT')
     or has_table_privilege('media_tracker_limiter','vault.decrypted_secrets','SELECT')
     or has_function_privilege('anon','private_rate_limit.auth_uid_v1()','EXECUTE')
     or has_function_privilege('authenticated','private_rate_limit.auth_uid_v1()','EXECUTE')
     or pg_has_role('postgres','media_tracker_limiter','SET')
     or pg_has_role('postgres','media_tracker_limiter','USAGE') then
    raise exception 'rate_limit_forward_fix_acl_failed';
  end if;
end $postcheck$;
commit;
