-- Shorter Client IDs, claim without setup code, spouse/partner secondary matching.

create or replace function public.generate_client_id()
returns text
language sql
volatile
as $$
  select 'CLT-' || upper(substr(replace(gen_random_uuid()::text, '-', ''), 1, 4));
$$;

-- Claim with Client ID only (setup code no longer required)
create or replace function public.claim_customer_by_client_id(p_client_id text)
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

  update public.customers
  set
    user_id = auth.uid(),
    claimed_at = now(),
    setup_code = null,
    setup_code_expires_at = null,
    contact_email = coalesce(contact_email, (select email from public.user_profiles where id = auth.uid()))
  where id = v_customer.id;

  update public.user_profiles
  set
    role = 'client',
    onboarding_complete = true,
    must_set_email = false
  where id = auth.uid()
    and role not in ('admin', 'owner');

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

revoke all on function public.claim_customer_by_client_id(text) from public;
grant execute on function public.claim_customer_by_client_id(text) to authenticated;

-- Keep old RPC working by ignoring setup code (optional / blank ok)
create or replace function public.claim_customer_with_setup(
  p_client_id text,
  p_setup_code text default null
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
begin
  return public.claim_customer_by_client_id(p_client_id);
end;
$$;

-- Provision only needs Client ID now
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
begin
  if not public.is_owner_or_admin() and not public.is_admin_or_pm() then
    raise exception 'Not authorized';
  end if;

  v_client_id := public.generate_client_id();

  update public.customers c
  set
    client_id = v_client_id,
    setup_code = null,
    setup_code_expires_at = null,
    claimed_at = null,
    user_id = null,
    signup_access_emailed_at = null
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

-- Match: contact name OR spouse/partner secondary name (either side)
create or replace function public.customer_name_matches(
  p_user_primary text,
  p_user_secondary text,
  p_company_name text,
  p_contact_name text,
  p_customer_secondary text
)
returns boolean
language sql
immutable
as $$
  select
    public.normalize_person_name(p_user_primary) is not null
    and (
      public.normalize_person_name(p_user_primary) = public.normalize_person_name(p_contact_name)
      or public.normalize_person_name(p_user_primary) = public.normalize_person_name(p_company_name)
      or public.normalize_person_name(p_user_primary) = public.normalize_person_name(p_customer_secondary)
      or (
        public.normalize_person_name(p_user_secondary) is not null
        and (
          public.normalize_person_name(p_user_secondary) = public.normalize_person_name(p_contact_name)
          or public.normalize_person_name(p_user_secondary) = public.normalize_person_name(p_company_name)
          or public.normalize_person_name(p_user_secondary) = public.normalize_person_name(p_customer_secondary)
        )
      )
    );
$$;

create or replace function public.match_customer_for_client_signup()
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_role text;
  v_full_name text;
  v_secondary text;
  v_email text;
  v_count int;
  v_customer public.customers%rowtype;
begin
  if v_uid is null then
    raise exception 'Must be signed in';
  end if;

  select role, full_name, secondary_name, email
  into v_role, v_full_name, v_secondary, v_email
  from public.user_profiles
  where id = v_uid;

  if v_role is distinct from 'client' then
    return jsonb_build_object('matched', false, 'reason', 'not_client');
  end if;

  if public.normalize_person_name(v_full_name) is null then
    return jsonb_build_object('matched', false, 'reason', 'missing_name');
  end if;

  if v_email is null or position('@' in v_email) = 0 then
    select email into v_email from auth.users where id = v_uid;
  end if;

  select count(*) into v_count
  from public.customers c
  where c.user_id is null
    and c.claimed_at is null
    and c.client_id is not null
    and public.customer_name_matches(
      v_full_name,
      v_secondary,
      c.company_name,
      c.contact_name,
      c.secondary_name
    );

  if v_count = 0 then
    return jsonb_build_object('matched', false, 'reason', 'no_match');
  end if;

  if v_count > 1 then
    return jsonb_build_object('matched', false, 'reason', 'ambiguous');
  end if;

  select * into v_customer
  from public.customers c
  where c.user_id is null
    and c.claimed_at is null
    and c.client_id is not null
    and public.customer_name_matches(
      v_full_name,
      v_secondary,
      c.company_name,
      c.contact_name,
      c.secondary_name
    )
  for update;

  -- Normalize long legacy IDs to short form when still unclaimed
  if length(replace(v_customer.client_id, 'CLT-', '')) > 4 then
    update public.customers
    set client_id = public.generate_client_id()
    where id = v_customer.id
    returning * into v_customer;
  end if;

  if v_email is not null and position('@' in v_email) > 0 then
    update public.customers
    set contact_email = coalesce(contact_email, lower(trim(v_email))),
        contact_name = coalesce(nullif(trim(contact_name), ''), v_full_name)
    where id = v_customer.id
    returning * into v_customer;
  end if;

  return jsonb_build_object(
    'matched', true,
    'customerId', v_customer.id,
    'clientId', v_customer.client_id,
    'companyName', v_customer.company_name,
    'contactName', v_customer.contact_name,
    'to', case when v_email is not null then lower(trim(v_email)) else null end,
    'alreadyEmailed', v_customer.signup_access_emailed_at is not null
  );
end;
$$;

-- Shorten existing unclaimed Client IDs
update public.customers
set client_id = 'CLT-' || upper(substr(replace(gen_random_uuid()::text, '-', ''), 1, 4)),
    setup_code = null,
    setup_code_expires_at = null
where claimed_at is null
  and user_id is null
  and client_id is not null
  and length(replace(client_id, 'CLT-', '')) > 4;
