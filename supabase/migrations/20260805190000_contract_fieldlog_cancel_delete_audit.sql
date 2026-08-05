-- Allow cancel/delete on contracts + field logs, and broaden activity-log visibility
-- for managers who perform those actions.

-- --------------------------------------------------------------------------
-- 1. Field log cancel status (soft cancel; hard delete remains available)
-- --------------------------------------------------------------------------
alter table public.field_logs
  add column if not exists status text not null default 'active';

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'field_logs_status_check'
  ) then
    alter table public.field_logs
      add constraint field_logs_status_check
      check (status in ('active', 'canceled'));
  end if;
end $$;

create index if not exists idx_field_logs_status on public.field_logs (status);

comment on column public.field_logs.status is
  'active = visible entry; canceled = soft-canceled but retained for history.';

-- --------------------------------------------------------------------------
-- 2. Contract UPDATE / DELETE policies (were missing in base schema)
-- --------------------------------------------------------------------------
drop policy if exists "contracts_update" on public.contracts;
create policy "contracts_update"
  on public.contracts
  for update
  to authenticated
  using (public.is_admin_or_pm() and public.can_access_contract(id))
  with check (public.is_admin_or_pm() and public.can_access_contract(id));

drop policy if exists "contracts_delete" on public.contracts;
create policy "contracts_delete"
  on public.contracts
  for delete
  to authenticated
  using (public.is_admin_or_pm() and public.can_access_contract(id));

-- Keep field_log write policies aligned with owner-inclusive is_admin_or_pm()
drop policy if exists "field_logs_insert" on public.field_logs;
create policy "field_logs_insert"
  on public.field_logs
  for insert
  to authenticated
  with check (
    public.can_access_contract(contract_id)
    and public.get_user_role() in (
      'admin',
      'owner',
      'project_manager',
      'field_supervisor',
      'subcontractor'
    )
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

-- --------------------------------------------------------------------------
-- 3. Activity log: managers + actors can read contract/field_log events
-- --------------------------------------------------------------------------
drop policy if exists "access_audit_log_select" on public.access_audit_log;
create policy "access_audit_log_select"
  on public.access_audit_log
  for select
  to authenticated
  using (
    public.is_owner_or_admin()
    or actor_user_id = auth.uid()
    or (
      public.is_admin_or_pm()
      and entity_type in ('contract', 'field_log')
    )
  );
