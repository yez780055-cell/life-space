-- Phase 2C remote schema preparation only. The app does not connect to Supabase yet.
begin;

create schema if not exists extensions;
create extension if not exists pgcrypto with schema extensions;

create table public.couple_spaces (
  id uuid primary key default gen_random_uuid(),
  created_by uuid not null references auth.users(id) on delete restrict,
  created_at timestamptz not null default now()
);

create table public.couple_members (
  space_id uuid not null references public.couple_spaces(id) on delete cascade,
  user_id uuid not null unique references auth.users(id) on delete cascade,
  joined_at timestamptz not null default now(),
  primary key (space_id, user_id)
);

create table public.couple_invites (
  token_hash bytea primary key check (octet_length(token_hash) = 32),
  space_id uuid not null references public.couple_spaces(id) on delete cascade,
  created_by uuid not null references auth.users(id) on delete restrict,
  created_at timestamptz not null default now(),
  expires_at timestamptz not null,
  consumed_by uuid references auth.users(id) on delete set null,
  consumed_at timestamptz,
  revoked_at timestamptz,
  check (expires_at > created_at),
  check ((consumed_by is null) = (consumed_at is null))
);
create unique index couple_one_pending_invite_per_space
  on public.couple_invites(space_id)
  where consumed_at is null and revoked_at is null;

create table public.couple_items (
  id uuid primary key default gen_random_uuid(),
  space_id uuid not null references public.couple_spaces(id) on delete cascade,
  title text not null check (char_length(btrim(title)) between 1 and 500),
  scheduled_date date,
  scheduled_time time without time zone,
  note text not null default '' check (char_length(note) <= 5000),
  created_by uuid not null references auth.users(id) on delete restrict,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  completed_at timestamptz,
  revision bigint not null default 1 check (revision > 0),
  deleted_at timestamptz,
  unique (space_id, id),
  check (scheduled_time is null or scheduled_date is not null)
);
create index couple_items_schedule_idx
  on public.couple_items(space_id, scheduled_date, scheduled_time)
  where deleted_at is null and completed_at is null;
create index couple_items_history_idx
  on public.couple_items(space_id, completed_at desc)
  where deleted_at is null and completed_at is not null;

create table public.couple_tags (
  id uuid primary key default gen_random_uuid(),
  space_id uuid not null references public.couple_spaces(id) on delete cascade,
  name text not null check (char_length(btrim(name)) between 1 and 40),
  normalized_name text generated always as (lower(regexp_replace(btrim(name), '[[:space:]]+', ' ', 'g'))) stored,
  color text check (color is null or color ~ '^#[0-9A-Fa-f]{6}$'),
  created_by uuid not null references auth.users(id) on delete restrict,
  created_at timestamptz not null default now(),
  unique (space_id, id),
  unique (space_id, normalized_name)
);

create table public.couple_item_tags (
  space_id uuid not null,
  item_id uuid not null,
  tag_id uuid not null,
  primary key (space_id, item_id, tag_id),
  foreign key (space_id, item_id) references public.couple_items(space_id, id) on delete cascade,
  foreign key (space_id, tag_id) references public.couple_tags(space_id, id) on delete restrict
);
create index couple_item_tags_tag_idx on public.couple_item_tags(space_id, tag_id, item_id);

alter table public.couple_spaces enable row level security;
alter table public.couple_members enable row level security;
alter table public.couple_invites enable row level security;
alter table public.couple_items enable row level security;
alter table public.couple_tags enable row level security;
alter table public.couple_item_tags enable row level security;

create or replace function public.is_couple_member(p_space_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select auth.uid() is not null and exists (
    select 1 from public.couple_members m
    where m.space_id = p_space_id and m.user_id = auth.uid()
  );
$$;

create policy couple_items_member_read on public.couple_items
  for select to authenticated using (public.is_couple_member(space_id));
create policy couple_tags_member_read on public.couple_tags
  for select to authenticated using (public.is_couple_member(space_id));
create policy couple_tags_member_insert on public.couple_tags
  for insert to authenticated with check (public.is_couple_member(space_id) and created_by = auth.uid());
create policy couple_tags_member_update on public.couple_tags
  for update to authenticated using (public.is_couple_member(space_id))
  with check (public.is_couple_member(space_id));
create policy couple_tags_member_delete on public.couple_tags
  for delete to authenticated using (public.is_couple_member(space_id));
create policy couple_item_tags_member_read on public.couple_item_tags
  for select to authenticated using (public.is_couple_member(space_id));

revoke all on public.couple_spaces, public.couple_members, public.couple_invites,
  public.couple_items, public.couple_tags, public.couple_item_tags from public, anon, authenticated;
grant select on public.couple_items, public.couple_tags, public.couple_item_tags to authenticated;
grant insert, update, delete on public.couple_tags to authenticated;
revoke all on function public.is_couple_member(uuid) from public, anon;
grant execute on function public.is_couple_member(uuid) to authenticated;

create or replace function public.bump_couple_item_revision()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.id := old.id;
  new.space_id := old.space_id;
  new.created_by := old.created_by;
  new.created_at := old.created_at;
  new.updated_at := statement_timestamp();
  new.revision := old.revision + 1;
  return new;
end;
$$;
create trigger couple_items_revision_before_update
  before update on public.couple_items
  for each row execute function public.bump_couple_item_revision();
revoke all on function public.bump_couple_item_revision() from public, anon, authenticated;

create or replace function public.get_my_couple_space()
returns uuid
language sql
stable
security definer
set search_path = ''
as $$
  select m.space_id from public.couple_members m where m.user_id = auth.uid();
$$;

create or replace function public.create_couple_invite()
returns table (space_id uuid, invite_token text, expires_at timestamptz)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user_id uuid := auth.uid();
  v_space_id uuid;
  v_token text;
  v_expires_at timestamptz := statement_timestamp() + interval '30 minutes';
  v_member_count integer;
begin
  if v_user_id is null then
    raise exception using errcode = '42501', message = 'Authentication is required.';
  end if;
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(v_user_id::text, 0));
  select m.space_id into v_space_id from public.couple_members m where m.user_id = v_user_id;
  if v_space_id is null then
    insert into public.couple_spaces(created_by) values (v_user_id) returning id into v_space_id;
    insert into public.couple_members(space_id, user_id) values (v_space_id, v_user_id);
  end if;
  update public.couple_invites i set revoked_at = statement_timestamp()
    where i.space_id = v_space_id and i.consumed_at is null and i.revoked_at is null;
  perform 1 from public.couple_spaces s where s.id = v_space_id for update;
  select count(*) into v_member_count from public.couple_members m where m.space_id = v_space_id;
  if v_member_count >= 2 then
    raise exception using errcode = '23514', message = 'This shared space already has two members.';
  end if;
  v_token := pg_catalog.encode(extensions.gen_random_bytes(32), 'hex');
  insert into public.couple_invites(token_hash, space_id, created_by, expires_at)
    values (extensions.digest(pg_catalog.convert_to(v_token, 'UTF8'), 'sha256'), v_space_id, v_user_id, v_expires_at);
  return query select v_space_id, v_token, v_expires_at;
end;
$$;

create or replace function public.accept_couple_invite(p_invite_token text)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user_id uuid := auth.uid();
  v_invite public.couple_invites%rowtype;
  v_member_count integer;
begin
  if v_user_id is null then
    raise exception using errcode = '42501', message = 'Authentication is required.';
  end if;
  if p_invite_token is null or p_invite_token !~ '^[0-9a-f]{64}$' then
    raise exception using errcode = '22023', message = 'The invitation is invalid or expired.';
  end if;
  select i.* into v_invite from public.couple_invites i
    where i.token_hash = extensions.digest(pg_catalog.convert_to(p_invite_token, 'UTF8'), 'sha256')
    for update;
  if not found or v_invite.consumed_at is not null or v_invite.revoked_at is not null
     or v_invite.expires_at <= statement_timestamp() then
    raise exception using errcode = '22023', message = 'The invitation is invalid or expired.';
  end if;
  perform 1 from public.couple_spaces s where s.id = v_invite.space_id for update;
  if v_invite.created_by = v_user_id then
    raise exception using errcode = '23514', message = 'The invitation creator cannot join their own space.';
  end if;
  if exists (select 1 from public.couple_members m where m.user_id = v_user_id) then
    raise exception using errcode = '23505', message = 'This account already belongs to a shared space.';
  end if;
  select count(*) into v_member_count from public.couple_members m where m.space_id = v_invite.space_id;
  if v_member_count >= 2 then
    raise exception using errcode = '23514', message = 'This shared space already has two members.';
  end if;
  update public.couple_invites set consumed_by = v_user_id, consumed_at = statement_timestamp()
    where token_hash = v_invite.token_hash;
  insert into public.couple_members(space_id, user_id) values (v_invite.space_id, v_user_id);
  return v_invite.space_id;
end;
$$;

create or replace function public.save_couple_item(
  p_space_id uuid,
  p_id uuid,
  p_expected_revision bigint,
  p_title text,
  p_scheduled_date date,
  p_scheduled_time time without time zone,
  p_note text,
  p_completed boolean,
  p_tag_ids uuid[] default '{}'::uuid[]
)
returns setof public.couple_items
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_item public.couple_items%rowtype;
begin
  if auth.uid() is null or not public.is_couple_member(p_space_id) then
    raise exception using errcode = '42501', message = 'Access to this shared space is denied.';
  end if;
  if p_title is null or char_length(btrim(p_title)) not between 1 and 500 then
    raise exception using errcode = '22023', message = 'The title must contain 1 to 500 characters.';
  end if;
  if char_length(coalesce(p_note, '')) > 5000 then
    raise exception using errcode = '22023', message = 'The note cannot exceed 5000 characters.';
  end if;
  if p_scheduled_time is not null and p_scheduled_date is null then
    raise exception using errcode = '22023', message = 'A scheduled time requires a scheduled date.';
  end if;
  if exists (
    select 1
    from (select distinct unnest(coalesce(p_tag_ids, '{}'::uuid[])) as requested_id) requested
    left join public.couple_tags t on t.id = requested.requested_id and t.space_id = p_space_id
    where t.id is null
  ) then
    raise exception using errcode = '22023', message = 'A selected tag does not belong to this shared space.';
  end if;

  if p_id is null then
    if p_expected_revision is not null then
      raise exception using errcode = '22023', message = 'A new item cannot have an expected revision.';
    end if;
    insert into public.couple_items(space_id, title, scheduled_date, scheduled_time, note, created_by, completed_at)
      values (p_space_id, btrim(p_title), p_scheduled_date, p_scheduled_time, btrim(coalesce(p_note, '')), auth.uid(),
        case when coalesce(p_completed, false) then statement_timestamp() else null end)
      returning * into v_item;
  else
    if p_expected_revision is null then
      raise exception using errcode = '22023', message = 'An expected revision is required when updating an item.';
    end if;
    update public.couple_items i
      set title = btrim(p_title), scheduled_date = p_scheduled_date, scheduled_time = p_scheduled_time,
          note = btrim(coalesce(p_note, '')),
          completed_at = case when not coalesce(p_completed, false) then null
            when i.completed_at is null then statement_timestamp() else i.completed_at end
      where i.id = p_id and i.space_id = p_space_id and i.revision = p_expected_revision and i.deleted_at is null
      returning i.* into v_item;
    if not found then
      raise exception using errcode = '40001', message = 'The item changed elsewhere; reload before saving.';
    end if;
  end if;

  delete from public.couple_item_tags it where it.space_id = p_space_id and it.item_id = v_item.id;
  insert into public.couple_item_tags(space_id, item_id, tag_id)
    select p_space_id, v_item.id, requested.tag_id
    from (select distinct unnest(coalesce(p_tag_ids, '{}'::uuid[])) as tag_id) requested;
  return next v_item;
end;
$$;

create or replace function public.soft_delete_couple_item(p_space_id uuid, p_id uuid, p_expected_revision bigint)
returns bigint
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_revision bigint;
begin
  if auth.uid() is null or not public.is_couple_member(p_space_id) then
    raise exception using errcode = '42501', message = 'Access to this shared space is denied.';
  end if;
  update public.couple_items i set deleted_at = statement_timestamp()
    where i.space_id = p_space_id and i.id = p_id and i.revision = p_expected_revision and i.deleted_at is null
    returning i.revision into v_revision;
  if not found then
    raise exception using errcode = '40001', message = 'The item changed elsewhere; reload before deleting.';
  end if;
  return v_revision;
end;
$$;

revoke all on function public.get_my_couple_space() from public, anon;
revoke all on function public.create_couple_invite() from public, anon;
revoke all on function public.accept_couple_invite(text) from public, anon;
revoke all on function public.save_couple_item(uuid, uuid, bigint, text, date, time without time zone, text, boolean, uuid[]) from public, anon;
revoke all on function public.soft_delete_couple_item(uuid, uuid, bigint) from public, anon;
grant execute on function public.get_my_couple_space() to authenticated;
grant execute on function public.create_couple_invite() to authenticated;
grant execute on function public.accept_couple_invite(text) to authenticated;
grant execute on function public.save_couple_item(uuid, uuid, bigint, text, date, time without time zone, text, boolean, uuid[]) to authenticated;
grant execute on function public.soft_delete_couple_item(uuid, uuid, bigint) to authenticated;

commit;
