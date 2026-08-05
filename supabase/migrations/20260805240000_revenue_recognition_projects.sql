-- Revenue recognition project tables (parallel to contracts-based app tables).
-- Note: public.change_orders already exists for contracts, so project COs use
-- public.project_change_orders with the same columns as requested.

create table if not exists public.projects (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users (id),
  project_name text not null,
  client_name text,
  original_contract_value numeric default 0,
  revised_contract_value numeric default 0,
  estimated_total_cost numeric default 0,
  start_date date,
  end_date date,
  status text not null default 'active',
  created_at timestamptz not null default now()
);

create table if not exists public.project_change_orders (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects (id) on delete cascade,
  user_id uuid references auth.users (id),
  change_order_number text,
  description text,
  amount numeric default 0,
  status text not null default 'pending',
  approved_date date,
  created_at timestamptz not null default now()
);

comment on table public.project_change_orders is
  'Revenue-recognition change orders for projects. Named project_change_orders because public.change_orders already serves contracts.';

create table if not exists public.project_costs (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects (id) on delete cascade,
  user_id uuid references auth.users (id),
  cost_date date,
  cost_category text,
  description text,
  amount numeric default 0,
  created_at timestamptz not null default now()
);

create table if not exists public.billings (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects (id) on delete cascade,
  user_id uuid references auth.users (id),
  billing_number text,
  billing_date date,
  amount_billed numeric default 0,
  retainage_held numeric default 0,
  net_amount numeric default 0,
  status text not null default 'submitted',
  created_at timestamptz not null default now()
);

create index if not exists idx_projects_user_id on public.projects (user_id);
create index if not exists idx_project_change_orders_project_id on public.project_change_orders (project_id);
create index if not exists idx_project_change_orders_user_id on public.project_change_orders (user_id);
create index if not exists idx_project_costs_project_id on public.project_costs (project_id);
create index if not exists idx_project_costs_user_id on public.project_costs (user_id);
create index if not exists idx_billings_project_id on public.billings (project_id);
create index if not exists idx_billings_user_id on public.billings (user_id);

alter table public.projects enable row level security;
alter table public.project_change_orders enable row level security;
alter table public.project_costs enable row level security;
alter table public.billings enable row level security;

-- projects
drop policy if exists "projects_select_own" on public.projects;
drop policy if exists "projects_insert_own" on public.projects;
drop policy if exists "projects_update_own" on public.projects;
drop policy if exists "projects_delete_own" on public.projects;

create policy "projects_select_own"
  on public.projects for select
  to authenticated
  using (user_id = auth.uid());

create policy "projects_insert_own"
  on public.projects for insert
  to authenticated
  with check (user_id = auth.uid());

create policy "projects_update_own"
  on public.projects for update
  to authenticated
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

create policy "projects_delete_own"
  on public.projects for delete
  to authenticated
  using (user_id = auth.uid());

-- project_change_orders
drop policy if exists "project_change_orders_select_own" on public.project_change_orders;
drop policy if exists "project_change_orders_insert_own" on public.project_change_orders;
drop policy if exists "project_change_orders_update_own" on public.project_change_orders;
drop policy if exists "project_change_orders_delete_own" on public.project_change_orders;

create policy "project_change_orders_select_own"
  on public.project_change_orders for select
  to authenticated
  using (user_id = auth.uid());

create policy "project_change_orders_insert_own"
  on public.project_change_orders for insert
  to authenticated
  with check (user_id = auth.uid());

create policy "project_change_orders_update_own"
  on public.project_change_orders for update
  to authenticated
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

create policy "project_change_orders_delete_own"
  on public.project_change_orders for delete
  to authenticated
  using (user_id = auth.uid());

-- project_costs
drop policy if exists "project_costs_select_own" on public.project_costs;
drop policy if exists "project_costs_insert_own" on public.project_costs;
drop policy if exists "project_costs_update_own" on public.project_costs;
drop policy if exists "project_costs_delete_own" on public.project_costs;

create policy "project_costs_select_own"
  on public.project_costs for select
  to authenticated
  using (user_id = auth.uid());

create policy "project_costs_insert_own"
  on public.project_costs for insert
  to authenticated
  with check (user_id = auth.uid());

create policy "project_costs_update_own"
  on public.project_costs for update
  to authenticated
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

create policy "project_costs_delete_own"
  on public.project_costs for delete
  to authenticated
  using (user_id = auth.uid());

-- billings
drop policy if exists "billings_select_own" on public.billings;
drop policy if exists "billings_insert_own" on public.billings;
drop policy if exists "billings_update_own" on public.billings;
drop policy if exists "billings_delete_own" on public.billings;

create policy "billings_select_own"
  on public.billings for select
  to authenticated
  using (user_id = auth.uid());

create policy "billings_insert_own"
  on public.billings for insert
  to authenticated
  with check (user_id = auth.uid());

create policy "billings_update_own"
  on public.billings for update
  to authenticated
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

create policy "billings_delete_own"
  on public.billings for delete
  to authenticated
  using (user_id = auth.uid());
