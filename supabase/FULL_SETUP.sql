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


-- ========== SEED DATA ==========


-- ============================================================================
-- General Contract Management - Demo Seed Data
-- ============================================================================
-- Creates 5 demo logins (all password: Demo123!) and a realistic set of
-- contracts, change orders, subcontractors, cost entries, invoices,
-- payments, field logs, and milestones.
--
-- Demo logins:
--   admin@gcmanager.demo  - admin              (11111111-1111-1111-1111-111111111111)
--   pm@gcmanager.demo     - project_manager    (22222222-2222-2222-2222-222222222222)
--   client@gcmanager.demo - client             (33333333-3333-3333-3333-333333333333)
--   field@gcmanager.demo  - field_supervisor   (44444444-4444-4444-4444-444444444444)
--   sub@gcmanager.demo    - subcontractor      (55555555-5555-5555-5555-555555555555)
--
-- This file is safe to re-run: auth users / profiles are upserted, and the
-- 8 demo contracts (fixed ids) are deleted and recreated, which cascades to
-- remove all their change orders, subcontractors, cost entries, invoices,
-- payments, field logs, milestones, and assignments before reinserting.
-- ============================================================================

create extension if not exists pgcrypto;

-- ----------------------------------------------------------------------------
-- 1. Demo auth users
-- ----------------------------------------------------------------------------
insert into auth.users (
  instance_id, id, aud, role, email, encrypted_password,
  email_confirmed_at, raw_app_meta_data, raw_user_meta_data,
  created_at, updated_at, confirmation_token, recovery_token,
  email_change_token_new, email_change, is_sso_user, is_anonymous
)
values
  ('00000000-0000-0000-0000-000000000000', '11111111-1111-1111-1111-111111111111', 'authenticated', 'authenticated',
   'admin@gcmanager.demo', crypt('Demo123!', gen_salt('bf')), now(),
   '{"provider":"email","providers":["email"]}', '{"full_name":"Demo Admin"}',
   now(), now(), '', '', '', '', false, false),

  ('00000000-0000-0000-0000-000000000000', '22222222-2222-2222-2222-222222222222', 'authenticated', 'authenticated',
   'pm@gcmanager.demo', crypt('Demo123!', gen_salt('bf')), now(),
   '{"provider":"email","providers":["email"]}', '{"full_name":"Demo Project Manager"}',
   now(), now(), '', '', '', '', false, false),

  ('00000000-0000-0000-0000-000000000000', '33333333-3333-3333-3333-333333333333', 'authenticated', 'authenticated',
   'client@gcmanager.demo', crypt('Demo123!', gen_salt('bf')), now(),
   '{"provider":"email","providers":["email"]}', '{"full_name":"Demo Client"}',
   now(), now(), '', '', '', '', false, false),

  ('00000000-0000-0000-0000-000000000000', '44444444-4444-4444-4444-444444444444', 'authenticated', 'authenticated',
   'field@gcmanager.demo', crypt('Demo123!', gen_salt('bf')), now(),
   '{"provider":"email","providers":["email"]}', '{"full_name":"Demo Field Supervisor"}',
   now(), now(), '', '', '', '', false, false),

  ('00000000-0000-0000-0000-000000000000', '55555555-5555-5555-5555-555555555555', 'authenticated', 'authenticated',
   'sub@gcmanager.demo', crypt('Demo123!', gen_salt('bf')), now(),
   '{"provider":"email","providers":["email"]}', '{"full_name":"Demo Subcontractor"}',
   now(), now(), '', '', '', '', false, false)
on conflict (id) do nothing;

insert into auth.identities (
  id, user_id, identity_data, provider, provider_id, last_sign_in_at, created_at, updated_at
)
values
  (gen_random_uuid(), '11111111-1111-1111-1111-111111111111',
   jsonb_build_object('sub', '11111111-1111-1111-1111-111111111111', 'email', 'admin@gcmanager.demo'),
   'email', '11111111-1111-1111-1111-111111111111', now(), now(), now()),

  (gen_random_uuid(), '22222222-2222-2222-2222-222222222222',
   jsonb_build_object('sub', '22222222-2222-2222-2222-222222222222', 'email', 'pm@gcmanager.demo'),
   'email', '22222222-2222-2222-2222-222222222222', now(), now(), now()),

  (gen_random_uuid(), '33333333-3333-3333-3333-333333333333',
   jsonb_build_object('sub', '33333333-3333-3333-3333-333333333333', 'email', 'client@gcmanager.demo'),
   'email', '33333333-3333-3333-3333-333333333333', now(), now(), now()),

  (gen_random_uuid(), '44444444-4444-4444-4444-444444444444',
   jsonb_build_object('sub', '44444444-4444-4444-4444-444444444444', 'email', 'field@gcmanager.demo'),
   'email', '44444444-4444-4444-4444-444444444444', now(), now(), now()),

  (gen_random_uuid(), '55555555-5555-5555-5555-555555555555',
   jsonb_build_object('sub', '55555555-5555-5555-5555-555555555555', 'email', 'sub@gcmanager.demo'),
   'email', '55555555-5555-5555-5555-555555555555', now(), now(), now())
on conflict (provider, provider_id) do nothing;

-- The on_auth_user_created trigger (see migration) already created a
-- user_profiles row with role = field_supervisor for each user above; fix
-- up roles / names here so this file is idempotent regardless of trigger state.
insert into public.user_profiles (id, email, full_name, role)
values
  ('11111111-1111-1111-1111-111111111111', 'admin@gcmanager.demo', 'Demo Admin', 'admin'),
  ('22222222-2222-2222-2222-222222222222', 'pm@gcmanager.demo', 'Demo Project Manager', 'project_manager'),
  ('33333333-3333-3333-3333-333333333333', 'client@gcmanager.demo', 'Demo Client', 'client'),
  ('44444444-4444-4444-4444-444444444444', 'field@gcmanager.demo', 'Demo Field Supervisor', 'field_supervisor'),
  ('55555555-5555-5555-5555-555555555555', 'sub@gcmanager.demo', 'Demo Subcontractor', 'subcontractor')
on conflict (id) do update
  set email = excluded.email,
      full_name = excluded.full_name,
      role = excluded.role;

-- ----------------------------------------------------------------------------
-- 2. Clean slate for demo business data (cascades to all child tables)
-- ----------------------------------------------------------------------------
delete from public.contracts
where id in (
  'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaa1',
  'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaa2',
  'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaa3',
  'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaa4',
  'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaa5',
  'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaa6',
  'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaa7',
  'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaa8'
);

-- ----------------------------------------------------------------------------
-- 3. Contracts (8)
-- ----------------------------------------------------------------------------
-- a1 Downtown Office Tower Renovation   - active,    fixed_price      - linked client login
-- a2 Riverside Medical Center Expansion - active,    cost_plus        - linked client login
-- a3 Lakeside Apartments Phase 2        - completed, fixed_price      - linked client login, multiple approved COs
-- a4 Westside Retail Plaza              - active,    time_and_materials
-- a5 Northgate Warehouse Build-Out      - on_hold,   fixed_price
-- a6 Harbor View Condominiums           - active,    fixed_price      - UNPROFITABLE (costs > value)
-- a7 Cedar Grove Elementary Addition    - active,    cost_plus        - nearing end date, unpaid balance
-- a8 Metro Parking Structure            - canceled,  fixed_price
insert into public.contracts (
  id, user_id, contract_name, client_name, client_email, client_phone,
  project_address, city, state, contract_type, original_value, retainage_percent,
  start_date, end_date, status, scope_description, special_terms, client_user_id, created_at
)
values
  ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaa1', '22222222-2222-2222-2222-222222222222',
   'Downtown Office Tower Renovation', 'Meridian Holdings LLC', 'client@gcmanager.demo', '312-555-0101',
   '400 W Wacker Dr', 'Chicago', 'IL', 'fixed_price', 850000.00, 10,
   (current_date - interval '150 days')::date, (current_date + interval '60 days')::date, 'active',
   'Full interior renovation of floors 12-18 including MEP upgrades, new curtain wall sections, and lobby remodel.',
   'Liquidated damages of $1,500/day beyond substantial completion. Client supplies finish allowances separately.',
   '33333333-3333-3333-3333-333333333333', now() - interval '150 days'),

  ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaa2', '22222222-2222-2222-2222-222222222222',
   'Riverside Medical Center Expansion', 'Riverside Health Partners', 'client@gcmanager.demo', '217-555-0177',
   '1200 Riverside Pkwy', 'Springfield', 'IL', 'cost_plus', 1250000.00, 5,
   (current_date - interval '200 days')::date, (current_date + interval '120 days')::date, 'active',
   'New 2-story outpatient wing addition with imaging suite and shell/core buildout for future tenant.',
   'Cost-plus 12% fee. Monthly open-book cost reporting required per contract.',
   '33333333-3333-3333-3333-333333333333', now() - interval '200 days'),

  ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaa3', '22222222-2222-2222-2222-222222222222',
   'Lakeside Apartments Phase 2', 'Lakeside Development Group', 'client@gcmanager.demo', '630-555-0142',
   '88 Lakeside Dr', 'Naperville', 'IL', 'fixed_price', 640000.00, 10,
   (current_date - interval '365 days')::date, (current_date - interval '30 days')::date, 'completed',
   'Construction of 24-unit apartment building, phase 2 of a 3-phase master development.',
   'Retainage released upon final punch-list sign-off and certificate of occupancy.',
   '33333333-3333-3333-3333-333333333333', now() - interval '365 days'),

  ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaa4', '22222222-2222-2222-2222-222222222222',
   'Westside Retail Plaza', 'Westside Retail Partners LLC', 'facilities@westsideretail.com', '630-555-0199',
   '2200 Ogden Ave', 'Aurora', 'IL', 'time_and_materials', 425000.00, 10,
   (current_date - interval '90 days')::date, (current_date + interval '90 days')::date, 'active',
   'Tenant improvement build-out of 4 retail suites plus shared common-area upgrades.',
   'Billed T&M monthly with GC markup of 15% on labor and 10% on materials.',
   null, now() - interval '90 days'),

  ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaa5', '22222222-2222-2222-2222-222222222222',
   'Northgate Warehouse Build-Out', 'Northgate Logistics Inc', 'ops@northgatelogistics.com', '815-555-0163',
   '5500 Northgate Rd', 'Rockford', 'IL', 'fixed_price', 980000.00, 10,
   (current_date - interval '45 days')::date, (current_date + interval '150 days')::date, 'on_hold',
   'New 60,000 sq ft distribution warehouse with racking infrastructure and dock upgrades.',
   'Project placed on hold pending client financing confirmation; remobilization TBD.',
   null, now() - interval '45 days'),

  ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaa6', '22222222-2222-2222-2222-222222222222',
   'Harbor View Condominiums', 'Harbor View Condo Association', 'board@harborviewcondos.org', '847-555-0128',
   '77 Harbor View Ln', 'Evanston', 'IL', 'fixed_price', 720000.00, 10,
   (current_date - interval '220 days')::date, (current_date + interval '20 days')::date, 'active',
   'Exterior envelope restoration and balcony waterproofing across 3 condominium towers.',
   'Fixed price bid; unforeseen structural remediation has driven costs above original scope.',
   null, now() - interval '220 days'),

  ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaa7', '22222222-2222-2222-2222-222222222222',
   'Cedar Grove Elementary Addition', 'Cedar Grove School District 47', 'purchasing@cgsd47.org', '847-555-0155',
   '900 Cedar Grove Rd', 'Elgin', 'IL', 'cost_plus', 1100000.00, 5,
   (current_date - interval '300 days')::date, (current_date + interval '12 days')::date, 'active',
   'New 6-classroom addition with ADA-compliant ramp and connector corridor to main building.',
   'Cost-plus 10% fee. Substantial completion required before start of fall semester.',
   null, now() - interval '300 days'),

  ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaa8', '22222222-2222-2222-2222-222222222222',
   'Metro Parking Structure', 'Metro Transit Authority', 'contracts@metrotransit.gov', '312-555-0187',
   '150 Transit Plaza', 'Joliet', 'IL', 'fixed_price', 300000.00, 10,
   (current_date - interval '400 days')::date, (current_date - interval '200 days')::date, 'canceled',
   'Precast parking structure repair and restriping for downtown transit hub, levels 2-4.',
   'Contract canceled by owner after funding was reallocated; final closeout invoice outstanding.',
   null, now() - interval '400 days')
on conflict (id) do nothing;

-- ----------------------------------------------------------------------------
-- 4. Contract assignments - field supervisor on several active contracts
-- ----------------------------------------------------------------------------
insert into public.contract_assignments (contract_id, user_id)
values
  ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaa1', '44444444-4444-4444-4444-444444444444'),
  ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaa2', '44444444-4444-4444-4444-444444444444'),
  ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaa4', '44444444-4444-4444-4444-444444444444'),
  ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaa6', '44444444-4444-4444-4444-444444444444'),
  ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaa7', '44444444-4444-4444-4444-444444444444')
on conflict (contract_id, user_id) do nothing;

-- ----------------------------------------------------------------------------
-- 5. Subcontractors (10) - demo subcontractor login linked to "Apex Electrical LLC"
--    across 3 contracts; row #9 is an overpayment scenario (amount_paid > value).
-- ----------------------------------------------------------------------------
insert into public.subcontractors (
  contract_id, company_name, contact_name, contact_email, contact_phone, trade,
  subcontract_value, amount_paid, retainage_percent, start_date, end_date, status,
  scope_of_work, user_id
)
values
  ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaa1', 'Apex Electrical LLC', 'Marco Diaz', 'marco@apexelectrical.demo', '312-555-0210',
   'Electrical', 95000.00, 95000.00, 10, (current_date - interval '140 days')::date, (current_date - interval '20 days')::date,
   'complete', 'Full electrical rough-in and finish for floors 12-18.', '55555555-5555-5555-5555-555555555555'),

  ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaa1', 'Summit Plumbing Co', 'Rachel Kim', 'rachel@summitplumbing.demo', '312-555-0219',
   'Plumbing', 78000.00, 60000.00, 10, (current_date - interval '130 days')::date, (current_date + interval '10 days')::date,
   'active', 'Restroom core relocation and domestic water riser upgrades.', null),

  ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaa2', 'Apex Electrical LLC', 'Marco Diaz', 'marco@apexelectrical.demo', '312-555-0210',
   'Electrical', 145000.00, 100000.00, 5, (current_date - interval '180 days')::date, (current_date + interval '30 days')::date,
   'active', 'Imaging suite shielding electrical and emergency power tie-ins.', '55555555-5555-5555-5555-555555555555'),

  ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaa2', 'BlueSky Mechanical HVAC', 'Tom Reyes', 'tom@blueskymech.demo', '217-555-0233',
   'HVAC', 210000.00, 180000.00, 5, (current_date - interval '170 days')::date, (current_date + interval '40 days')::date,
   'active', 'Air handling units, ductwork, and controls for new outpatient wing.', null),

  ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaa3', 'Apex Electrical LLC', 'Marco Diaz', 'marco@apexelectrical.demo', '312-555-0210',
   'Electrical', 68000.00, 68000.00, 10, (current_date - interval '350 days')::date, (current_date - interval '60 days')::date,
   'complete', 'Unit electrical rough-in and panel installs for 24-unit building.', '55555555-5555-5555-5555-555555555555'),

  ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaa3', 'Granite Concrete Works', 'Nina Alvarez', 'nina@graniteconcrete.demo', '630-555-0244',
   'Concrete', 92000.00, 92000.00, 10, (current_date - interval '360 days')::date, (current_date - interval '80 days')::date,
   'complete', 'Foundation, slab-on-grade, and balcony concrete work.', null),

  ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaa4', 'Precision Framing Inc', 'Deacon Wells', 'deacon@precisionframing.demo', '630-555-0256',
   'Framing', 110000.00, 70000.00, 10, (current_date - interval '85 days')::date, (current_date + interval '30 days')::date,
   'active', 'Metal stud framing and drywall substrate for 4 retail suites.', null),

  ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaa5', 'TopLine Roofing Co', 'Sam Patterson', 'sam@toplineroofing.demo', '815-555-0267',
   'Roofing', 130000.00, 40000.00, 10, (current_date - interval '40 days')::date, (current_date + interval '60 days')::date,
   'active', 'TPO roof membrane replacement and dock canopy structures.', null),

  ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaa6', 'Coastal Drywall & Paint', 'Elena Cho', 'elena@coastaldp.demo', '847-555-0278',
   'Drywall/Paint', 85000.00, 92000.00, 10, (current_date - interval '200 days')::date, (current_date + interval '5 days')::date,
   'active', 'Interior corridor drywall repair and full exterior painting, all 3 towers.', null),

  ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaa7', 'Reliable Landscaping LLC', 'Owen Park', 'owen@reliablelandscaping.demo', '847-555-0289',
   'Landscaping', 45000.00, 20000.00, 5, (current_date - interval '60 days')::date, (current_date + interval '30 days')::date,
   'active', 'Site restoration, sod, and plantings around new classroom addition.', null);

-- ----------------------------------------------------------------------------
-- 6. Change orders (15) - mix of pending / approved / rejected
--    a3 has 3 approved COs that increase the effective contract value.
-- ----------------------------------------------------------------------------
insert into public.change_orders (
  contract_id, change_order_number, description, reason, amount, status,
  date_submitted, date_resolved, notes
)
values
  ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaa1', 'CO-1001', 'Additional electrical panel upgrade, floor 15', 'Existing panel capacity insufficient for new tenant load.',
   25000.00, 'approved', (current_date - interval '60 days')::date, (current_date - interval '50 days')::date, 'Approved by client PM via email.'),
  ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaa1', 'CO-1002', 'Add glass partition walls, floor 16 conference suite', 'Client requested design change after walkthrough.',
   10000.00, 'pending', (current_date - interval '10 days')::date, null, 'Awaiting client sign-off.'),
  ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaa1', 'CO-1014', 'Upgrade lobby flooring to premium marble', 'Client-requested finish upgrade.',
   5000.00, 'rejected', (current_date - interval '80 days')::date, (current_date - interval '70 days')::date, 'Rejected; over allowance budget, client opted to keep standard finish.'),

  ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaa2', 'CO-1003', 'Expand MRI suite shielding and electrical capacity', 'Equipment vendor spec changed after design was finalized.',
   60000.00, 'approved', (current_date - interval '90 days')::date, (current_date - interval '80 days')::date, 'Approved; billed cost-plus per contract terms.'),
  ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaa2', 'CO-1004', 'Add rooftop generator enclosure', 'Owner-requested scope addition.',
   15000.00, 'rejected', (current_date - interval '40 days')::date, (current_date - interval '30 days')::date, 'Owner deferred to future phase.'),
  ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaa2', 'CO-1015', 'Additional nurse call system wiring', 'Added device count requested by clinical staff.',
   9000.00, 'pending', (current_date - interval '5 days')::date, null, 'Under review by facilities director.'),

  ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaa3', 'CO-1005', 'Add balconies to units 201-210', 'Client requested added amenity mid-construction.',
   45000.00, 'approved', (current_date - interval '300 days')::date, (current_date - interval '290 days')::date, 'Approved and incorporated into final invoice.'),
  ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaa3', 'CO-1006', 'Upgrade unit finishes package B', 'Client upgraded finish selections after model unit walkthrough.',
   30000.00, 'approved', (current_date - interval '250 days')::date, (current_date - interval '240 days')::date, 'Approved and incorporated into final invoice.'),
  ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaa3', 'CO-1007', 'Add covered parking canopy', 'Owner requested added amenity for phase 2 marketing.',
   18000.00, 'approved', (current_date - interval '200 days')::date, (current_date - interval '190 days')::date, 'Approved; final value now exceeds original contract value.'),

  ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaa4', 'CO-1008', 'Add exterior signage package', 'New tenant requested additional monument signage.',
   8000.00, 'pending', (current_date - interval '8 days')::date, null, 'Pending tenant landlord approval.'),

  ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaa5', 'CO-1009', 'Add mezzanine storage level', 'Client explored added storage capacity during hold.',
   20000.00, 'rejected', (current_date - interval '25 days')::date, (current_date - interval '15 days')::date, 'Rejected pending remobilization decision.'),

  ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaa6', 'CO-1010', 'Balcony waterproofing remediation, towers B and C', 'Unforeseen structural deterioration discovered during demo.',
   35000.00, 'approved', (current_date - interval '100 days')::date, (current_date - interval '90 days')::date, 'Approved; major driver of cost overrun on this contract.'),
  ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaa6', 'CO-1011', 'Upgrade to corrosion-resistant HVAC condenser units', 'Coastal exposure required upgraded equipment spec.',
   18000.00, 'pending', (current_date - interval '15 days')::date, null, 'Awaiting condo board vote.'),

  ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaa7', 'CO-1012', 'ADA ramp reconfiguration', 'Site survey revealed grade issue not in original design.',
   22000.00, 'approved', (current_date - interval '60 days')::date, (current_date - interval '50 days')::date, 'Approved; required for occupancy permit.'),

  ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaa8', 'CO-1013', 'Add security booth at level 2 entrance', 'Owner requested added security presence.',
   10000.00, 'rejected', (current_date - interval '350 days')::date, (current_date - interval '340 days')::date, 'Rejected prior to contract cancellation.');

-- ----------------------------------------------------------------------------
-- 7. Cost entries (30) - a6 intentionally exceeds its contract value.
-- ----------------------------------------------------------------------------
insert into public.cost_entries (contract_id, category, description, amount, date_incurred, notes)
values
  -- a1 (value 850,000)
  ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaa1', 'labor', 'Framing and drywall crew, floors 12-14', 84000.00, (current_date - interval '100 days')::date, null),
  ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaa1', 'materials', 'Curtain wall glazing units and hardware', 112000.00, (current_date - interval '80 days')::date, null),
  ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaa1', 'subcontractor', 'Apex Electrical LLC - progress billing', 95000.00, (current_date - interval '60 days')::date, 'Matches subcontractor payment.'),
  ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaa1', 'equipment', 'Scissor lift and scaffolding rental', 18000.00, (current_date - interval '40 days')::date, null),

  -- a2 (value 1,250,000)
  ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaa2', 'labor', 'MEP coordination and general labor', 130000.00, (current_date - interval '160 days')::date, null),
  ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaa2', 'materials', 'Structural steel and imaging suite shielding materials', 165000.00, (current_date - interval '130 days')::date, null),
  ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaa2', 'subcontractor', 'BlueSky Mechanical HVAC - progress billing', 145000.00, (current_date - interval '90 days')::date, null),
  ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaa2', 'permits', 'Building and mechanical permit fees', 22000.00, (current_date - interval '190 days')::date, null),

  -- a3 (value 640,000, completed)
  ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaa3', 'labor', 'General labor, all trades, full project', 95000.00, (current_date - interval '320 days')::date, null),
  ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaa3', 'materials', 'Lumber, roofing, and finish materials', 140000.00, (current_date - interval '280 days')::date, null),
  ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaa3', 'subcontractor', 'Concrete and electrical subcontractor billings', 160000.00, (current_date - interval '150 days')::date, 'Combined Apex Electrical + Granite Concrete billings.'),
  ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaa3', 'other', 'Final punch-list and cleanup costs', 25000.00, (current_date - interval '35 days')::date, null),

  -- a4 (value 425,000, time_and_materials)
  ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaa4', 'labor', 'Carpentry crew, retail suite build-out', 40000.00, (current_date - interval '70 days')::date, null),
  ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaa4', 'materials', 'Drywall, ceiling grid, and storefront materials', 55000.00, (current_date - interval '55 days')::date, null),
  ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaa4', 'subcontractor', 'Precision Framing Inc - progress billing', 70000.00, (current_date - interval '40 days')::date, null),
  ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaa4', 'equipment', 'Dumpster service and small tool rental', 9000.00, (current_date - interval '30 days')::date, null),

  -- a5 (value 980,000, on_hold)
  ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaa5', 'labor', 'Site prep and mobilization labor', 30000.00, (current_date - interval '44 days')::date, null),
  ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaa5', 'materials', 'Structural steel deposit', 48000.00, (current_date - interval '43 days')::date, null),
  ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaa5', 'subcontractor', 'TopLine Roofing Co - mobilization billing', 40000.00, (current_date - interval '38 days')::date, null),
  ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaa5', 'permits', 'Warehouse building permit', 6000.00, (current_date - interval '44 days')::date, null),

  -- a6 (value 720,000) - UNPROFITABLE: total costs = 742,000 > original_value
  ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaa6', 'labor', 'Structural remediation labor, towers A-C', 220000.00, (current_date - interval '190 days')::date, 'Scope grew significantly after demo exposed rot/corrosion.'),
  ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaa6', 'materials', 'Waterproofing membrane, sealants, and replacement precast', 300000.00, (current_date - interval '150 days')::date, null),
  ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaa6', 'subcontractor', 'Coastal Drywall & Paint - progress billing', 92000.00, (current_date - interval '100 days')::date, 'Subcontractor overpaid relative to contract value; see subcontractors table.'),
  ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaa6', 'equipment', 'Swing stage and suspended scaffold rental, 3 towers', 50000.00, (current_date - interval '80 days')::date, null),
  ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaa6', 'permits', 'Facade work permits and inspections', 20000.00, (current_date - interval '210 days')::date, null),
  ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaa6', 'other', 'Engineering assessment and remediation design changes', 60000.00, (current_date - interval '170 days')::date, 'Unbudgeted structural engineering fees.'),

  -- a7 (value 1,100,000)
  ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaa7', 'labor', 'Classroom addition framing and finish labor', 110000.00, (current_date - interval '200 days')::date, null),
  ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaa7', 'materials', 'Structural steel, masonry, and roofing materials', 150000.00, (current_date - interval '160 days')::date, null),
  ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaa7', 'subcontractor', 'Reliable Landscaping LLC - progress billing', 20000.00, (current_date - interval '50 days')::date, null),
  ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaa7', 'other', 'Temporary fencing and site safety measures', 15000.00, (current_date - interval '280 days')::date, null);

-- ----------------------------------------------------------------------------
-- 8. Invoices (12) - fixed ids so payments can reference them.
--    b08 is overdue by more than 60 days; b11 is an unpaid balance on a
--    contract nearing its end date (a7).
-- ----------------------------------------------------------------------------
insert into public.invoices (
  id, contract_id, invoice_number, invoice_date, due_date, description,
  invoice_amount, retainage_percent, retainage_amount, net_amount_due,
  amount_paid, status, notes
)
values
  ('bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbb001', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaa1', 'INV-1001',
   (current_date - interval '100 days')::date, (current_date - interval '70 days')::date, 'Progress billing #1 - floors 12-14',
   300000.00, 10, 30000.00, 270000.00, 270000.00, 'paid', 'Paid in two installments.'),

  ('bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbb002', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaa1', 'INV-1002',
   (current_date - interval '40 days')::date, (current_date - interval '10 days')::date, 'Progress billing #2 - floors 15-16',
   250000.00, 10, 25000.00, 225000.00, 120000.00, 'partially_paid', 'Balance pending client review of CO-1002.'),

  ('bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbb003', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaa2', 'INV-1003',
   (current_date - interval '150 days')::date, (current_date - interval '120 days')::date, 'Progress billing #1 - sitework and foundations',
   400000.00, 5, 20000.00, 380000.00, 380000.00, 'paid', null),

  ('bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbb004', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaa2', 'INV-1004',
   (current_date - interval '60 days')::date, (current_date - interval '30 days')::date, 'Progress billing #2 - structural steel and MEP rough-in',
   350000.00, 5, 17500.00, 332500.00, 200000.00, 'partially_paid', null),

  ('bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbb005', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaa3', 'INV-1005',
   (current_date - interval '300 days')::date, (current_date - interval '270 days')::date, 'Progress billing #1 - foundations and framing',
   350000.00, 10, 35000.00, 315000.00, 315000.00, 'paid', null),

  ('bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbb006', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaa3', 'INV-1006',
   (current_date - interval '60 days')::date, (current_date - interval '30 days')::date, 'Final billing including approved change orders CO-1005/1006/1007',
   133000.00, 0, 0.00, 133000.00, 133000.00, 'paid', 'Retainage released on final invoice after certificate of occupancy.'),

  ('bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbb007', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaa4', 'INV-1007',
   (current_date - interval '20 days')::date, (current_date + interval '10 days')::date, 'T&M billing - month 3',
   120000.00, 10, 12000.00, 108000.00, 0.00, 'unpaid', null),

  ('bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbb008', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaa4', 'INV-1008',
   (current_date - interval '100 days')::date, (current_date - interval '75 days')::date, 'T&M billing - month 1',
   95000.00, 10, 9500.00, 85500.00, 0.00, 'overdue', 'Over 60 days past due; client accounts payable unresponsive.'),

  ('bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbb009', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaa5', 'INV-1009',
   (current_date - interval '30 days')::date, current_date, 'Progress billing #1 - mobilization and site prep',
   150000.00, 10, 15000.00, 135000.00, 0.00, 'unpaid', 'On hold pending client financing; billing paused.'),

  ('bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbb010', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaa6', 'INV-1010',
   (current_date - interval '90 days')::date, (current_date - interval '60 days')::date, 'Progress billing #2 - remediation and waterproofing',
   280000.00, 10, 28000.00, 252000.00, 150000.00, 'partially_paid', 'Condo association disputing part of remediation scope.'),

  ('bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbb011', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaa7', 'INV-1011',
   (current_date - interval '15 days')::date, (current_date + interval '5 days')::date, 'Progress billing #3 - final classroom finishes',
   200000.00, 5, 10000.00, 190000.00, 0.00, 'unpaid', 'Contract nears end date with a significant unpaid balance.'),

  ('bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbb012', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaa8', 'INV-1012',
   (current_date - interval '190 days')::date, (current_date - interval '160 days')::date, 'Closeout billing prior to cancellation',
   80000.00, 10, 8000.00, 72000.00, 0.00, 'unpaid', 'Outstanding closeout invoice after owner canceled contract.')
on conflict (id) do nothing;

-- ----------------------------------------------------------------------------
-- 9. Payments (8)
-- ----------------------------------------------------------------------------
insert into public.payments (invoice_id, payment_amount, payment_date, payment_method, reference_number, notes)
values
  ('bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbb001', 150000.00, (current_date - interval '95 days')::date, 'ACH', 'PMT-1001', 'First installment.'),
  ('bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbb001', 120000.00, (current_date - interval '55 days')::date, 'Check', 'PMT-1002', 'Final installment, paid in full.'),
  ('bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbb002', 120000.00, (current_date - interval '20 days')::date, 'ACH', 'PMT-1003', 'Partial payment; balance held pending CO approval.'),
  ('bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbb003', 380000.00, (current_date - interval '140 days')::date, 'Wire', 'PMT-1004', null),
  ('bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbb004', 200000.00, (current_date - interval '25 days')::date, 'ACH', 'PMT-1005', 'Partial payment.'),
  ('bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbb005', 315000.00, (current_date - interval '290 days')::date, 'Wire', 'PMT-1006', null),
  ('bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbb006', 133000.00, (current_date - interval '50 days')::date, 'Check', 'PMT-1007', 'Final payment including retainage release.'),
  ('bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbb010', 150000.00, (current_date - interval '70 days')::date, 'ACH', 'PMT-1008', 'Partial payment while scope dispute is resolved.');

-- ----------------------------------------------------------------------------
-- 10. Field logs (15)
-- ----------------------------------------------------------------------------
insert into public.field_logs (
  contract_id, user_id, log_date, work_performed, hours_worked, workers_on_site,
  weather_conditions, equipment_used, materials_used, issues_or_delays, notes
)
values
  ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaa1', '44444444-4444-4444-4444-444444444444', (current_date - interval '95 days')::date,
   'Continued electrical rough-in on floor 15, began drywall hang on floor 14.', 9.5, 12, 'Clear, 68F', 'Scissor lifts (2), material hoist', 'Metal studs, drywall sheets, conduit', null, null),
  ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaa1', '55555555-5555-5555-5555-555555555555', (current_date - interval '75 days')::date,
   'Electrical panel install and circuit testing, floor 15.', 8.0, 4, 'Clear, 70F', 'Hand tools, panel lift', 'Breaker panels, wire', null, 'Panel upgrade tied to CO-1001.'),
  ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaa1', '44444444-4444-4444-4444-444444444444', (current_date - interval '30 days')::date,
   'Curtain wall glazing install, floors 16-17.', 10.0, 10, 'Windy, 55F', 'Boom lift, glazing rig', 'Glazing units, sealant', 'High winds halted work for 2 hours.', null),

  ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaa2', '44444444-4444-4444-4444-444444444444', (current_date - interval '120 days')::date,
   'Structural steel erection for new outpatient wing.', 10.0, 14, 'Clear, 60F', 'Crane, welding rigs', 'Structural steel, welding rod', null, null),
  ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaa2', '44444444-4444-4444-4444-444444444444', (current_date - interval '85 days')::date,
   'MEP rough-in continues; imaging suite shielding install begins.', 9.0, 11, 'Rain, 58F', 'Material hoist', 'Lead shielding panels, conduit', 'Minor delay due to material delivery.', null),
  ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaa2', '55555555-5555-5555-5555-555555555555', (current_date - interval '55 days')::date,
   'Electrical tie-ins for emergency power system.', 8.5, 5, 'Clear, 64F', 'Hand tools', 'Conduit, wire, transfer switch parts', null, null),

  ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaa3', '44444444-4444-4444-4444-444444444444', (current_date - interval '250 days')::date,
   'Framing complete on units 201-210, balcony additions per CO-1005 underway.', 9.0, 13, 'Clear, 72F', 'Nail guns, saws', 'Framing lumber, hardware', null, null),
  ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaa3', '44444444-4444-4444-4444-444444444444', (current_date - interval '45 days')::date,
   'Final punch-list walkthrough with client and inspector.', 6.0, 4, 'Clear, 66F', null, 'Touch-up paint, hardware', null, 'Certificate of occupancy issued same week.'),

  ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaa4', '44444444-4444-4444-4444-444444444444', (current_date - interval '65 days')::date,
   'Framing and drywall substrate install, suites A and B.', 8.0, 7, 'Clear, 71F', 'Hand tools', 'Metal studs, drywall', null, null),
  ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaa4', '44444444-4444-4444-4444-444444444444', (current_date - interval '25 days')::date,
   'Storefront glazing and signage rough-in.', 8.0, 6, 'Overcast, 62F', 'Boom lift', 'Storefront glazing, conduit', null, 'Signage scope pending CO-1008 approval.'),

  ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaa5', '44444444-4444-4444-4444-444444444444', (current_date - interval '44 days')::date,
   'Site mobilization and erosion control installed.', 8.0, 6, 'Clear, 75F', 'Excavator, compactor', 'Silt fence, gravel', null, 'Project placed on hold shortly after this log.'),
  ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaa5', '44444444-4444-4444-4444-444444444444', (current_date - interval '38 days')::date,
   'Roofing subcontractor mobilized, materials staged on site.', 5.0, 3, 'Clear, 73F', 'Forklift', 'Roofing membrane rolls', 'Work paused pending owner remobilization notice.', null),

  ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaa6', '44444444-4444-4444-4444-444444444444', (current_date - interval '180 days')::date,
   'Demo of deteriorated balcony sections, tower A.', 9.0, 10, 'Clear, 58F', 'Jackhammers, debris chute', 'N/A', 'Discovered extensive rebar corrosion beyond original scope.', 'Led to CO-1010 for remediation.'),
  ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaa6', '55555555-5555-5555-5555-555555555555', (current_date - interval '90 days')::date,
   'Drywall repair and priming, interior corridors towers B and C.', 8.0, 8, 'Clear, 61F', 'Scaffolding', 'Drywall compound, primer', null, null),

  ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaa7', '44444444-4444-4444-4444-444444444444', (current_date - interval '20 days')::date,
   'Interior finishes and casework install in new classrooms.', 9.0, 9, 'Clear, 70F', 'Hand tools', 'Casework, flooring, paint', null, 'On track for substantial completion before school year.');

-- ----------------------------------------------------------------------------
-- 11. Milestones (20)
-- ----------------------------------------------------------------------------
insert into public.milestones (contract_id, milestone_name, milestone_value, due_date, status)
values
  ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaa1', 'Demo and abatement complete', 85000.00, (current_date - interval '110 days')::date, 'completed'),
  ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaa1', 'MEP rough-in complete, floors 12-16', 220000.00, (current_date - interval '30 days')::date, 'in_progress'),
  ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaa1', 'Substantial completion', 850000.00, (current_date + interval '60 days')::date, 'pending'),

  ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaa2', 'Sitework and foundations complete', 250000.00, (current_date - interval '140 days')::date, 'completed'),
  ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaa2', 'Structural steel topped out', 300000.00, (current_date - interval '60 days')::date, 'in_progress'),

  ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaa3', 'Foundation and framing complete', 350000.00, (current_date - interval '280 days')::date, 'completed'),
  ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaa3', 'Interior finishes complete', 200000.00, (current_date - interval '60 days')::date, 'completed'),
  ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaa3', 'Certificate of occupancy issued', 90000.00, (current_date - interval '30 days')::date, 'completed'),

  ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaa4', 'Suites A and B ready for tenant fixturing', 200000.00, (current_date - interval '15 days')::date, 'completed'),
  ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaa4', 'Suites C and D ready for tenant fixturing', 225000.00, (current_date + interval '45 days')::date, 'in_progress'),

  ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaa5', 'Site mobilization and erosion control', 60000.00, (current_date - interval '44 days')::date, 'completed'),
  ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaa5', 'Building shell and roof complete', 500000.00, (current_date + interval '150 days')::date, 'pending'),

  ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaa6', 'Tower A demo and remediation complete', 260000.00, (current_date - interval '150 days')::date, 'completed'),
  ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaa6', 'Tower B and C waterproofing complete', 260000.00, (current_date - interval '30 days')::date, 'in_progress'),
  ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaa6', 'Final painting and punch-list', 200000.00, (current_date + interval '20 days')::date, 'pending'),

  ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaa7', 'Foundation and structural steel complete', 400000.00, (current_date - interval '200 days')::date, 'completed'),
  ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaa7', 'Building envelope and roofing complete', 350000.00, (current_date - interval '60 days')::date, 'completed'),
  ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaa7', 'Final finishes and occupancy', 350000.00, (current_date + interval '12 days')::date, 'in_progress'),

  ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaa8', 'Level 2-3 repair complete', 150000.00, (current_date - interval '260 days')::date, 'completed'),
  ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaa8', 'Level 4 repair and restriping', 150000.00, (current_date - interval '210 days')::date, 'in_progress');
