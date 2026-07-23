-- P6.1 private, revisioned custom-theme synchronization.
create table if not exists public.user_theme_preferences (
  user_id uuid primary key references auth.users(id) on delete cascade,
  schema_version integer not null default 1 check (schema_version = 1),
  active_theme_selection jsonb not null default '{"kind":"preset","id":"obsidian"}'::jsonb,
  custom_themes jsonb not null default '[]'::jsonb,
  revision bigint not null default 1 check (revision >= 1),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint user_theme_preferences_custom_themes_array
    check (jsonb_typeof(custom_themes) = 'array'),
  constraint user_theme_preferences_custom_theme_limit
    check (jsonb_array_length(custom_themes) <= 20),
  constraint user_theme_preferences_payload_size
    check (octet_length(custom_themes::text) <= 262144)
);

alter table public.user_theme_preferences enable row level security;

drop policy if exists user_theme_preferences_select_own on public.user_theme_preferences;
create policy user_theme_preferences_select_own
  on public.user_theme_preferences
  for select
  to authenticated
  using (user_id = auth.uid());

revoke all on table public.user_theme_preferences from public, anon, authenticated;
grant select on table public.user_theme_preferences to authenticated;

create or replace function public.theme_sync_payload_is_valid(
  p_active_theme_selection jsonb,
  p_custom_themes jsonb
) returns boolean
language plpgsql
stable
set search_path=public,pg_temp
as $$
declare
  v_theme jsonb;
  v_inputs jsonb;
  v_corrections jsonb;
  v_key text;
  v_id text;
begin
  if jsonb_typeof(p_custom_themes) <> 'array'
    or jsonb_array_length(p_custom_themes) > 20
    or octet_length(p_custom_themes::text) > 262144 then
    return false;
  end if;

  for v_theme in select value from jsonb_array_elements(p_custom_themes)
  loop
    if jsonb_typeof(v_theme) <> 'object'
      or not (v_theme ?& array['version','id','name','createdAt','updatedAt','inputs'])
      or exists (
        select 1 from jsonb_object_keys(v_theme) key
        where key not in ('version','id','name','createdAt','updatedAt','inputs','corrections')
      )
      or v_theme->>'version' <> '1'
      or coalesce(v_theme->>'id','') !~ '^ct_[A-Za-z0-9_-]{8,80}$'
      or char_length(trim(coalesce(v_theme->>'name',''))) not between 1 and 40 then
      return false;
    end if;

    begin
      perform (v_theme->>'createdAt')::timestamptz;
      perform (v_theme->>'updatedAt')::timestamptz;
    exception when others then
      return false;
    end;

    v_inputs := v_theme->'inputs';
    if jsonb_typeof(v_inputs) <> 'object'
      or not (v_inputs ?& array['colorScheme','background','surface','accent','secondaryAccent'])
      or exists (
        select 1 from jsonb_object_keys(v_inputs) key
        where key not in ('colorScheme','background','surface','accent','secondaryAccent')
      )
      or v_inputs->>'colorScheme' not in ('light','dark') then
      return false;
    end if;
    foreach v_key in array array['background','surface','accent','secondaryAccent']
    loop
      if coalesce(v_inputs->>v_key,'') !~ '^#[0-9A-Fa-f]{6}$' then return false; end if;
    end loop;

    if v_theme ? 'corrections' then
      v_corrections := v_theme->'corrections';
      if jsonb_typeof(v_corrections) <> 'object'
        or exists (
          select 1 from jsonb_object_keys(v_corrections) key
          where key not in ('textPrimary','textSecondary','textMuted','border','borderStrong','focus')
        ) then
        return false;
      end if;
      for v_key in select jsonb_object_keys(v_corrections)
      loop
        if coalesce(v_corrections->>v_key,'') !~ '^#[0-9A-Fa-f]{6}$' then return false; end if;
      end loop;
    end if;
  end loop;

  if (
    select count(*) = count(distinct value->>'id')
    from jsonb_array_elements(p_custom_themes)
  ) is not true then
    return false;
  end if;

  if jsonb_typeof(p_active_theme_selection) <> 'object'
    or not (p_active_theme_selection ?& array['kind','id'])
    or exists (
      select 1 from jsonb_object_keys(p_active_theme_selection) key
      where key not in ('kind','id')
    ) then
    return false;
  end if;

  if p_active_theme_selection->>'kind' = 'preset' then
    return p_active_theme_selection->>'id' in (
      'system','obsidian','porcelain','ocean',
      'dusty_rose','forest','lavender','polar','sepia'
    );
  end if;
  if p_active_theme_selection->>'kind' <> 'custom' then return false; end if;
  v_id := p_active_theme_selection->>'id';
  return exists (
    select 1 from jsonb_array_elements(p_custom_themes) as item(theme)
    where theme->>'id' = v_id
  );
end;
$$;

create or replace function public.get_theme_sync_state()
returns jsonb
language plpgsql
stable
security definer
set search_path=public,pg_temp
as $$
declare
  v_user uuid := auth.uid();
  v_row public.user_theme_preferences%rowtype;
begin
  if v_user is null then raise exception 'authentication_required'; end if;
  select * into v_row from public.user_theme_preferences where user_id = v_user;
  if not found then
    return jsonb_build_object(
      'exists',false,'schemaVersion',1,'revision',0,'updatedAt',null,
      'activeThemeSelection',jsonb_build_object('kind','preset','id','obsidian'),
      'customThemes','[]'::jsonb
    );
  end if;
  return jsonb_build_object(
    'exists',true,'schemaVersion',v_row.schema_version,'revision',v_row.revision,
    'updatedAt',v_row.updated_at,'activeThemeSelection',v_row.active_theme_selection,
    'customThemes',v_row.custom_themes
  );
end;
$$;

create or replace function public.save_theme_sync_state(
  p_expected_revision bigint,
  p_active_theme_selection jsonb,
  p_custom_themes jsonb
) returns jsonb
language plpgsql
security definer
set search_path=public,pg_temp
as $$
declare
  v_user uuid := auth.uid();
  v_current public.user_theme_preferences%rowtype;
  v_revision bigint;
begin
  if v_user is null then raise exception 'authentication_required'; end if;
  if p_expected_revision is null or p_expected_revision < 0
    or not public.theme_sync_payload_is_valid(p_active_theme_selection,p_custom_themes) then
    raise exception 'theme_sync_payload_invalid';
  end if;

  select * into v_current
  from public.user_theme_preferences
  where user_id = v_user
  for update;

  if not found then
    if p_expected_revision <> 0 then
      return jsonb_build_object(
        'ok',false,'conflict',true,'revision',0,
        'state',public.get_theme_sync_state()
      );
    end if;
    insert into public.user_theme_preferences(
      user_id,schema_version,active_theme_selection,custom_themes,revision
    ) values (
      v_user,1,p_active_theme_selection,p_custom_themes,1
    );
    v_revision := 1;
  else
    if v_current.revision <> p_expected_revision then
      return jsonb_build_object(
        'ok',false,'conflict',true,'revision',v_current.revision,
        'state',public.get_theme_sync_state()
      );
    end if;
    update public.user_theme_preferences set
      schema_version=1,
      active_theme_selection=p_active_theme_selection,
      custom_themes=p_custom_themes,
      revision=v_current.revision+1,
      updated_at=now()
    where user_id=v_user;
    v_revision := v_current.revision+1;
  end if;

  return jsonb_build_object(
    'ok',true,'conflict',false,'revision',v_revision,
    'state',public.get_theme_sync_state()
  );
end;
$$;

create or replace function public.delete_theme_sync_state()
returns jsonb
language plpgsql
security definer
set search_path=public,pg_temp
as $$
declare v_user uuid:=auth.uid(); v_deleted_count integer;
begin
  if v_user is null then raise exception 'authentication_required'; end if;
  delete from public.user_theme_preferences where user_id=v_user;
  get diagnostics v_deleted_count = row_count;
  return jsonb_build_object('ok',true,'deleted',v_deleted_count > 0);
end;
$$;

revoke all on function public.theme_sync_payload_is_valid(jsonb,jsonb) from public,anon,authenticated;
revoke all on function public.get_theme_sync_state() from public,anon;
revoke all on function public.save_theme_sync_state(bigint,jsonb,jsonb) from public,anon;
revoke all on function public.delete_theme_sync_state() from public,anon;
grant execute on function public.get_theme_sync_state() to authenticated;
grant execute on function public.save_theme_sync_state(bigint,jsonb,jsonb) to authenticated;
grant execute on function public.delete_theme_sync_state() to authenticated;
