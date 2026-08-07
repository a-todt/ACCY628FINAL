-- Project managers who sign up can work immediately (create projects / link team).
-- Field supervisors still wait for a contract assignment.

create or replace function public.get_my_access_status()
returns jsonb
language plpgsql
stable
security definer
set search_path to 'public'
as $function$
declare
  v_role text;
  v_uid uuid := auth.uid();
  v_assignments int := 0;
  v_subs int := 0;
  v_client_contracts int := 0;
  v_customer_linked boolean := false;
  v_onboarding boolean := false;
  v_must_email boolean := false;
  v_status text;
  v_reason text;
begin
  if v_uid is null then
    return jsonb_build_object('status', 'anonymous', 'reason', 'Not signed in');
  end if;

  select role, coalesce(onboarding_complete, false), coalesce(must_set_email, false)
  into v_role, v_onboarding, v_must_email
  from public.user_profiles
  where id = v_uid;

  if v_role is null then
    return jsonb_build_object('status', 'locked', 'reason', 'Profile missing');
  end if;

  if v_role in ('admin', 'owner') then
    return jsonb_build_object('status', 'ok', 'role', v_role, 'onboarding_complete', true);
  end if;

  -- PMs are self-serve: they create projects and link field / client / accounting.
  if v_role = 'project_manager' then
    return jsonb_build_object(
      'status', 'ok',
      'role', v_role,
      'reason', null,
      'onboarding_complete', true,
      'must_set_email', v_must_email
    );
  end if;

  select count(*) into v_assignments from public.contract_assignments where user_id = v_uid;
  select count(*) into v_subs from public.subcontractors where user_id = v_uid;
  select count(*) into v_client_contracts from public.contracts where client_user_id = v_uid;
  select exists(select 1 from public.customers where user_id = v_uid) into v_customer_linked;

  if v_role = 'subcontractor' then
    if v_subs > 0 then
      v_status := 'ok';
      v_reason := null;
    else
      v_status := 'needs_invite';
      v_reason := 'Enter your invite code from your GC';
    end if;
  elsif v_role = 'client' then
    if v_customer_linked or v_client_contracts > 0 then
      v_status := 'ok';
      v_reason := null;
    else
      v_status := 'needs_client_setup';
      v_reason := 'Register a project inquiry, or enter a Client ID if your GC already invited you';
    end if;
  elsif v_role = 'field_supervisor' then
    if v_assignments > 0 then
      v_status := 'ok';
      v_reason := null;
    else
      v_status := 'locked';
      v_reason := 'Waiting for a Project Manager to assign you to a project';
    end if;
  else
    v_status := 'ok';
    v_reason := null;
  end if;

  return jsonb_build_object(
    'status', v_status,
    'role', v_role,
    'reason', v_reason,
    'onboarding_complete', case when v_role = 'field_supervisor' then v_onboarding else true end,
    'must_set_email', v_must_email,
    'assignment_count', v_assignments,
    'subcontractor_count', v_subs,
    'client_contract_count', v_client_contracts,
    'customer_linked', v_customer_linked
  );
end;
$function$;

-- Allow linking Accounting (owner) on a contract team roster.
alter table public.contract_assignments
  drop constraint if exists contract_assignments_assignment_role_check;

alter table public.contract_assignments
  add constraint contract_assignments_assignment_role_check
  check (assignment_role in ('project_manager', 'field_supervisor', 'owner'));

-- Existing PMs who signed up but were left waiting should be unlocked.
update public.user_profiles
set onboarding_complete = true
where role = 'project_manager'
  and coalesce(onboarding_complete, false) = false;
