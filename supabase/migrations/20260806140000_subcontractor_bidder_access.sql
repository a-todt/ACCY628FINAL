-- Allow self-registered subcontractors to use the app (and bidding)
-- before they are linked to a contract engagement via GC invite.
-- Also honor intended_role from signup metadata so role is set correctly
-- even when the client cannot update user_profiles (e.g. no session yet).

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_role text;
  v_allowed text[] := array[
    'admin',
    'owner',
    'project_manager',
    'field_supervisor',
    'subcontractor',
    'client'
  ];
begin
  v_role := lower(coalesce(new.raw_user_meta_data ->> 'intended_role', 'field_supervisor'));
  if v_role = 'owner' or v_role = 'admin' then
    -- Public signup cannot self-elevate to owner/admin.
    v_role := 'field_supervisor';
  end if;
  if not (v_role = any (v_allowed)) then
    v_role := 'field_supervisor';
  end if;

  insert into public.user_profiles (id, email, full_name, role)
  values (
    new.id,
    new.email,
    new.raw_user_meta_data ->> 'full_name',
    v_role
  )
  on conflict (id) do nothing;

  return new;
end;
$$;

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
    -- Registered bidders can access the app and open bid packages
    -- without a subcontractors engagement. Invite remains optional
    -- for linking to an awarded project later.
    v_status := 'ok';
    v_reason := case
      when v_subs = 0 then
        'No contract engagement yet — you can still bid on open packages'
      else null
    end;
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

comment on function public.get_my_access_status() is
  'Access gate status. Subcontractors are ready without an engagement so they can bid; clients and assigned staff still require linking/assignment.';

comment on function public.handle_new_user() is
  'Creates user_profiles on signup using intended_role from auth metadata (public signup cannot self-assign owner/admin).';
