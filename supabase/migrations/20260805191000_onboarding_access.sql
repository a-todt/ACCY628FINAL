-- Onboarding: client IDs, setup codes, access helpers

alter table public.customers
  add column if not exists client_id text,
  add column if not exists setup_code text,
  add column if not exists setup_code_expires_at timestamptz,
  add column if not exists claimed_at timestamptz;

create unique index if not exists idx_customers_client_id
  on public.customers (client_id)
  where client_id is not null;

alter table public.user_profiles
  add column if not exists must_set_email boolean not null default false,
  add column if not exists onboarding_complete boolean not null default false;

-- Backfill client_id / setup for existing customers
update public.customers
set
  client_id = coalesce(client_id, 'CLT-' || upper(substr(replace(id::text, '-', ''), 1, 8))),
  setup_code = coalesce(setup_code, upper(substr(replace(gen_random_uuid()::text, '-', ''), 1, 8))),
  setup_code_expires_at = coalesce(setup_code_expires_at, now() + interval '30 days')
where client_id is null or setup_code is null;

-- Mark internal/demo staff as onboarded
update public.user_profiles
set onboarding_complete = true
where role in ('admin', 'owner')
   or email like '%@gcmanager.demo';

create or replace function public.generate_client_id()
returns text
language sql
volatile
as $$
  select 'CLT-' || upper(substr(replace(gen_random_uuid()::text, '-', ''), 1, 8));
$$;

create or replace function public.generate_setup_code()
returns text
language sql
volatile
as $$
  select upper(substr(replace(gen_random_uuid()::text, '-', ''), 1, 8));
$$;

create or replace function public.provision_customer_access(
  p_customer_id uuid,
  p_days_valid int default 30
)
returns table (client_id text, setup_code text, expires_at timestamptz)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_client_id text;
  v_code text;
  v_exp timestamptz;
begin
  if not public.is_owner_or_admin() and not public.is_admin_or_pm() then
    raise exception 'Not authorized';
  end if;

  v_client_id := public.generate_client_id();
  v_code := public.generate_setup_code();
  v_exp := now() + make_interval(days => greatest(p_days_valid, 1));

  update public.customers c
  set
    client_id = coalesce(c.client_id, v_client_id),
    setup_code = v_code,
    setup_code_expires_at = v_exp,
    claimed_at = null
  where c.id = p_customer_id
  returning c.client_id, c.setup_code, c.setup_code_expires_at
  into client_id, setup_code, expires_at;

  if client_id is null then
    raise exception 'Customer not found';
  end if;

  perform public.write_access_audit(
    'customer_access_provisioned',
    'customers',
    p_customer_id::text,
    jsonb_build_object('client_id', client_id)
  );

  return next;
end;
$$;

revoke all on function public.provision_customer_access(uuid, int) from public;
grant execute on function public.provision_customer_access(uuid, int) to authenticated;

-- After signup, authenticated user claims a pre-created customer with Client ID + setup code
create or replace function public.claim_customer_with_setup(
  p_client_id text,
  p_setup_code text
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_customer public.customers%rowtype;
begin
  if auth.uid() is null then
    raise exception 'Must be signed in';
  end if;

  select * into v_customer
  from public.customers
  where upper(client_id) = upper(trim(p_client_id))
  for update;

  if not found then
    raise exception 'Invalid Client ID';
  end if;
  if v_customer.user_id is not null and v_customer.claimed_at is not null then
    raise exception 'This Client ID is already linked to an account';
  end if;
  if v_customer.setup_code is null
     or upper(v_customer.setup_code) <> upper(trim(p_setup_code)) then
    raise exception 'Invalid setup code';
  end if;
  if v_customer.setup_code_expires_at is not null
     and v_customer.setup_code_expires_at < now() then
    raise exception 'Setup code expired — ask your GC for a new one';
  end if;

  update public.customers
  set
    user_id = auth.uid(),
    claimed_at = now(),
    setup_code = null,
    contact_email = coalesce(contact_email, (select email from public.user_profiles where id = auth.uid()))
  where id = v_customer.id;

  update public.user_profiles
  set
    role = 'client',
    onboarding_complete = true,
    must_set_email = false
  where id = auth.uid()
    and role not in ('admin', 'owner');

  -- Link any contracts that match this customer email / client_user_id placeholder
  update public.contracts c
  set client_user_id = auth.uid()
  where c.client_user_id is null
    and (
      (v_customer.contact_email is not null and lower(c.client_email) = lower(v_customer.contact_email))
      or lower(c.client_name) = lower(v_customer.company_name)
    );

  perform public.write_access_audit(
    'customer_claimed',
    'customers',
    v_customer.id::text,
    jsonb_build_object('client_id', p_client_id)
  );

  return v_customer.id;
end;
$$;

revoke all on function public.claim_customer_with_setup(text, text) from public;
grant execute on function public.claim_customer_with_setup(text, text) to authenticated;

-- Access summary for the signed-in user (drives locked screens)
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
    return jsonb_build_object('status', 'locked', 'reason', 'Profile missing', 'role', null);
  end if;

  if v_role in ('admin', 'owner') then
    return jsonb_build_object(
      'status', 'ready',
      'role', v_role,
      'onboarding_complete', true
    );
  end if;

  if v_must_email then
    return jsonb_build_object(
      'status', 'needs_email',
      'role', v_role,
      'reason', 'Add your email to finish account setup'
    );
  end if;

  select count(*) into v_assignments
  from public.contract_assignments where user_id = v_uid;

  select count(*) into v_subs
  from public.subcontractors where user_id = v_uid;

  select count(*) into v_client_contracts
  from public.contracts where client_user_id = v_uid;

  select exists(select 1 from public.customers where user_id = v_uid)
  into v_customer_linked;

  if v_role = 'project_manager' or v_role = 'field_supervisor' then
    if v_assignments > 0 then
      v_status := 'ready';
      v_reason := null;
    else
      v_status := 'locked';
      v_reason := 'Waiting for your company Owner to assign you to a project';
    end if;
  elsif v_role = 'subcontractor' then
    if v_subs > 0 then
      v_status := 'ready';
    else
      v_status := 'needs_invite';
      v_reason := 'Enter the invite code from your GC to unlock your subcontract';
    end if;
  elsif v_role = 'client' then
    if v_client_contracts > 0 or v_customer_linked then
      v_status := 'ready';
    else
      v_status := 'needs_client_setup';
      v_reason := 'Enter your Client ID and setup code from your GC';
    end if;
  else
    v_status := 'locked';
    v_reason := 'No access yet';
  end if;

  return jsonb_build_object(
    'status', v_status,
    'role', v_role,
    'reason', v_reason,
    'assignment_count', v_assignments,
    'subcontract_count', v_subs,
    'client_contract_count', v_client_contracts,
    'customer_linked', v_customer_linked,
    'onboarding_complete', v_onboarding
  );
end;
$$;

revoke all on function public.get_my_access_status() from public;
grant execute on function public.get_my_access_status() to authenticated;

-- Allow authenticated users to update their own role once during onboarding
-- (keep existing update policies; claim/accept RPCs are security definer)
