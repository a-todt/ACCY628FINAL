-- PMs/Accounting/Admin can list & manage company WIP projects (not only own user_id rows).
-- Subcontractors who sign up are auto-added to the bidder directory and unlocked.

-- ---------------------------------------------------------------------------
-- WIP projects RLS
-- ---------------------------------------------------------------------------
drop policy if exists "projects_select_own" on public.projects;
drop policy if exists "projects_insert_own" on public.projects;
drop policy if exists "projects_update_own" on public.projects;
drop policy if exists "projects_delete_own" on public.projects;

create policy "projects_select_own"
  on public.projects for select to authenticated
  using (public.is_admin_or_pm() or user_id = auth.uid());

create policy "projects_insert_own"
  on public.projects for insert to authenticated
  with check (public.is_admin_or_pm() and user_id = auth.uid());

create policy "projects_update_own"
  on public.projects for update to authenticated
  using (public.is_admin_or_pm() or user_id = auth.uid())
  with check (public.is_admin_or_pm() or user_id = auth.uid());

create policy "projects_delete_own"
  on public.projects for delete to authenticated
  using (public.is_admin_or_pm() or user_id = auth.uid());

drop policy if exists "project_costs_select_own" on public.project_costs;
drop policy if exists "project_costs_insert_own" on public.project_costs;
drop policy if exists "project_costs_update_own" on public.project_costs;
drop policy if exists "project_costs_delete_own" on public.project_costs;

create policy "project_costs_select_own"
  on public.project_costs for select to authenticated
  using (public.is_admin_or_pm() or user_id = auth.uid());

create policy "project_costs_insert_own"
  on public.project_costs for insert to authenticated
  with check (public.is_admin_or_pm() and user_id = auth.uid());

create policy "project_costs_update_own"
  on public.project_costs for update to authenticated
  using (public.is_admin_or_pm() or user_id = auth.uid())
  with check (public.is_admin_or_pm() or user_id = auth.uid());

create policy "project_costs_delete_own"
  on public.project_costs for delete to authenticated
  using (public.is_admin_or_pm() or user_id = auth.uid());

drop policy if exists "billings_select_own" on public.billings;
drop policy if exists "billings_insert_own" on public.billings;
drop policy if exists "billings_update_own" on public.billings;
drop policy if exists "billings_delete_own" on public.billings;

create policy "billings_select_own"
  on public.billings for select to authenticated
  using (public.is_admin_or_pm() or user_id = auth.uid());

create policy "billings_insert_own"
  on public.billings for insert to authenticated
  with check (public.is_admin_or_pm() and user_id = auth.uid());

create policy "billings_update_own"
  on public.billings for update to authenticated
  using (public.is_admin_or_pm() or user_id = auth.uid())
  with check (public.is_admin_or_pm() or user_id = auth.uid());

create policy "billings_delete_own"
  on public.billings for delete to authenticated
  using (public.is_admin_or_pm() or user_id = auth.uid());

drop policy if exists "project_change_orders_select_own" on public.project_change_orders;
drop policy if exists "project_change_orders_insert_own" on public.project_change_orders;
drop policy if exists "project_change_orders_update_own" on public.project_change_orders;
drop policy if exists "project_change_orders_delete_own" on public.project_change_orders;

create policy "project_change_orders_select_own"
  on public.project_change_orders for select to authenticated
  using (public.is_admin_or_pm() or user_id = auth.uid());

create policy "project_change_orders_insert_own"
  on public.project_change_orders for insert to authenticated
  with check (public.is_admin_or_pm() and user_id = auth.uid());

create policy "project_change_orders_update_own"
  on public.project_change_orders for update to authenticated
  using (public.is_admin_or_pm() or user_id = auth.uid())
  with check (public.is_admin_or_pm() or user_id = auth.uid());

create policy "project_change_orders_delete_own"
  on public.project_change_orders for delete to authenticated
  using (public.is_admin_or_pm() or user_id = auth.uid());

-- ---------------------------------------------------------------------------
-- Subcontractor auto directory + unlocked access
-- ---------------------------------------------------------------------------
alter table public.subcontractors
  alter column contract_id drop not null;

alter table public.subcontractors
  drop constraint if exists subcontractors_status_check;

alter table public.subcontractors
  add constraint subcontractors_status_check
  check (status is null or status in ('active', 'complete', 'terminated', 'prospect'));

create or replace function public.ensure_subcontractor_directory_row(
  p_user_id uuid,
  p_company_name text,
  p_contact_name text default null,
  p_contact_email text default null,
  p_contact_phone text default null,
  p_trade text default null
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_id uuid;
  v_company text;
begin
  if p_user_id is null then
    raise exception 'user id required';
  end if;

  select id into v_id
  from public.subcontractors
  where user_id = p_user_id
  order by created_at asc
  limit 1;

  if v_id is not null then
    update public.subcontractors
    set
      company_name = coalesce(nullif(trim(p_company_name), ''), company_name),
      contact_name = coalesce(nullif(trim(p_contact_name), ''), contact_name),
      contact_email = coalesce(nullif(trim(p_contact_email), ''), contact_email),
      contact_phone = coalesce(nullif(trim(p_contact_phone), ''), contact_phone),
      trade = coalesce(nullif(trim(p_trade), ''), trade)
    where id = v_id;
    return v_id;
  end if;

  v_company := coalesce(nullif(trim(p_company_name), ''), nullif(trim(p_contact_email), ''), 'Registered bidder');

  insert into public.subcontractors (
    contract_id,
    company_name,
    contact_name,
    contact_email,
    contact_phone,
    trade,
    status,
    user_id,
    subcontract_value,
    amount_paid
  ) values (
    null,
    v_company,
    nullif(trim(p_contact_name), ''),
    nullif(trim(p_contact_email), ''),
    nullif(trim(p_contact_phone), ''),
    nullif(trim(p_trade), ''),
    'prospect',
    p_user_id,
    null,
    0
  )
  returning id into v_id;

  return v_id;
end;
$$;

revoke all on function public.ensure_subcontractor_directory_row(uuid, text, text, text, text, text) from public;
grant execute on function public.ensure_subcontractor_directory_row(uuid, text, text, text, text, text) to authenticated;

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_role text;
  v_allowed text[] := array[
    'admin',
    'owner',
    'project_manager',
    'field_supervisor',
    'subcontractor',
    'client'
  ];
  v_company text;
  v_onboarding boolean := false;
begin
  v_role := lower(coalesce(new.raw_user_meta_data ->> 'intended_role', 'field_supervisor'));
  if v_role = 'owner' or v_role = 'admin' then
    v_role := 'field_supervisor';
  end if;
  if not (v_role = any (v_allowed)) then
    v_role := 'field_supervisor';
  end if;

  v_onboarding := v_role in ('subcontractor', 'project_manager');

  insert into public.user_profiles (id, email, full_name, role, onboarding_complete)
  values (
    new.id,
    new.email,
    new.raw_user_meta_data ->> 'full_name',
    v_role,
    v_onboarding
  )
  on conflict (id) do nothing;

  if v_role = 'subcontractor' then
    v_company := coalesce(
      nullif(trim(new.raw_user_meta_data ->> 'company_name'), ''),
      nullif(trim(new.raw_user_meta_data ->> 'full_name'), ''),
      new.email,
      'Registered bidder'
    );
    perform public.ensure_subcontractor_directory_row(
      new.id,
      v_company,
      coalesce(
        nullif(trim(new.raw_user_meta_data ->> 'contact_name'), ''),
        nullif(trim(new.raw_user_meta_data ->> 'full_name'), '')
      ),
      new.email,
      nullif(trim(new.raw_user_meta_data ->> 'contact_phone'), ''),
      nullif(trim(new.raw_user_meta_data ->> 'trade'), '')
    );
  end if;

  return new;
end;
$$;

create or replace function public.get_my_access_status()
returns jsonb
language plpgsql
stable
security definer
set search_path to 'public'
as $function$
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

  if v_role = 'project_manager' then
    return jsonb_build_object(
      'status', 'ok',
      'role', v_role,
      'reason', null,
      'onboarding_complete', true,
      'must_set_email', v_must_email
    );
  end if;

  if v_role = 'subcontractor' then
    return jsonb_build_object(
      'status', 'ok',
      'role', v_role,
      'reason', null,
      'onboarding_complete', true,
      'must_set_email', v_must_email
    );
  end if;

  select count(*) into v_assignments from public.contract_assignments where user_id = v_uid;
  select count(*) into v_subs from public.subcontractors where user_id = v_uid;
  select count(*) into v_client_contracts from public.contracts where client_user_id = v_uid;
  select exists(select 1 from public.customers where user_id = v_uid) into v_customer_linked;

  if v_role = 'client' then
    if v_customer_linked or v_client_contracts > 0 then
      v_status := 'ok';
      v_reason := null;
    else
      v_status := 'needs_client_setup';
      v_reason := 'Register a project inquiry, or enter a Client ID if your GC already invited you';
    end if;
  elsif v_role = 'field_supervisor' then
    if v_assignments > 0 then
      v_status := 'ok';
      v_reason := null;
    else
      v_status := 'locked';
      v_reason := 'Waiting for a Project Manager to assign you to a project';
    end if;
  else
    v_status := 'ok';
    v_reason := null;
  end if;

  return jsonb_build_object(
    'status', v_status,
    'role', v_role,
    'reason', v_reason,
    'onboarding_complete', case when v_role = 'field_supervisor' then v_onboarding else true end,
    'must_set_email', v_must_email,
    'assignment_count', v_assignments,
    'subcontractor_count', v_subs,
    'client_contract_count', v_client_contracts,
    'customer_linked', v_customer_linked
  );
end;
$function$;

insert into public.subcontractors (
  contract_id, company_name, contact_name, contact_email, trade, status, user_id, subcontract_value, amount_paid
)
select
  null,
  coalesce(nullif(trim(up.full_name), ''), up.email, 'Registered bidder'),
  up.full_name,
  up.email,
  null,
  'prospect',
  up.id,
  null,
  0
from public.user_profiles up
where up.role = 'subcontractor'
  and not exists (
    select 1 from public.subcontractors s where s.user_id = up.id
  );

update public.user_profiles
set onboarding_complete = true
where role in ('subcontractor', 'project_manager')
  and coalesce(onboarding_complete, false) = false;
