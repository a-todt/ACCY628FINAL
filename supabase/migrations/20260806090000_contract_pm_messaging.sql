-- Contract-scoped messaging: client <-> project manager only (one thread per contract).

create table if not exists public.message_threads (
  id uuid primary key default gen_random_uuid(),
  contract_id uuid not null references public.contracts (id) on delete cascade,
  created_by uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint message_threads_contract_unique unique (contract_id)
);

comment on table public.message_threads is
  'One client–PM conversation thread per contract.';

create table if not exists public.message_thread_participants (
  thread_id uuid not null references public.message_threads (id) on delete cascade,
  user_id uuid not null references auth.users (id) on delete cascade,
  last_read_at timestamptz,
  created_at timestamptz not null default now(),
  primary key (thread_id, user_id)
);

create table if not exists public.messages (
  id uuid primary key default gen_random_uuid(),
  thread_id uuid not null references public.message_threads (id) on delete cascade,
  sender_id uuid not null references auth.users (id) on delete cascade,
  body text not null,
  created_at timestamptz not null default now(),
  constraint messages_body_not_blank check (char_length(trim(body)) > 0)
);

create index if not exists idx_messages_thread_created
  on public.messages (thread_id, created_at);

create index if not exists idx_message_participants_user
  on public.message_thread_participants (user_id);

create or replace function public.can_use_messaging()
returns boolean
language sql
security definer
set search_path = public
stable
as $$
  select coalesce(
    public.get_user_role() in ('admin', 'owner', 'client', 'project_manager'),
    false
  );
$$;

create or replace function public.can_message_contract(p_contract_id uuid)
returns boolean
language plpgsql
security definer
set search_path = public
stable
as $$
declare
  v_role text;
begin
  v_role := public.get_user_role();

  if v_role in ('admin', 'owner') then
    return true;
  end if;

  if v_role = 'client' then
    return exists (
      select 1
      from public.contracts c
      where c.id = p_contract_id
        and c.client_user_id = auth.uid()
    );
  end if;

  if v_role = 'project_manager' then
    return exists (
      select 1
      from public.contract_assignments ca
      where ca.contract_id = p_contract_id
        and ca.user_id = auth.uid()
        and ca.assignment_role = 'project_manager'
    );
  end if;

  return false;
end;
$$;

create or replace function public.is_message_thread_participant(p_thread_id uuid)
returns boolean
language sql
security definer
set search_path = public
stable
as $$
  select exists (
    select 1
    from public.message_thread_participants p
    where p.thread_id = p_thread_id
      and p.user_id = auth.uid()
  )
  or coalesce(public.get_user_role() in ('admin', 'owner'), false);
$$;

create or replace function public.start_or_get_contract_pm_thread(p_contract_id uuid)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_thread_id uuid;
  v_client_id uuid;
  v_pm_count int;
begin
  if auth.uid() is null then
    raise exception 'Not authenticated';
  end if;

  if not public.can_message_contract(p_contract_id) then
    raise exception 'You cannot message on this contract';
  end if;

  select id into v_thread_id
  from public.message_threads
  where contract_id = p_contract_id;

  if v_thread_id is not null then
    -- Ensure caller is a participant (e.g. newly assigned PM / linked client).
    insert into public.message_thread_participants (thread_id, user_id)
    values (v_thread_id, auth.uid())
    on conflict do nothing;

    select client_user_id into v_client_id
    from public.contracts
    where id = p_contract_id;

    if v_client_id is not null then
      insert into public.message_thread_participants (thread_id, user_id)
      values (v_thread_id, v_client_id)
      on conflict do nothing;
    end if;

    insert into public.message_thread_participants (thread_id, user_id)
    select v_thread_id, ca.user_id
    from public.contract_assignments ca
    where ca.contract_id = p_contract_id
      and ca.assignment_role = 'project_manager'
    on conflict do nothing;

    return v_thread_id;
  end if;

  select count(*) into v_pm_count
  from public.contract_assignments ca
  where ca.contract_id = p_contract_id
    and ca.assignment_role = 'project_manager';

  if v_pm_count = 0 and public.get_user_role() = 'client' then
    raise exception 'No project manager is assigned to this contract yet';
  end if;

  insert into public.message_threads (contract_id, created_by)
  values (p_contract_id, auth.uid())
  returning id into v_thread_id;

  select client_user_id into v_client_id
  from public.contracts
  where id = p_contract_id;

  if v_client_id is not null then
    insert into public.message_thread_participants (thread_id, user_id)
    values (v_thread_id, v_client_id)
    on conflict do nothing;
  end if;

  insert into public.message_thread_participants (thread_id, user_id)
  select v_thread_id, ca.user_id
  from public.contract_assignments ca
  where ca.contract_id = p_contract_id
    and ca.assignment_role = 'project_manager'
  on conflict do nothing;

  insert into public.message_thread_participants (thread_id, user_id)
  values (v_thread_id, auth.uid())
  on conflict do nothing;

  return v_thread_id;
end;
$$;

create or replace function public.mark_message_thread_read(p_thread_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.is_message_thread_participant(p_thread_id) then
    raise exception 'Not allowed';
  end if;

  insert into public.message_thread_participants (thread_id, user_id, last_read_at)
  values (p_thread_id, auth.uid(), now())
  on conflict (thread_id, user_id)
  do update set last_read_at = excluded.last_read_at;
end;
$$;

create or replace function public.bump_message_thread_updated_at()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  update public.message_threads
  set updated_at = now()
  where id = new.thread_id;
  return new;
end;
$$;

drop trigger if exists trg_messages_bump_thread on public.messages;
create trigger trg_messages_bump_thread
  after insert on public.messages
  for each row
  execute function public.bump_message_thread_updated_at();

alter table public.message_threads enable row level security;
alter table public.message_thread_participants enable row level security;
alter table public.messages enable row level security;

drop policy if exists "message_threads_select" on public.message_threads;
create policy "message_threads_select"
  on public.message_threads
  for select
  to authenticated
  using (public.is_message_thread_participant(id));

drop policy if exists "message_threads_insert" on public.message_threads;
create policy "message_threads_insert"
  on public.message_threads
  for insert
  to authenticated
  with check (
    public.can_message_contract(contract_id)
    and created_by = auth.uid()
  );

drop policy if exists "message_participants_select" on public.message_thread_participants;
create policy "message_participants_select"
  on public.message_thread_participants
  for select
  to authenticated
  using (public.is_message_thread_participant(thread_id));

drop policy if exists "message_participants_update_own" on public.message_thread_participants;
create policy "message_participants_update_own"
  on public.message_thread_participants
  for update
  to authenticated
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

drop policy if exists "messages_select" on public.messages;
create policy "messages_select"
  on public.messages
  for select
  to authenticated
  using (public.is_message_thread_participant(thread_id));

drop policy if exists "messages_insert" on public.messages;
create policy "messages_insert"
  on public.messages
  for insert
  to authenticated
  with check (
    sender_id = auth.uid()
    and public.is_message_thread_participant(thread_id)
  );

grant execute on function public.start_or_get_contract_pm_thread(uuid) to authenticated;
grant execute on function public.mark_message_thread_read(uuid) to authenticated;
grant execute on function public.can_use_messaging() to authenticated;
grant execute on function public.can_message_contract(uuid) to authenticated;
