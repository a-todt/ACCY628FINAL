-- Safety / injury incidents: PM & field log them; owners/admins review.

create table if not exists public.safety_incidents (
  id uuid primary key default gen_random_uuid(),
  contract_id uuid not null references public.contracts (id) on delete cascade,
  reported_by uuid references public.user_profiles (id) on delete set null,
  incident_date date not null default current_date,
  incident_type text not null default 'injury'
    check (incident_type in ('injury', 'near_miss', 'property_damage', 'other')),
  severity text not null default 'low'
    check (severity in ('low', 'medium', 'high')),
  status text not null default 'open'
    check (status in ('open', 'closed')),
  injured_party text,
  description text not null,
  corrective_action text,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_safety_incidents_contract
  on public.safety_incidents (contract_id);
create index if not exists idx_safety_incidents_date
  on public.safety_incidents (incident_date desc);
create index if not exists idx_safety_incidents_status
  on public.safety_incidents (status);

comment on table public.safety_incidents is
  'Job-site injury / near-miss / damage incidents reported by PM or field for owner review.';

alter table public.safety_incidents enable row level security;

drop policy if exists "safety_incidents_select" on public.safety_incidents;
create policy "safety_incidents_select"
  on public.safety_incidents for select to authenticated
  using (
    public.get_user_role() in ('admin', 'owner', 'project_manager', 'field_supervisor')
    and public.can_access_contract(contract_id)
  );

drop policy if exists "safety_incidents_insert" on public.safety_incidents;
create policy "safety_incidents_insert"
  on public.safety_incidents for insert to authenticated
  with check (
    public.get_user_role() in ('admin', 'owner', 'project_manager', 'field_supervisor')
    and public.can_access_contract(contract_id)
    and (reported_by is null or reported_by = auth.uid())
  );

drop policy if exists "safety_incidents_update" on public.safety_incidents;
create policy "safety_incidents_update"
  on public.safety_incidents for update to authenticated
  using (
    public.get_user_role() in ('admin', 'owner', 'project_manager')
    or (
      public.get_user_role() = 'field_supervisor'
      and reported_by = auth.uid()
    )
  )
  with check (
    public.get_user_role() in ('admin', 'owner', 'project_manager', 'field_supervisor')
    and public.can_access_contract(contract_id)
  );

drop policy if exists "safety_incidents_delete" on public.safety_incidents;
create policy "safety_incidents_delete"
  on public.safety_incidents for delete to authenticated
  using (public.get_user_role() in ('admin', 'owner', 'project_manager'));

grant select, insert, update, delete on public.safety_incidents to authenticated;
grant all on public.safety_incidents to service_role;

-- Demo seed (idempotent by description; attaches to earliest contracts)
insert into public.safety_incidents (
  contract_id, reported_by, incident_date, incident_type, severity, status,
  injured_party, description, corrective_action
)
select
  c.id,
  up.id,
  v.incident_date::date,
  v.incident_type,
  v.severity,
  v.status,
  v.injured_party,
  v.description,
  v.corrective_action
from (
  values
    (1, 'pm@gcmanager.demo', current_date - 12, 'injury', 'medium', 'closed',
      'Subcontractor laborer (drywall)',
      'Worker strained lower back while lifting sheetrock without a panel lift.',
      'Toolbox talk on lifting; panel lift required for sheets over 4x8.'),
    (2, 'field@gcmanager.demo', current_date - 5, 'near_miss', 'high', 'open',
      null,
      'Unsecured scaffold plank shifted when a worker stepped on it; no fall occurred.',
      'Scaffold inspected and tagged; daily scaffold checklist enforced.'),
    (3, 'pm2@gcmanager.demo', current_date - 2, 'injury', 'low', 'open',
      'Field crew member',
      'Minor cut to hand from metal edge while installing decking. First aid only.',
      'Cut-resistant gloves required for decking install.'),
    (4, 'field2@gcmanager.demo', current_date - 20, 'property_damage', 'medium', 'closed',
      null,
      'Forklift brushed a finished drywall corner while staging materials.',
      'Spotter required in finished corridors; damaged corner patched.')
) as v(ord, reporter_email, incident_date, incident_type, severity, status, injured_party, description, corrective_action)
join lateral (
  select id from public.contracts order by created_at offset (v.ord - 1) limit 1
) c on true
left join public.user_profiles up on lower(up.email) = lower(v.reporter_email)
where not exists (
  select 1
  from public.safety_incidents si
  where si.description = v.description
);
