-- Tighten client access: only contracts linked via client_user_id.
-- Hide field logs and subcontractors from clients.

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

  if v_role in ('admin', 'project_manager') then
    return true;
  end if;

  if v_role = 'client' then
    return exists (
      select 1
      from public.contracts c
      where c.id = cid
        and c.client_user_id = auth.uid()
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
  'Role-based contract access. Clients: only contracts where client_user_id = auth.uid().';

drop policy if exists "field_logs_select" on public.field_logs;
create policy "field_logs_select"
  on public.field_logs
  for select
  to authenticated
  using (
    public.get_user_role() <> 'client'
    and public.can_access_contract(contract_id)
  );

drop policy if exists "subcontractors_select" on public.subcontractors;
create policy "subcontractors_select"
  on public.subcontractors
  for select
  to authenticated
  using (
    public.get_user_role() <> 'client'
    and public.can_access_contract(contract_id)
  );
