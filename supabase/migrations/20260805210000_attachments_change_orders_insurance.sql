-- Extend attachments to change orders and insurance policies

alter table public.attachments
  drop constraint if exists attachments_entity_type_check;

alter table public.attachments
  add constraint attachments_entity_type_check
  check (entity_type in ('field_log', 'invoice', 'change_order', 'insurance_policy'));

create or replace function public.can_access_attachment_entity(
  p_entity_type text,
  p_entity_id uuid
)
returns boolean
language plpgsql
security definer
set search_path = public
stable
as $$
begin
  if p_entity_type = 'field_log' then
    return exists (
      select 1
      from public.field_logs fl
      where fl.id = p_entity_id
        and public.can_access_contract(fl.contract_id)
        and public.get_user_role() <> 'client'
    );
  end if;

  if p_entity_type = 'invoice' then
    return exists (
      select 1
      from public.invoices i
      where i.id = p_entity_id
        and public.can_access_contract(i.contract_id)
    );
  end if;

  if p_entity_type = 'change_order' then
    return exists (
      select 1
      from public.change_orders co
      where co.id = p_entity_id
        and public.can_access_contract(co.contract_id)
        and (
          public.get_user_role() <> 'client'
          or co.status = 'approved'
        )
    );
  end if;

  if p_entity_type = 'insurance_policy' then
    if public.get_user_role() = 'client' then
      return false;
    end if;

    return exists (
      select 1
      from public.insurance_policies p
      left join public.subcontractors s on s.id = p.subcontractor_id
      where p.id = p_entity_id
        and (
          public.is_admin_or_pm()
          or (
            p.holder_type = 'gc'
            and public.get_user_role() in ('field_supervisor', 'subcontractor')
          )
          or (
            p.holder_type = 'subcontractor'
            and s.contract_id is not null
            and public.can_access_contract(s.contract_id)
          )
        )
    );
  end if;

  return false;
end;
$$;

drop policy if exists "attachments_insert" on public.attachments;
create policy "attachments_insert"
  on public.attachments
  for insert
  to authenticated
  with check (
    uploaded_by = auth.uid()
    and public.can_access_attachment_entity(entity_type, entity_id)
    and (
      (entity_type = 'invoice' and public.get_user_role() not in ('subcontractor', 'field_supervisor'))
      or (entity_type = 'field_log' and public.get_user_role() <> 'client')
      or (entity_type = 'change_order' and public.is_admin_or_pm())
      or (
        entity_type = 'insurance_policy'
        and public.get_user_role() in ('admin', 'owner', 'project_manager', 'subcontractor')
      )
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
  );
