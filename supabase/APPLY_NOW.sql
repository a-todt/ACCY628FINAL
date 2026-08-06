-- ============================================================================
-- General Contract Management - Core Schema
-- ============================================================================
-- Tables, helper functions, triggers, and Row Level Security policies for a
-- general contractor contract management app. Roles: admin, project_manager,
-- field_supervisor, subcontractor, client.
--
-- Sections:
--   1. Extensions
--   2. Tables
--   3. Indexes
--   4. Helper functions (role / access checks)
--   5. New-user trigger (auth.users -> public.user_profiles)
--   6. Row Level Security policies
--   7. Grants
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 1. Extensions
-- ----------------------------------------------------------------------------
create extension if not exists pgcrypto;

-- ----------------------------------------------------------------------------
-- 2. Tables
-- ----------------------------------------------------------------------------

-- user_profiles: one row per auth user, drives role-based access.
create table if not exists public.user_profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  email text,
  full_name text,
  role text not null default 'field_supervisor'
    check (role in ('admin', 'project_manager', 'field_supervisor', 'subcontractor', 'client')),
  created_at timestamptz not null default now()
);

comment on table public.user_profiles is
  'One row per auth user. role drives access via RLS helper functions.';

-- contracts: top-level GC contracts.
create table if not exists public.contracts (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users (id),
  contract_name text not null,
  client_name text,
  client_email text,
  client_phone text,
  project_address text,
  city text,
  state text,
  contract_type text
    check (contract_type in ('fixed_price', 'cost_plus', 'time_and_materials')),
  original_value numeric(14, 2),
  retainage_percent numeric(5, 2) default 10,
  start_date date,
  end_date date,
  status text not null default 'active'
    check (status in ('active', 'completed', 'on_hold', 'canceled')),
  scope_description text,
  special_terms text,
  client_user_id uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default now()
);

comment on table public.contracts is
  'GC contracts. user_id = owning PM, client_user_id = optional linked client login.';

-- contract_assignments: staff (typically field supervisors) assigned to a contract.
create table if not exists public.contract_assignments (
  id uuid primary key default gen_random_uuid(),
  contract_id uuid not null references public.contracts (id) on delete cascade,
  user_id uuid not null references auth.users (id) on delete cascade,
  created_at timestamptz not null default now(),
  unique (contract_id, user_id)
);

comment on table public.contract_assignments is
  'Links a user (e.g. field supervisor) to a contract they can work on.';

-- change_orders: contract scope/value changes.
create table if not exists public.change_orders (
  id uuid primary key default gen_random_uuid(),
  contract_id uuid not null references public.contracts (id) on delete cascade,
  change_order_number text,
  description text,
  reason text,
  amount numeric(14, 2),
  status text not null default 'pending'
    check (status in ('pending', 'approved', 'rejected')),
  date_submitted date,
  date_resolved date,
  notes text,
  created_at timestamptz not null default now()
);

-- subcontractors: subcontractor engagements per contract.
create table if not exists public.subcontractors (
  id uuid primary key default gen_random_uuid(),
  contract_id uuid not null references public.contracts (id) on delete cascade,
  company_name text not null,
  contact_name text,
  contact_email text,
  contact_phone text,
  trade text,
  subcontract_value numeric(14, 2),
  amount_paid numeric(14, 2) not null default 0,
  retainage_percent numeric(5, 2) default 10,
  start_date date,
  end_date date,
  status text
    check (status in ('active', 'complete', 'terminated')),
  scope_of_work text,
  user_id uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default now()
);

comment on table public.subcontractors is
  'Subcontractor engagements. user_id optionally links a subcontractor login.';

-- cost_entries: internal job cost tracking.
create table if not exists public.cost_entries (
  id uuid primary key default gen_random_uuid(),
  contract_id uuid not null references public.contracts (id) on delete cascade,
  user_id uuid references auth.users (id),
  category text
    check (category in ('labor', 'materials', 'subcontractor', 'equipment', 'permits', 'other')),
  description text,
  amount numeric(14, 2),
  date_incurred date,
  notes text,
  created_at timestamptz not null default now()
);

comment on table public.cost_entries is
  'Internal job costs. Hidden from the client role via RLS.';

-- invoices: client-facing billing.
create table if not exists public.invoices (
  id uuid primary key default gen_random_uuid(),
  contract_id uuid not null references public.contracts (id) on delete cascade,
  invoice_number text,
  invoice_date date,
  due_date date,
  description text,
  invoice_amount numeric(14, 2),
  retainage_percent numeric(5, 2),
  retainage_amount numeric(14, 2),
  net_amount_due numeric(14, 2),
  amount_paid numeric(14, 2) not null default 0,
  status text
    check (status in ('unpaid', 'partially_paid', 'paid', 'overdue')),
  notes text,
  created_at timestamptz not null default now()
);

-- payments: payments received against invoices.
create table if not exists public.payments (
  id uuid primary key default gen_random_uuid(),
  invoice_id uuid not null references public.invoices (id) on delete cascade,
  payment_amount numeric(14, 2),
  payment_date date,
  payment_method text,
  reference_number text,
  notes text,
  created_at timestamptz not null default now()
);

-- field_logs: daily field/site reports.
create table if not exists public.field_logs (
  id uuid primary key default gen_random_uuid(),
  contract_id uuid not null references public.contracts (id) on delete cascade,
  user_id uuid references auth.users (id),
  log_date date,
  work_performed text,
  hours_worked numeric(6, 2),
  workers_on_site int,
  weather_conditions text,
  equipment_used text,
  materials_used text,
  issues_or_delays text,
  notes text,
  created_at timestamptz not null default now()
);

-- milestones: contract milestones/schedule of values.
create table if not exists public.milestones (
  id uuid primary key default gen_random_uuid(),
  contract_id uuid not null references public.contracts (id) on delete cascade,
  milestone_name text,
  milestone_value numeric(14, 2),
  due_date date,
  status text not null default 'pending'
    check (status in ('pending', 'in_progress', 'completed')),
  created_at timestamptz not null default now()
);

-- ----------------------------------------------------------------------------
-- 3. Indexes
-- ----------------------------------------------------------------------------
create index if not exists idx_contracts_user_id on public.contracts (user_id);
create index if not exists idx_contracts_client_user_id on public.contracts (client_user_id);
create index if not exists idx_contracts_status on public.contracts (status);

create index if not exists idx_contract_assignments_contract_id on public.contract_assignments (contract_id);
create index if not exists idx_contract_assignments_user_id on public.contract_assignments (user_id);

create index if not exists idx_change_orders_contract_id on public.change_orders (contract_id);
create index if not exists idx_change_orders_status on public.change_orders (status);

create index if not exists idx_subcontractors_contract_id on public.subcontractors (contract_id);
create index if not exists idx_subcontractors_user_id on public.subcontractors (user_id);

create index if not exists idx_cost_entries_contract_id on public.cost_entries (contract_id);
create index if not exists idx_cost_entries_user_id on public.cost_entries (user_id);

create index if not exists idx_invoices_contract_id on public.invoices (contract_id);
create index if not exists idx_invoices_status on public.invoices (status);

create index if not exists idx_payments_invoice_id on public.payments (invoice_id);

create index if not exists idx_field_logs_contract_id on public.field_logs (contract_id);
create index if not exists idx_field_logs_user_id on public.field_logs (user_id);

create index if not exists idx_milestones_contract_id on public.milestones (contract_id);

-- ----------------------------------------------------------------------------
-- 4. Helper functions
-- ----------------------------------------------------------------------------

-- Returns the caller's role from user_profiles (or null if no profile row).
create or replace function public.get_user_role()
returns text
language sql
security definer
set search_path = public
stable
as $$
  select role
  from public.user_profiles
  where id = auth.uid();
$$;

-- True if the caller is an admin or project_manager.
create or replace function public.is_admin_or_pm()
returns boolean
language sql
security definer
set search_path = public
stable
as $$
  select coalesce(public.get_user_role() in ('admin', 'project_manager'), false);
$$;

-- True if the caller may access the given contract, based on their role:
--   admin / project_manager : always
--   client                  : contracts.client_user_id = auth.uid()
--                              OR contracts.client_email matches the caller's profile email
--   field_supervisor        : assigned via contract_assignments
--   subcontractor           : has a subcontractors row on that contract
--   anything else           : false
create or replace function public.can_access_contract(cid uuid)
returns boolean
language plpgsql
security definer
set search_path = public
stable
as $$
declare
  v_role text;
  v_email text;
begin
  v_role := public.get_user_role();

  if v_role in ('admin', 'project_manager') then
    return true;
  end if;

  if v_role = 'client' then
    select email into v_email from public.user_profiles where id = auth.uid();

    return exists (
      select 1
      from public.contracts c
      where c.id = cid
        and (
          c.client_user_id = auth.uid()
          or (v_email is not null and lower(c.client_email) = lower(v_email))
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

-- ----------------------------------------------------------------------------
-- 5. New-user trigger
-- ----------------------------------------------------------------------------
-- Creates a user_profiles row whenever a new auth.users row is inserted.
-- Default role is field_supervisor; admins can promote users afterwards
-- (see the user_profiles RLS policies below).
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.user_profiles (id, email, full_name, role)
  values (
    new.id,
    new.email,
    new.raw_user_meta_data ->> 'full_name',
    'field_supervisor'
  )
  on conflict (id) do nothing;

  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;

create trigger on_auth_user_created
  after insert on auth.users
  for each row
  execute function public.handle_new_user();

-- ----------------------------------------------------------------------------
-- 6. Row Level Security
-- ----------------------------------------------------------------------------

alter table public.user_profiles enable row level security;
alter table public.contracts enable row level security;
alter table public.contract_assignments enable row level security;
alter table public.change_orders enable row level security;
alter table public.subcontractors enable row level security;
alter table public.cost_entries enable row level security;
alter table public.invoices enable row level security;
alter table public.payments enable row level security;
alter table public.field_logs enable row level security;
alter table public.milestones enable row level security;

-- user_profiles ---------------------------------------------------------------
-- Admin/PM can see every profile; everyone can see their own.
drop policy if exists "user_profiles_select" on public.user_profiles;
create policy "user_profiles_select"
  on public.user_profiles
  for select
  to authenticated
  using (
    public.is_admin_or_pm()
    or id = auth.uid()
  );

-- Fallback insert path for a user's own row (the trigger above normally
-- creates it via SECURITY DEFINER, which bypasses RLS).
drop policy if exists "user_profiles_insert_own" on public.user_profiles;
create policy "user_profiles_insert_own"
  on public.user_profiles
  for insert
  to authenticated
  with check (id = auth.uid());

-- Users may update their own row. This intentionally includes `role` (not
-- just full_name) to support the app's demo role switcher; restrict this in
-- a follow-up migration for production use.
drop policy if exists "user_profiles_update_own" on public.user_profiles;
create policy "user_profiles_update_own"
  on public.user_profiles
  for update
  to authenticated
  using (id = auth.uid())
  with check (id = auth.uid());

-- Admins can update any profile (e.g. changing another user's role).
drop policy if exists "user_profiles_update_admin" on public.user_profiles;
create policy "user_profiles_update_admin"
  on public.user_profiles
  for update
  to authenticated
  using (public.is_admin_or_pm())
  with check (true);

-- contracts ---------------------------------------------------------------------
drop policy if exists "contracts_select" on public.contracts;
create policy "contracts_select"
  on public.contracts
  for select
  to authenticated
  using (public.can_access_contract(id));

drop policy if exists "contracts_insert" on public.contracts;
create policy "contracts_insert"
  on public.contracts
  for insert
  to authenticated
  with check (
    public.is_admin_or_pm()
    and user_id = auth.uid()
  );

-- No UPDATE/DELETE policy on contracts in this version; add one in a later
-- migration (e.g. scoped to admin/pm) when contract editing is needed.

-- contract_assignments ------------------------------------------------------------
drop policy if exists "contract_assignments_select" on public.contract_assignments;
create policy "contract_assignments_select"
  on public.contract_assignments
  for select
  to authenticated
  using (
    public.is_admin_or_pm()
    or user_id = auth.uid()
  );

drop policy if exists "contract_assignments_insert" on public.contract_assignments;
create policy "contract_assignments_insert"
  on public.contract_assignments
  for insert
  to authenticated
  with check (public.is_admin_or_pm());

drop policy if exists "contract_assignments_delete" on public.contract_assignments;
create policy "contract_assignments_delete"
  on public.contract_assignments
  for delete
  to authenticated
  using (public.is_admin_or_pm());

-- change_orders ---------------------------------------------------------------------
-- Clients only ever see approved change orders; every other accessing role
-- sees all change orders on contracts they can access.
drop policy if exists "change_orders_select" on public.change_orders;
create policy "change_orders_select"
  on public.change_orders
  for select
  to authenticated
  using (
    public.can_access_contract(contract_id)
    and (
      public.get_user_role() <> 'client'
      or status = 'approved'
    )
  );

drop policy if exists "change_orders_insert" on public.change_orders;
create policy "change_orders_insert"
  on public.change_orders
  for insert
  to authenticated
  with check (
    public.is_admin_or_pm()
    and public.can_access_contract(contract_id)
  );

drop policy if exists "change_orders_update" on public.change_orders;
create policy "change_orders_update"
  on public.change_orders
  for update
  to authenticated
  using (public.is_admin_or_pm() and public.can_access_contract(contract_id))
  with check (public.is_admin_or_pm() and public.can_access_contract(contract_id));

drop policy if exists "change_orders_delete" on public.change_orders;
create policy "change_orders_delete"
  on public.change_orders
  for delete
  to authenticated
  using (public.is_admin_or_pm() and public.can_access_contract(contract_id));

-- subcontractors ---------------------------------------------------------------------
drop policy if exists "subcontractors_select" on public.subcontractors;
create policy "subcontractors_select"
  on public.subcontractors
  for select
  to authenticated
  using (public.can_access_contract(contract_id));

drop policy if exists "subcontractors_insert" on public.subcontractors;
create policy "subcontractors_insert"
  on public.subcontractors
  for insert
  to authenticated
  with check (
    public.is_admin_or_pm()
    and public.can_access_contract(contract_id)
  );

drop policy if exists "subcontractors_update" on public.subcontractors;
create policy "subcontractors_update"
  on public.subcontractors
  for update
  to authenticated
  using (public.is_admin_or_pm() and public.can_access_contract(contract_id))
  with check (public.is_admin_or_pm() and public.can_access_contract(contract_id));

drop policy if exists "subcontractors_delete" on public.subcontractors;
create policy "subcontractors_delete"
  on public.subcontractors
  for delete
  to authenticated
  using (public.is_admin_or_pm() and public.can_access_contract(contract_id));

-- cost_entries ---------------------------------------------------------------------
-- Clients never see cost entries (internal financials), regardless of
-- whether they can otherwise access the contract.
drop policy if exists "cost_entries_select" on public.cost_entries;
create policy "cost_entries_select"
  on public.cost_entries
  for select
  to authenticated
  using (
    public.get_user_role() <> 'client'
    and public.can_access_contract(contract_id)
  );

drop policy if exists "cost_entries_insert" on public.cost_entries;
create policy "cost_entries_insert"
  on public.cost_entries
  for insert
  to authenticated
  with check (
    public.can_access_contract(contract_id)
    and public.get_user_role() in ('admin', 'project_manager', 'field_supervisor', 'subcontractor')
  );

drop policy if exists "cost_entries_update" on public.cost_entries;
create policy "cost_entries_update"
  on public.cost_entries
  for update
  to authenticated
  using (
    public.is_admin_or_pm()
    or (user_id = auth.uid() and public.can_access_contract(contract_id))
  )
  with check (
    public.is_admin_or_pm()
    or (user_id = auth.uid() and public.can_access_contract(contract_id))
  );

drop policy if exists "cost_entries_delete" on public.cost_entries;
create policy "cost_entries_delete"
  on public.cost_entries
  for delete
  to authenticated
  using (
    public.is_admin_or_pm()
    or (user_id = auth.uid() and public.can_access_contract(contract_id))
  );

-- invoices ---------------------------------------------------------------------
-- Clients can see invoices (and their payment status) for their contracts.
drop policy if exists "invoices_select" on public.invoices;
create policy "invoices_select"
  on public.invoices
  for select
  to authenticated
  using (public.can_access_contract(contract_id));

drop policy if exists "invoices_insert" on public.invoices;
create policy "invoices_insert"
  on public.invoices
  for insert
  to authenticated
  with check (
    public.is_admin_or_pm()
    and public.can_access_contract(contract_id)
  );

drop policy if exists "invoices_update" on public.invoices;
create policy "invoices_update"
  on public.invoices
  for update
  to authenticated
  using (public.is_admin_or_pm() and public.can_access_contract(contract_id))
  with check (public.is_admin_or_pm() and public.can_access_contract(contract_id));

drop policy if exists "invoices_delete" on public.invoices;
create policy "invoices_delete"
  on public.invoices
  for delete
  to authenticated
  using (public.is_admin_or_pm() and public.can_access_contract(contract_id));

-- payments ---------------------------------------------------------------------
-- payments has no contract_id directly, so access is resolved through its
-- parent invoice's contract.
drop policy if exists "payments_select" on public.payments;
create policy "payments_select"
  on public.payments
  for select
  to authenticated
  using (
    exists (
      select 1
      from public.invoices i
      where i.id = payments.invoice_id
        and public.can_access_contract(i.contract_id)
    )
  );

drop policy if exists "payments_insert" on public.payments;
create policy "payments_insert"
  on public.payments
  for insert
  to authenticated
  with check (public.is_admin_or_pm());

drop policy if exists "payments_update" on public.payments;
create policy "payments_update"
  on public.payments
  for update
  to authenticated
  using (public.is_admin_or_pm())
  with check (public.is_admin_or_pm());

drop policy if exists "payments_delete" on public.payments;
create policy "payments_delete"
  on public.payments
  for delete
  to authenticated
  using (public.is_admin_or_pm());

-- field_logs ---------------------------------------------------------------------
drop policy if exists "field_logs_select" on public.field_logs;
create policy "field_logs_select"
  on public.field_logs
  for select
  to authenticated
  using (public.can_access_contract(contract_id));

drop policy if exists "field_logs_insert" on public.field_logs;
create policy "field_logs_insert"
  on public.field_logs
  for insert
  to authenticated
  with check (
    public.can_access_contract(contract_id)
    and public.get_user_role() in ('admin', 'project_manager', 'field_supervisor', 'subcontractor')
  );

drop policy if exists "field_logs_update" on public.field_logs;
create policy "field_logs_update"
  on public.field_logs
  for update
  to authenticated
  using (
    public.is_admin_or_pm()
    or (user_id = auth.uid() and public.can_access_contract(contract_id))
  )
  with check (
    public.is_admin_or_pm()
    or (user_id = auth.uid() and public.can_access_contract(contract_id))
  );

drop policy if exists "field_logs_delete" on public.field_logs;
create policy "field_logs_delete"
  on public.field_logs
  for delete
  to authenticated
  using (
    public.is_admin_or_pm()
    or (user_id = auth.uid() and public.can_access_contract(contract_id))
  );

-- milestones ---------------------------------------------------------------------
drop policy if exists "milestones_select" on public.milestones;
create policy "milestones_select"
  on public.milestones
  for select
  to authenticated
  using (public.can_access_contract(contract_id));

drop policy if exists "milestones_insert" on public.milestones;
create policy "milestones_insert"
  on public.milestones
  for insert
  to authenticated
  with check (
    public.is_admin_or_pm()
    and public.can_access_contract(contract_id)
  );

drop policy if exists "milestones_update" on public.milestones;
create policy "milestones_update"
  on public.milestones
  for update
  to authenticated
  using (public.is_admin_or_pm() and public.can_access_contract(contract_id))
  with check (public.is_admin_or_pm() and public.can_access_contract(contract_id));

drop policy if exists "milestones_delete" on public.milestones;
create policy "milestones_delete"
  on public.milestones
  for delete
  to authenticated
  using (public.is_admin_or_pm() and public.can_access_contract(contract_id));

-- ----------------------------------------------------------------------------
-- 7. Grants
-- ----------------------------------------------------------------------------
-- Base table privileges; actual row access is enforced by the RLS policies
-- above. service_role bypasses RLS entirely (standard Supabase behavior).
grant usage on schema public to authenticated, service_role;
grant select, insert, update, delete on all tables in schema public to authenticated;
grant all on all tables in schema public to service_role;


-- ========== DEMO ROLES ==========

-- Roles for demo users already created via Auth API.
-- Run AFTER SCHEMA_ONLY.sql

insert into public.user_profiles (id, email, full_name, role)
select u.id, u.email, coalesce(u.raw_user_meta_data->>'full_name', u.email), v.role
from auth.users u
join (
  values
    ('admin@gcmanager.demo', 'admin'),
    ('pm@gcmanager.demo', 'project_manager'),
    ('client@gcmanager.demo', 'client'),
    ('field@gcmanager.demo', 'field_supervisor'),
    ('sub@gcmanager.demo', 'subcontractor')
) as v(email, role) on lower(u.email) = lower(v.email)
on conflict (id) do update
  set email = excluded.email,
      full_name = excluded.full_name,
      role = excluded.role;


-- ----------------------------------------------------------------------------
-- Field supervisor contract summaries (safe limited browse of all contracts)
-- ----------------------------------------------------------------------------
create or replace function public.list_contract_summaries()
returns table (
  id uuid,
  contract_name text,
  client_name text,
  city text,
  state text,
  contract_type text,
  start_date date,
  end_date date,
  status text,
  supervised_by_me boolean
)
language sql
security definer
set search_path = ''
stable
as $$
  select
    c.id,
    c.contract_name,
    c.client_name,
    c.city,
    c.state,
    c.contract_type,
    c.start_date,
    c.end_date,
    c.status,
    exists (
      select 1
      from public.contract_assignments ca
      where ca.contract_id = c.id
        and ca.user_id = (select auth.uid())
    ) as supervised_by_me
  from public.contracts c
  where
    public.get_user_role() = 'field_supervisor'
    or public.can_access_contract(c.id)
  order by c.contract_name;
$$;

revoke all on function public.list_contract_summaries() from public;
grant execute on function public.list_contract_summaries() to authenticated;
