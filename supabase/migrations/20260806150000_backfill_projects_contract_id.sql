-- Ensure FK column exists (idempotent if 20260805250000 already applied).
alter table public.projects
  add column if not exists contract_id uuid
  references public.contracts (id) on delete set null;

create index if not exists idx_projects_contract_id
  on public.projects (contract_id);

-- Backfill projects.contract_id using the same name-match rules as matchWipProject
-- (case-insensitive trimmed names). Prefer projects owned by the contract owner.

-- 1) Same owner + matching name
update public.projects p
set contract_id = c.id
from public.contracts c
where p.contract_id is null
  and lower(trim(p.project_name)) = lower(trim(c.contract_name))
  and p.user_id = c.user_id;

-- 2) Remaining unmatched projects: any contract with the same name
--    (covers admin/demo WIP copies seeded alongside owner rows)
update public.projects p
set contract_id = c.id
from public.contracts c
where p.contract_id is null
  and lower(trim(p.project_name)) = lower(trim(c.contract_name));
