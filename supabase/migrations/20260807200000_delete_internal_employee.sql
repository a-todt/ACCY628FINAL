-- Admin-only hard delete for internal employees (auth.users cascades to user_profiles).
-- Avoids requiring SUPABASE_SERVICE_ROLE_KEY in the Next.js app.

create or replace function public.delete_internal_employee(p_user_id uuid)
returns void
language plpgsql
security definer
set search_path = public, auth
as $$
declare
  v_email text;
  v_full_name text;
  v_role text;
begin
  if auth.uid() is null then
    raise exception 'Not authenticated';
  end if;

  if public.get_user_role() is distinct from 'admin' then
    raise exception 'Only Admin can delete internal employees';
  end if;

  if p_user_id = auth.uid() then
    raise exception 'You cannot delete your own account';
  end if;

  select email, full_name, role::text
    into v_email, v_full_name, v_role
  from public.user_profiles
  where id = p_user_id;

  if v_role is null then
    raise exception 'Employee not found';
  end if;

  if v_role not in ('owner', 'project_manager', 'field_supervisor') then
    raise exception 'Only internal employees (Accounting, Project Manager, Field Supervisor) can be deleted';
  end if;

  perform public.write_access_audit(
    'staff_deleted',
    'user_profiles',
    p_user_id::text,
    jsonb_build_object(
      'email', v_email,
      'full_name', v_full_name,
      'role', v_role
    )
  );

  -- Cascades to public.user_profiles (and related rows with ON DELETE CASCADE).
  delete from auth.users where id = p_user_id;

  if not found then
    raise exception 'Auth user could not be deleted';
  end if;
end;
$$;

comment on function public.delete_internal_employee(uuid) is
  'Permanently delete an internal employee account. Callable by Admin only.';

revoke all on function public.delete_internal_employee(uuid) from public;
grant execute on function public.delete_internal_employee(uuid) to authenticated;
