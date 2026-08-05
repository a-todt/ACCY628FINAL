-- Insurance tracking for GC policies, sub COIs, and contract requirements
-- (applied remotely; kept in repo for reference)

create table if not exists public.insurance_policies (
  id uuid primary key default gen_random_uuid(),
  holder_type text not null check (holder_type in ('gc', 'subcontractor')),
  subcontractor_id uuid references public.subcontractors (id) on delete cascade,
  policy_type text not null check (policy_type in (
    'general_liability', 'workers_comp', 'auto', 'umbrella',
    'builders_risk', 'professional_liability', 'other'
  )),
  carrier_name text,
  policy_number text,
  coverage_limit numeric(14, 2),
  effective_date date,
  expiration_date date,
  additional_insured boolean not null default false,
  waiver_of_subrogation boolean not null default false,
  document_url text,
  notes text,
  created_by uuid references auth.users (id),
  created_at timestamptz not null default now(),
  constraint insurance_policies_holder_check check (
    (holder_type = 'gc' and subcontractor_id is null)
    or (holder_type = 'subcontractor' and subcontractor_id is not null)
  )
);

create table if not exists public.contract_insurance_requirements (
  id uuid primary key default gen_random_uuid(),
  contract_id uuid not null references public.contracts (id) on delete cascade,
  policy_type text not null check (policy_type in (
    'general_liability', 'workers_comp', 'auto', 'umbrella',
    'builders_risk', 'professional_liability', 'other'
  )),
  minimum_limit numeric(14, 2),
  requires_additional_insured boolean not null default false,
  requires_waiver boolean not null default false,
  applies_to text not null default 'both' check (applies_to in ('gc', 'subcontractor', 'both')),
  notes text,
  created_at timestamptz not null default now(),
  unique (contract_id, policy_type, applies_to)
);
