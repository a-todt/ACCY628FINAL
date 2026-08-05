-- Attachments metadata + private Storage bucket for field logs and invoices

create table if not exists public.attachments (
  id uuid primary key default gen_random_uuid(),
  entity_type text not null check (entity_type in ('field_log', 'invoice')),
  entity_id uuid not null,
  file_name text not null,
  storage_path text not null unique,
  mime_type text,
  size_bytes bigint,
  uploaded_by uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default now()
);

create index if not exists idx_attachments_entity
  on public.attachments (entity_type, entity_id);

create index if not exists idx_attachments_uploaded_by
  on public.attachments (uploaded_by);

alter table public.attachments enable row level security;

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

  return false;
end;
$$;

drop policy if exists "attachments_select" on public.attachments;
create policy "attachments_select"
  on public.attachments
  for select
  to authenticated
  using (public.can_access_attachment_entity(entity_type, entity_id));

drop policy if exists "attachments_insert" on public.attachments;
create policy "attachments_insert"
  on public.attachments
  for insert
  to authenticated
  with check (
    uploaded_by = auth.uid()
    and public.can_access_attachment_entity(entity_type, entity_id)
    and (
      entity_type = 'invoice'
      or public.get_user_role() in (
        'admin', 'owner', 'project_manager', 'field_supervisor', 'subcontractor'
      )
    )
  );

drop policy if exists "attachments_delete" on public.attachments;
create policy "attachments_delete"
  on public.attachments
  for delete
  to authenticated
  using (
    public.can_access_attachment_entity(entity_type, entity_id)
    and (
      public.is_admin_or_pm()
      or uploaded_by = auth.uid()
    )
  );

-- Private storage bucket for attachment blobs
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'attachments',
  'attachments',
  false,
  10485760,
  array[
    'application/pdf',
    'image/jpeg',
    'image/png',
    'image/gif',
    'image/webp',
    'application/msword',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    'application/vnd.ms-excel',
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
  ]
)
on conflict (id) do update set
  public = excluded.public,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists "attachments_storage_select" on storage.objects;
create policy "attachments_storage_select"
  on storage.objects
  for select
  to authenticated
  using (
    bucket_id = 'attachments'
    and exists (
      select 1
      from public.attachments a
      where a.storage_path = name
        and public.can_access_attachment_entity(a.entity_type, a.entity_id)
    )
  );

drop policy if exists "attachments_storage_insert" on storage.objects;
create policy "attachments_storage_insert"
  on storage.objects
  for insert
  to authenticated
  with check (
    bucket_id = 'attachments'
    and (storage.foldername(name))[1] in ('field_log', 'invoice')
  );

drop policy if exists "attachments_storage_delete" on storage.objects;
create policy "attachments_storage_delete"
  on storage.objects
  for delete
  to authenticated
  using (
    bucket_id = 'attachments'
    and exists (
      select 1
      from public.attachments a
      where a.storage_path = name
        and (
          public.is_admin_or_pm()
          or a.uploaded_by = auth.uid()
        )
        and public.can_access_attachment_entity(a.entity_type, a.entity_id)
    )
  );
