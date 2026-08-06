-- Field logs: supervisors (and admins/subs) create; owners of a log may update/delete;
-- project managers and owners are view-only (no insert/update/delete via RLS).

drop policy if exists "field_logs_insert" on public.field_logs;
create policy "field_logs_insert"
  on public.field_logs
  for insert
  to authenticated
  with check (
    public.can_access_contract(contract_id)
    and public.get_user_role() in (
      'admin',
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
    public.get_user_role() = 'admin'
    or (user_id = auth.uid() and public.can_access_contract(contract_id))
  )
  with check (
    public.get_user_role() = 'admin'
    or (user_id = auth.uid() and public.can_access_contract(contract_id))
  );

drop policy if exists "field_logs_delete" on public.field_logs;
create policy "field_logs_delete"
  on public.field_logs
  for delete
  to authenticated
  using (
    public.get_user_role() = 'admin'
    or (user_id = auth.uid() and public.can_access_contract(contract_id))
  );
