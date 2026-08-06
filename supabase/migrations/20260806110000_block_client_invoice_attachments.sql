-- Clients may view/download invoice attachments but must not upload or delete them.

drop policy if exists "attachments_insert" on public.attachments;
create policy "attachments_insert"
  on public.attachments
  for insert
  to authenticated
  with check (
    uploaded_by = auth.uid()
    and public.can_access_attachment_entity(entity_type, entity_id)
    and (
      (
        entity_type = 'invoice'
        and public.get_user_role() not in ('subcontractor', 'field_supervisor', 'client')
      )
      or (entity_type = 'field_log' and public.get_user_role() <> 'client')
      or (entity_type = 'change_order' and public.is_admin_or_pm())
      or (
        entity_type = 'insurance_policy'
        and public.get_user_role() in ('admin', 'owner', 'project_manager', 'subcontractor')
      )
    )
  );

drop policy if exists "attachments_delete" on public.attachments;
create policy "attachments_delete"
  on public.attachments
  for delete
  to authenticated
  using (
    public.get_user_role() <> 'client'
    and public.can_access_attachment_entity(entity_type, entity_id)
    and (
      public.is_admin_or_pm()
      or uploaded_by = auth.uid()
    )
  );

drop policy if exists "attachments_storage_insert" on storage.objects;
create policy "attachments_storage_insert"
  on storage.objects
  for insert
  to authenticated
  with check (
    bucket_id = 'attachments'
    and (storage.foldername(name))[1] in ('field_log', 'invoice', 'change_order', 'insurance_policy')
    and (
      (
        (storage.foldername(name))[1] = 'invoice'
        and public.get_user_role() not in ('subcontractor', 'field_supervisor', 'client')
      )
      or (
        (storage.foldername(name))[1] = 'field_log'
        and public.get_user_role() <> 'client'
      )
      or (
        (storage.foldername(name))[1] = 'change_order'
        and public.is_admin_or_pm()
      )
      or (
        (storage.foldername(name))[1] = 'insurance_policy'
        and public.get_user_role() in ('admin', 'owner', 'project_manager', 'subcontractor')
      )
    )
  );
