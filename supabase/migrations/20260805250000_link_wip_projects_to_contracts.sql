-- Link revenue-recognition projects to the GC contracts they represent.
alter table public.projects
  add column if not exists contract_id uuid
  references public.contracts (id) on delete set null;

create index if not exists idx_projects_contract_id
  on public.projects (contract_id);
