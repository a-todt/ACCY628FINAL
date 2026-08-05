-- Owner / Executive company management + tightened role access
-- admin  = internal team only (full access, not the business Owner UI)
-- owner  = actual GC company Owner/Executive (Management tab)

-- --------------------------------------------------------------------------
-- 1. Extend user_profiles for owner role + employee fields
-- --------------------------------------------------------------------------
alter table public.user_profiles
  drop constraint if exists user_profiles_role_check;

alter table public.user_profiles
  add constraint user_profiles_role_check
  check (role in (
    'admin',
    'owner',
    'project_manager',
    'field_supervisor',
    'subcontractor',
    'client'
  ));

alter table public.user_profiles
  add column if not exists employee_id text,
  add column if not exists is_active boolean not null default true,
  add column if not exists phone text,
  add column if not exists title text,
  add column if not exists deactivated_at timestamptz;

comment on column public.user_profiles.employee_id is
  'Internal employee ID for company staff (owner-managed).';

-- --------------------------------------------------------------------------
-- 2. Company settings (single-company row)
-- --------------------------------------------------------------------------
create table if not exists public.company_settings (
  id uuid primary key default gen_random_uuid(),
  company_name text not null default 'My General Contractor',
  gc_license_number text,
  gc_license_state text,
  gc_license_expiration date,
  address_line1 text,
  address_line2 text,
  city text,
  state text,
  postal_code text,
  logo_url text,
  default_retainage_percent numeric(5, 2) not null default 10,
  default_payment_terms text not null default 'Net 30',
  updated_at timestamptz not null default now(),
  updated_by uuid references auth.users (id) on delete set null
);

comment on table public.company_settings is
  'Single-company settings for the GC. Managed by Owner/Executive.';

insert into public.company_settings (company_name, gc_license_number, gc_license_state, gc_license_expiration, address_line1, city, state, postal_code, default_retainage_percent, default_payment_terms)
select
  'Midwest Building Group',
  'GC-448291',
  'IL',
  (current_date + interval '120 days')::date,
  '100 Construction Way',
  'Chicago',
  'IL',
  '60601',
  10,
  'Net 30'
where not exists (select 1 from public.company_settings);

-- --------------------------------------------------------------------------
-- 3. Employee certifications
-- --------------------------------------------------------------------------
create table if not exists public.employee_certifications (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.user_profiles (id) on delete cascade,
  certification_name text not null,
  certification_number text,
  issuing_body text,
  issued_date date,
  expiration_date date,
  notes text,
  created_at timestamptz not null default now()
);

create index if not exists idx_employee_certifications_user_id
  on public.employee_certifications (user_id);
create index if not exists idx_employee_certifications_expiration
  on public.employee_certifications (expiration_date);

-- --------------------------------------------------------------------------
-- 4. Assignment role on contract_assignments (PM vs supervisor)
-- --------------------------------------------------------------------------
alter table public.contract_assignments
  add column if not exists assignment_role text not null default 'field_supervisor'
    check (assignment_role in ('project_manager', 'field_supervisor'));

comment on column public.contract_assignments.assignment_role is
  'Whether the assignee is acting as PM or field supervisor on this contract.';

-- --------------------------------------------------------------------------
-- 5. External customers (directory; contracts may still use client_user_id)
-- --------------------------------------------------------------------------
create table if not exists public.customers (
  id uuid primary key default gen_random_uuid(),
  company_name text not null,
  contact_name text,
  contact_email text,
  contact_phone text,
  billing_address text,
  city text,
  state text,
  postal_code text,
  user_id uuid references auth.users (id) on delete set null,
  notes text,
  is_active boolean not null default true,
  created_at timestamptz not null default now()
);

create index if not exists idx_customers_user_id on public.customers (user_id);

-- --------------------------------------------------------------------------
-- 6. Subcontractor invite codes
-- --------------------------------------------------------------------------
alter table public.subcontractors
  add column if not exists license_number text,
  add column if not exists license_state text,
  add column if not exists license_expiration date;

create table if not exists public.subcontractor_invites (
  id uuid primary key default gen_random_uuid(),
  subcontractor_id uuid not null references public.subcontractors (id) on delete cascade,
  invite_code text not null unique,
  email text,
  expires_at timestamptz,
  accepted_at timestamptz,
  accepted_by uuid references auth.users (id) on delete set null,
  created_by uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default now()
);

create index if not exists idx_subcontractor_invites_code
  on public.subcontractor_invites (invite_code);
create index if not exists idx_subcontractor_invites_sub
  on public.subcontractor_invites (subcontractor_id);

-- --------------------------------------------------------------------------
-- 7. Access audit log
-- --------------------------------------------------------------------------
create table if not exists public.access_audit_log (
  id uuid primary key default gen_random_uuid(),
  actor_user_id uuid references auth.users (id) on delete set null,
  actor_email text,
  action text not null,
  entity_type text,
  entity_id text,
  details jsonb,
  ip_address text,
  created_at timestamptz not null default now()
);

create index if not exists idx_access_audit_log_created
  on public.access_audit_log (created_at desc);
create index if not exists idx_access_audit_log_actor
  on public.access_audit_log (actor_user_id);

-- --------------------------------------------------------------------------
-- 8. Helper functions
-- --------------------------------------------------------------------------
create or replace function public.is_owner()
returns boolean
language sql
security definer
set search_path = public
stable
as $$
  select coalesce(public.get_user_role() = 'owner', false);
$$;

create or replace function public.is_owner_or_admin()
returns boolean
language sql
security definer
set search_path = public
stable
as $$
  select coalesce(public.get_user_role() in ('owner', 'admin'), false);
$$;

-- Broader staff who can manage contracts/finance writes
create or replace function public.is_admin_or_pm()
returns boolean
language sql
security definer
set search_path = public
stable
as $$
  select coalesce(
    public.get_user_role() in ('admin', 'owner', 'project_manager'),
    false
  );
$$;

-- PMs only see assigned contracts; owner + admin see all
create or replace function public.can_access_contract(cid uuid)
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

  if v_role = 'project_manager' then
    return exists (
      select 1
      from public.contract_assignments ca
      where ca.contract_id = cid
        and ca.user_id = auth.uid()
    )
    or exists (
      select 1
      from public.contracts c
      where c.id = cid
        and c.user_id = auth.uid()
    );
  end if;

  if v_role = 'client' then
    return exists (
      select 1
      from public.contracts c
      where c.id = cid
        and c.client_user_id = auth.uid()
    )
    or exists (
      select 1
      from public.customers cust
      where cust.user_id = auth.uid()
        and exists (
          select 1 from public.contracts c
          where c.id = cid
            and (
              lower(coalesce(c.client_email, '')) = lower(coalesce(cust.contact_email, ''))
              or c.client_user_id = cust.user_id
            )
        )
    );
  end if;

  if v_role = 'field_supervisor' then
    return exists (
      select 1
      from public.contract_assignments ca
      where ca.contract_id = cid
        and ca.user_id = auth.uid()
    );
  end if;

  if v_role = 'subcontractor' then
    return exists (
      select 1
      from public.subcontractors s
      where s.contract_id = cid
        and s.user_id = auth.uid()
    );
  end if;

  return false;
end;
$$;

comment on function public.can_access_contract(uuid) is
  'admin/owner: all; PM: assigned or owned; client: linked project; field: assigned; sub: own subcontract only.';

-- Audit helper
create or replace function public.write_access_audit(
  p_action text,
  p_entity_type text default null,
  p_entity_id text default null,
  p_details jsonb default null
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_id uuid;
  v_email text;
begin
  select email into v_email from public.user_profiles where id = auth.uid();
  insert into public.access_audit_log (actor_user_id, actor_email, action, entity_type, entity_id, details)
  values (auth.uid(), v_email, p_action, p_entity_type, p_entity_id, p_details)
  returning id into v_id;
  return v_id;
end;
$$;

revoke all on function public.write_access_audit(text, text, text, jsonb) from public;
grant execute on function public.write_access_audit(text, text, text, jsonb) to authenticated;

-- Invite code generator
create or replace function public.generate_subcontractor_invite(
  p_subcontractor_id uuid,
  p_email text default null,
  p_days_valid int default 14
)
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  v_code text;
begin
  if not public.is_owner_or_admin() and not public.is_admin_or_pm() then
    raise exception 'Not authorized to create invite codes';
  end if;

  v_code := upper(substr(replace(gen_random_uuid()::text, '-', ''), 1, 10));

  insert into public.subcontractor_invites (
    subcontractor_id, invite_code, email, expires_at, created_by
  ) values (
    p_subcontractor_id,
    v_code,
    p_email,
    now() + make_interval(days => greatest(p_days_valid, 1)),
    auth.uid()
  );

  perform public.write_access_audit(
    'subcontractor_invite_created',
    'subcontractor',
    p_subcontractor_id::text,
    jsonb_build_object('invite_code', v_code, 'email', p_email)
  );

  return v_code;
end;
$$;

revoke all on function public.generate_subcontractor_invite(uuid, text, int) from public;
grant execute on function public.generate_subcontractor_invite(uuid, text, int) to authenticated;

-- Accept invite: link current user to subcontract
create or replace function public.accept_subcontractor_invite(p_code text)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_invite public.subcontractor_invites%rowtype;
begin
  select * into v_invite
  from public.subcontractor_invites
  where invite_code = upper(trim(p_code))
  for update;

  if not found then
    raise exception 'Invalid invite code';
  end if;
  if v_invite.accepted_at is not null then
    raise exception 'Invite already used';
  end if;
  if v_invite.expires_at is not null and v_invite.expires_at < now() then
    raise exception 'Invite expired';
  end if;

  update public.subcontractors
  set user_id = auth.uid()
  where id = v_invite.subcontractor_id;

  update public.user_profiles
  set role = 'subcontractor'
  where id = auth.uid()
    and role not in ('admin', 'owner');

  update public.subcontractor_invites
  set accepted_at = now(), accepted_by = auth.uid()
  where id = v_invite.id;

  perform public.write_access_audit(
    'subcontractor_invite_accepted',
    'subcontractor',
    v_invite.subcontractor_id::text,
    jsonb_build_object('invite_code', p_code)
  );

  return v_invite.subcontractor_id;
end;
$$;

revoke all on function public.accept_subcontractor_invite(text) from public;
grant execute on function public.accept_subcontractor_invite(text) to authenticated;

-- --------------------------------------------------------------------------
-- 9. RLS for new tables + policy refreshes
-- --------------------------------------------------------------------------
alter table public.company_settings enable row level security;
alter table public.employee_certifications enable row level security;
alter table public.customers enable row level security;
alter table public.subcontractor_invites enable row level security;
alter table public.access_audit_log enable row level security;

-- company_settings: all authenticated can read (branding); only owner/admin write
drop policy if exists "company_settings_select" on public.company_settings;
create policy "company_settings_select"
  on public.company_settings for select to authenticated
  using (true);

drop policy if exists "company_settings_update" on public.company_settings;
create policy "company_settings_update"
  on public.company_settings for update to authenticated
  using (public.is_owner_or_admin())
  with check (public.is_owner_or_admin());

drop policy if exists "company_settings_insert" on public.company_settings;
create policy "company_settings_insert"
  on public.company_settings for insert to authenticated
  with check (public.is_owner_or_admin());

-- employee certifications
drop policy if exists "employee_certifications_select" on public.employee_certifications;
create policy "employee_certifications_select"
  on public.employee_certifications for select to authenticated
  using (
    public.is_owner_or_admin()
    or user_id = auth.uid()
    or public.is_admin_or_pm()
  );

drop policy if exists "employee_certifications_write" on public.employee_certifications;
create policy "employee_certifications_insert"
  on public.employee_certifications for insert to authenticated
  with check (public.is_owner_or_admin());

drop policy if exists "employee_certifications_update" on public.employee_certifications;
create policy "employee_certifications_update"
  on public.employee_certifications for update to authenticated
  using (public.is_owner_or_admin())
  with check (public.is_owner_or_admin());

drop policy if exists "employee_certifications_delete" on public.employee_certifications;
create policy "employee_certifications_delete"
  on public.employee_certifications for delete to authenticated
  using (public.is_owner_or_admin());

-- customers
drop policy if exists "customers_select" on public.customers;
create policy "customers_select"
  on public.customers for select to authenticated
  using (
    public.is_owner_or_admin()
    or public.is_admin_or_pm()
    or user_id = auth.uid()
  );

drop policy if exists "customers_insert" on public.customers;
create policy "customers_insert"
  on public.customers for insert to authenticated
  with check (public.is_owner_or_admin() or public.is_admin_or_pm());

drop policy if exists "customers_update" on public.customers;
create policy "customers_update"
  on public.customers for update to authenticated
  using (public.is_owner_or_admin() or public.is_admin_or_pm())
  with check (public.is_owner_or_admin() or public.is_admin_or_pm());

drop policy if exists "customers_delete" on public.customers;
create policy "customers_delete"
  on public.customers for delete to authenticated
  using (public.is_owner_or_admin());

-- invites: managers see/create; invitee can read own unused code by email match is hard — allow select for managers only; accept via RPC
drop policy if exists "subcontractor_invites_select" on public.subcontractor_invites;
create policy "subcontractor_invites_select"
  on public.subcontractor_invites for select to authenticated
  using (public.is_owner_or_admin() or public.is_admin_or_pm());

drop policy if exists "subcontractor_invites_insert" on public.subcontractor_invites;
create policy "subcontractor_invites_insert"
  on public.subcontractor_invites for insert to authenticated
  with check (public.is_owner_or_admin() or public.is_admin_or_pm());

drop policy if exists "subcontractor_invites_update" on public.subcontractor_invites;
create policy "subcontractor_invites_update"
  on public.subcontractor_invites for update to authenticated
  using (public.is_owner_or_admin() or public.is_admin_or_pm() or accepted_by = auth.uid())
  with check (true);

-- audit log: owner/admin read; inserts via security definer function
drop policy if exists "access_audit_log_select" on public.access_audit_log;
create policy "access_audit_log_select"
  on public.access_audit_log for select to authenticated
  using (public.is_owner_or_admin());

drop policy if exists "access_audit_log_insert" on public.access_audit_log;
create policy "access_audit_log_insert"
  on public.access_audit_log for insert to authenticated
  with check (actor_user_id = auth.uid() or public.is_owner_or_admin());

-- Hide internal cost/margin data from subcontractors
drop policy if exists "cost_entries_select" on public.cost_entries;
create policy "cost_entries_select"
  on public.cost_entries for select to authenticated
  using (
    public.get_user_role() not in ('client', 'subcontractor')
    and public.can_access_contract(contract_id)
  );

drop policy if exists "invoices_select" on public.invoices;
create policy "invoices_select"
  on public.invoices for select to authenticated
  using (
    public.get_user_role() <> 'subcontractor'
    and public.can_access_contract(contract_id)
  );

drop policy if exists "payments_select" on public.payments;
create policy "payments_select"
  on public.payments for select to authenticated
  using (
    public.get_user_role() <> 'subcontractor'
    and exists (
      select 1 from public.invoices i
      where i.id = payments.invoice_id
        and public.can_access_contract(i.contract_id)
    )
  );

-- Subcontractors only see their own subcontract rows (not other subs on the job)
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
        and public.can_access_contract(contract_id)
      )
    )
  );

-- user_profiles: owner can manage team
drop policy if exists "user_profiles_select" on public.user_profiles;
create policy "user_profiles_select"
  on public.user_profiles for select to authenticated
  using (
    public.is_owner_or_admin()
    or public.is_admin_or_pm()
    or id = auth.uid()
  );

drop policy if exists "user_profiles_update_admin" on public.user_profiles;
create policy "user_profiles_update_admin"
  on public.user_profiles for update to authenticated
  using (public.is_owner_or_admin() or public.get_user_role() = 'admin')
  with check (public.is_owner_or_admin() or public.get_user_role() = 'admin');

-- contract_assignments: owner can manage
drop policy if exists "contract_assignments_select" on public.contract_assignments;
create policy "contract_assignments_select"
  on public.contract_assignments for select to authenticated
  using (
    public.is_owner_or_admin()
    or public.is_admin_or_pm()
    or user_id = auth.uid()
  );

drop policy if exists "contract_assignments_insert" on public.contract_assignments;
create policy "contract_assignments_insert"
  on public.contract_assignments for insert to authenticated
  with check (public.is_owner_or_admin() or public.is_admin_or_pm());

drop policy if exists "contract_assignments_update" on public.contract_assignments;
create policy "contract_assignments_update"
  on public.contract_assignments for update to authenticated
  using (public.is_owner_or_admin() or public.is_admin_or_pm())
  with check (public.is_owner_or_admin() or public.is_admin_or_pm());

drop policy if exists "contract_assignments_delete" on public.contract_assignments;
create policy "contract_assignments_delete"
  on public.contract_assignments for delete to authenticated
  using (public.is_owner_or_admin() or public.is_admin_or_pm());

-- Grant privileges on new tables
grant select, insert, update, delete on public.company_settings to authenticated;
grant select, insert, update, delete on public.employee_certifications to authenticated;
grant select, insert, update, delete on public.customers to authenticated;
grant select, insert, update, delete on public.subcontractor_invites to authenticated;
grant select, insert on public.access_audit_log to authenticated;
grant all on public.company_settings to service_role;
grant all on public.employee_certifications to service_role;
grant all on public.customers to service_role;
grant all on public.subcontractor_invites to service_role;
grant all on public.access_audit_log to service_role;

-- Assign demo PM to all contracts so existing demo still works after PM scoping
insert into public.contract_assignments (contract_id, user_id, assignment_role)
select c.id, p.id, 'project_manager'
from public.contracts c
cross join public.user_profiles p
where p.role = 'project_manager'
  and p.email = 'pm@gcmanager.demo'
on conflict (contract_id, user_id) do update
  set assignment_role = excluded.assignment_role;
