-- Client-ID-only access messaging (no setup code)

create or replace function public.get_my_access_status()
returns jsonb
language plpgsql
security definer
set search_path = public
stable
as $$
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
      v_reason := 'Enter your Client ID from your GC (shown after name match)';
    end if;
  elsif v_role in ('project_manager', 'field_supervisor') then
    if v_assignments > 0 then
      v_status := 'ok';
      v_reason := null;
    else
      v_status := 'locked';
      v_reason := 'Waiting for Owner to assign you to a project';
    end if;
  else
    v_status := 'ok';
    v_reason := null;
  end if;

  return jsonb_build_object(
    'status', v_status,
    'role', v_role,
    'reason', v_reason,
    'onboarding_complete', v_onboarding,
    'must_set_email', v_must_email,
    'assignment_count', v_assignments,
    'subcontractor_count', v_subs,
    'client_contract_count', v_client_contracts,
    'customer_linked', v_customer_linked
  );
end;
$$;

create or replace function public.resolve_client_id_login(p_client_id text)
returns text
language plpgsql
security definer
set search_path = public
stable
as $$
declare
  v_email text;
begin
  select coalesce(up.email, c.contact_email) into v_email
  from public.customers c
  left join public.user_profiles up on up.id = c.user_id
  where upper(c.client_id) = upper(trim(p_client_id))
    and c.claimed_at is not null
    and c.user_id is not null
  limit 1;

  if v_email is null then
    raise exception 'Client ID not found or not activated yet. Activate with your Client ID first, or sign in with email.';
  end if;
  return lower(v_email);
end;
$$;
