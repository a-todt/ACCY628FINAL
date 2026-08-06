-- Registered bidders appear in the subcontractors directory without a contract.

-- Allow directory rows (open bidders) with no project yet
alter table public.subcontractors
  alter column contract_id drop not null;

-- Add prospect status for self-registered bidders
alter table public.subcontractors
  drop constraint if exists subcontractors_status_check;

alter table public.subcontractors
  add constraint subcontractors_status_check
  check (status is null or status in ('active', 'complete', 'terminated', 'prospect'));

comment on column public.subcontractors.contract_id is
  'Project engagement when awarded; null for open/registered bidders not yet on a contract.';

-- Staff can see project engagements they can access, plus unassigned bidder directory rows
drop policy if exists "subcontractors_select" on public.subcontractors;
create policy "subcontractors_select"
  on public.subcontractors for select to authenticated
  using (
    public.get_user_role() <> 'client'
    and (
      (
        public.get_user_role() = 'subcontractor'
        and user_id = auth.uid()
      )
      or (
        public.get_user_role() <> 'subcontractor'
        and (
          contract_id is null
          or public.can_access_contract(contract_id)
        )
      )
    )
  );

-- Keep staff insert for project engagements; directory rows are created by trigger/RPC
drop policy if exists "subcontractors_insert" on public.subcontractors;
create policy "subcontractors_insert"
  on public.subcontractors for insert to authenticated
  with check (
    (
      public.is_admin_or_pm()
      or public.is_owner_or_admin()
    )
    and (
      contract_id is null
      or public.can_access_contract(contract_id)
    )
  );

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

-- Create directory row when a subcontractor signs up
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
begin
  v_role := lower(coalesce(new.raw_user_meta_data ->> 'intended_role', 'field_supervisor'));
  if v_role = 'owner' or v_role = 'admin' then
    v_role := 'field_supervisor';
  end if;
  if not (v_role = any (v_allowed)) then
    v_role := 'field_supervisor';
  end if;

  insert into public.user_profiles (id, email, full_name, role)
  values (
    new.id,
    new.email,
    new.raw_user_meta_data ->> 'full_name',
    v_role
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

comment on function public.ensure_subcontractor_directory_row(uuid, text, text, text, text, text) is
  'Creates or updates a subcontractors directory row for a registered bidder (contract_id null, status prospect).';
