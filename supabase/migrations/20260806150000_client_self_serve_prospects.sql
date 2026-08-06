-- Self-serve client prospects: register without a pre-existing Client ID,
-- message owner/admin on a lead thread, then link to a contract after negotiation.

-- ---------------------------------------------------------------------------
-- Customers: one open prospect per user
-- ---------------------------------------------------------------------------
create unique index if not exists idx_customers_one_open_prospect_per_user
  on public.customers (user_id)
  where user_id is not null and contract_id is null;

comment on index public.idx_customers_one_open_prospect_per_user is
  'A client may have at most one unattached (prospect) customer row.';

create or replace function public.register_client_prospect(
  p_company_name text,
  p_contact_phone text default null,
  p_project_interest text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_role text;
  v_full_name text;
  v_email text;
  v_customer public.customers%rowtype;
  v_company text;
begin
  if v_uid is null then
    raise exception 'Must be signed in';
  end if;

  select role, full_name, email
  into v_role, v_full_name, v_email
  from public.user_profiles
  where id = v_uid;

  if v_role is null then
    raise exception 'Profile missing';
  end if;

  if v_role not in ('client', 'admin', 'owner') then
    -- Promote intended client signups that still show another role
    if v_role in ('project_manager', 'field_supervisor', 'subcontractor') then
      raise exception 'Only client accounts can register a project inquiry';
    end if;
  end if;

  -- Ensure role is client for normal users
  if v_role not in ('admin', 'owner') then
    update public.user_profiles
    set
      role = 'client',
      onboarding_complete = true,
      must_set_email = false
    where id = v_uid;
    v_role := 'client';
  end if;

  select * into v_customer
  from public.customers
  where user_id = v_uid
  order by case when contract_id is null then 0 else 1 end, created_at desc
  limit 1;

  if found and v_customer.contract_id is null then
    -- Refresh contact details on existing prospect
    update public.customers
    set
      company_name = coalesce(nullif(trim(p_company_name), ''), company_name),
      contact_name = coalesce(nullif(trim(v_full_name), ''), contact_name),
      contact_email = coalesce(contact_email, lower(trim(v_email))),
      contact_phone = coalesce(nullif(trim(p_contact_phone), ''), contact_phone),
      notes = case
        when nullif(trim(p_project_interest), '') is null then notes
        else trim(p_project_interest)
      end
    where id = v_customer.id
    returning * into v_customer;

    return jsonb_build_object(
      'customerId', v_customer.id,
      'clientId', v_customer.client_id,
      'created', false
    );
  end if;

  if found and v_customer.contract_id is not null then
    -- Already linked to a project — still ok for access; do not create a second prospect
    return jsonb_build_object(
      'customerId', v_customer.id,
      'clientId', v_customer.client_id,
      'created', false,
      'alreadyLinked', true
    );
  end if;

  v_company := coalesce(
    nullif(trim(p_company_name), ''),
    nullif(trim(v_full_name), ''),
    split_part(coalesce(v_email, 'client'), '@', 1)
  );

  insert into public.customers (
    company_name,
    contact_name,
    contact_email,
    contact_phone,
    user_id,
    client_id,
    claimed_at,
    contract_id,
    notes,
    is_active
  )
  values (
    v_company,
    nullif(trim(v_full_name), ''),
    case when v_email is not null then lower(trim(v_email)) else null end,
    nullif(trim(p_contact_phone), ''),
    v_uid,
    public.generate_client_id(),
    now(),
    null,
    nullif(trim(p_project_interest), ''),
    true
  )
  returning * into v_customer;

  perform public.write_access_audit(
    'client_prospect_registered',
    'customers',
    v_customer.id::text,
    jsonb_build_object('client_id', v_customer.client_id, 'company_name', v_customer.company_name)
  );

  return jsonb_build_object(
    'customerId', v_customer.id,
    'clientId', v_customer.client_id,
    'created', true
  );
end;
$$;

revoke all on function public.register_client_prospect(text, text, text) from public;
grant execute on function public.register_client_prospect(text, text, text) to authenticated;

-- Soften access copy for clients who still need setup
create or replace function public.get_my_access_status()
returns jsonb
language plpgsql
security definer
set search_path = public
stable
as $$
declare
  v_role text;
  v_uid uuid := auth.uid();
  v_assignments int := 0;
  v_subs int := 0;
  v_client_contracts int := 0;
  v_customer_linked boolean := false;
  v_onboarding boolean := false;
  v_must_email boolean := false;
  v_status text;
  v_reason text;
begin
  if v_uid is null then
    return jsonb_build_object('status', 'anonymous', 'reason', 'Not signed in');
  end if;

  select role, coalesce(onboarding_complete, false), coalesce(must_set_email, false)
  into v_role, v_onboarding, v_must_email
  from public.user_profiles
  where id = v_uid;

  if v_role is null then
    return jsonb_build_object('status', 'locked', 'reason', 'Profile missing');
  end if;

  if v_role in ('admin', 'owner') then
    return jsonb_build_object('status', 'ok', 'role', v_role, 'onboarding_complete', true);
  end if;

  select count(*) into v_assignments from public.contract_assignments where user_id = v_uid;
  select count(*) into v_subs from public.subcontractors where user_id = v_uid;
  select count(*) into v_client_contracts from public.contracts where client_user_id = v_uid;
  select exists(select 1 from public.customers where user_id = v_uid) into v_customer_linked;

  if v_role = 'subcontractor' then
    if v_subs > 0 then
      v_status := 'ok';
      v_reason := null;
    else
      v_status := 'needs_invite';
      v_reason := 'Enter your invite code from your GC';
    end if;
  elsif v_role = 'client' then
    if v_customer_linked or v_client_contracts > 0 then
      v_status := 'ok';
      v_reason := null;
    else
      v_status := 'needs_client_setup';
      v_reason := 'Register a project inquiry, or enter a Client ID if your GC already invited you';
    end if;
  elsif v_role in ('project_manager', 'field_supervisor') then
    if v_assignments > 0 then
      v_status := 'ok';
      v_reason := null;
    else
      v_status := 'locked';
      v_reason := 'Waiting for Owner to assign you to a project';
    end if;
  else
    v_status := 'ok';
    v_reason := null;
  end if;

  return jsonb_build_object(
    'status', v_status,
    'role', v_role,
    'reason', v_reason,
    'onboarding_complete', v_onboarding,
    'must_set_email', v_must_email,
    'assignment_count', v_assignments,
    'subcontractor_count', v_subs,
    'client_contract_count', v_client_contracts,
    'customer_linked', v_customer_linked
  );
end;
$$;

-- ---------------------------------------------------------------------------
-- Lead messaging threads (pre-contract)
-- ---------------------------------------------------------------------------
alter table public.message_threads
  alter column contract_id drop not null;

alter table public.message_threads
  add column if not exists customer_id uuid references public.customers (id) on delete cascade;

alter table public.message_threads
  add column if not exists thread_kind text;

update public.message_threads
set thread_kind = 'contract'
where thread_kind is null;

alter table public.message_threads
  alter column thread_kind set default 'contract';

alter table public.message_threads
  alter column thread_kind set not null;

alter table public.message_threads
  drop constraint if exists message_threads_thread_kind_check;

alter table public.message_threads
  add constraint message_threads_thread_kind_check
  check (thread_kind in ('contract', 'lead'));

alter table public.message_threads
  drop constraint if exists message_threads_contract_unique;

create unique index if not exists message_threads_contract_unique
  on public.message_threads (contract_id)
  where contract_id is not null and thread_kind = 'contract';

create unique index if not exists message_threads_lead_customer_unique
  on public.message_threads (customer_id)
  where customer_id is not null and thread_kind = 'lead';

alter table public.message_threads
  drop constraint if exists message_threads_kind_refs;

alter table public.message_threads
  add constraint message_threads_kind_refs check (
    (thread_kind = 'contract' and contract_id is not null)
    or (thread_kind = 'lead' and customer_id is not null and contract_id is null)
  );

comment on column public.message_threads.thread_kind is
  'contract = client↔PM on a job; lead = client↔owner/admin before a contract exists';

create or replace function public.start_or_get_customer_lead_thread(p_customer_id uuid default null)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_role text;
  v_customer public.customers%rowtype;
  v_thread_id uuid;
  v_customer_id uuid;
begin
  if v_uid is null then
    raise exception 'Not authenticated';
  end if;

  v_role := public.get_user_role();
  if v_role not in ('admin', 'owner', 'client') then
    raise exception 'Only clients and company owners/admins can use inquiry messaging';
  end if;

  if p_customer_id is not null then
    v_customer_id := p_customer_id;
  else
    select id into v_customer_id
    from public.customers
    where user_id = v_uid
    order by case when contract_id is null then 0 else 1 end, created_at desc
    limit 1;
  end if;

  if v_customer_id is null then
    raise exception 'No client record found. Register a project inquiry first.';
  end if;

  select * into v_customer
  from public.customers
  where id = v_customer_id
  for update;

  if not found then
    raise exception 'Client record not found';
  end if;

  if v_role = 'client' and v_customer.user_id is distinct from v_uid then
    raise exception 'You can only message about your own inquiry';
  end if;

  select id into v_thread_id
  from public.message_threads
  where thread_kind = 'lead'
    and customer_id = v_customer.id;

  if v_thread_id is not null then
    if v_customer.user_id is not null then
      insert into public.message_thread_participants (thread_id, user_id)
      values (v_thread_id, v_customer.user_id)
      on conflict do nothing;
    end if;

    insert into public.message_thread_participants (thread_id, user_id)
    select v_thread_id, up.id
    from public.user_profiles up
    where up.role in ('owner', 'admin')
    on conflict do nothing;

    insert into public.message_thread_participants (thread_id, user_id)
    values (v_thread_id, v_uid)
    on conflict do nothing;

    return v_thread_id;
  end if;

  insert into public.message_threads (contract_id, customer_id, thread_kind, created_by)
  values (null, v_customer.id, 'lead', v_uid)
  returning id into v_thread_id;

  if v_customer.user_id is not null then
    insert into public.message_thread_participants (thread_id, user_id)
    values (v_thread_id, v_customer.user_id)
    on conflict do nothing;
  end if;

  insert into public.message_thread_participants (thread_id, user_id)
  select v_thread_id, up.id
  from public.user_profiles up
  where up.role in ('owner', 'admin')
  on conflict do nothing;

  insert into public.message_thread_participants (thread_id, user_id)
  values (v_thread_id, v_uid)
  on conflict do nothing;

  return v_thread_id;
end;
$$;

revoke all on function public.start_or_get_customer_lead_thread(uuid) from public;
grant execute on function public.start_or_get_customer_lead_thread(uuid) to authenticated;

-- Link a prospect (or any customer) to a newly created / existing contract
create or replace function public.link_customer_to_contract(
  p_customer_id uuid,
  p_contract_id uuid
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_role text;
  v_customer public.customers%rowtype;
begin
  if auth.uid() is null then
    raise exception 'Not authenticated';
  end if;

  v_role := public.get_user_role();
  if v_role not in ('admin', 'owner', 'project_manager') then
    raise exception 'Not allowed';
  end if;

  if not exists (select 1 from public.contracts where id = p_contract_id) then
    raise exception 'Contract not found';
  end if;

  select * into v_customer
  from public.customers
  where id = p_customer_id
  for update;

  if not found then
    raise exception 'Customer not found';
  end if;

  update public.customers
  set contract_id = p_contract_id
  where id = p_customer_id;

  if v_customer.user_id is not null then
    update public.contracts
    set
      client_user_id = coalesce(client_user_id, v_customer.user_id),
      client_name = coalesce(nullif(trim(client_name), ''), v_customer.company_name, v_customer.contact_name),
      client_email = coalesce(nullif(trim(client_email), ''), v_customer.contact_email),
      client_phone = coalesce(nullif(trim(client_phone), ''), v_customer.contact_phone)
    where id = p_contract_id;
  else
    update public.contracts
    set
      client_name = coalesce(nullif(trim(client_name), ''), v_customer.company_name, v_customer.contact_name),
      client_email = coalesce(nullif(trim(client_email), ''), v_customer.contact_email),
      client_phone = coalesce(nullif(trim(client_phone), ''), v_customer.contact_phone)
    where id = p_contract_id;
  end if;

  perform public.write_access_audit(
    'customer_linked_to_contract',
    'customers',
    p_customer_id::text,
    jsonb_build_object('contract_id', p_contract_id)
  );
end;
$$;

revoke all on function public.link_customer_to_contract(uuid, uuid) from public;
grant execute on function public.link_customer_to_contract(uuid, uuid) to authenticated;

-- Allow lead-thread inserts via RPC (security definer); keep select via participant check.
drop policy if exists "message_threads_insert" on public.message_threads;
create policy "message_threads_insert"
  on public.message_threads
  for insert
  to authenticated
  with check (
    created_by = auth.uid()
    and (
      (
        thread_kind = 'contract'
        and contract_id is not null
        and public.can_message_contract(contract_id)
      )
      or (
        thread_kind = 'lead'
        and customer_id is not null
        and public.get_user_role() in ('admin', 'owner', 'client')
      )
    )
  );
