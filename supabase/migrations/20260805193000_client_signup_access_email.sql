-- Signup-time automation: match new client accounts to unclaimed customers by name
-- and allow the app to email Client ID + setup code to the signup email.

alter table public.customers
  add column if not exists signup_access_emailed_at timestamptz;

create or replace function public.normalize_person_name(p_name text)
returns text
language sql
immutable
as $$
  select nullif(
    lower(trim(regexp_replace(coalesce(p_name, ''), '\s+', ' ', 'g'))),
    ''
  );
$$;

-- Returns match details for the signed-in client (security definer; codes never exposed via RLS).
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
  v_email text;
  v_norm text;
  v_count int;
  v_customer public.customers%rowtype;
begin
  if v_uid is null then
    raise exception 'Must be signed in';
  end if;

  select role, full_name, email
  into v_role, v_full_name, v_email
  from public.user_profiles
  where id = v_uid;

  if v_role is distinct from 'client' then
    return jsonb_build_object('matched', false, 'reason', 'not_client');
  end if;

  v_norm := public.normalize_person_name(v_full_name);
  if v_norm is null then
    return jsonb_build_object('matched', false, 'reason', 'missing_name');
  end if;

  if v_email is null or position('@' in v_email) = 0 then
    select email into v_email from auth.users where id = v_uid;
  end if;

  if v_email is null or position('@' in v_email) = 0 then
    return jsonb_build_object('matched', false, 'reason', 'missing_email');
  end if;

  select count(*) into v_count
  from public.customers c
  where c.user_id is null
    and c.claimed_at is null
    and c.client_id is not null
    and (
      public.normalize_person_name(c.contact_name) = v_norm
      or public.normalize_person_name(c.company_name) = v_norm
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
    and (
      public.normalize_person_name(c.contact_name) = v_norm
      or public.normalize_person_name(c.company_name) = v_norm
    )
  for update;

  -- Ensure a usable setup code exists
  if v_customer.setup_code is null
     or (v_customer.setup_code_expires_at is not null and v_customer.setup_code_expires_at < now()) then
    update public.customers
    set
      setup_code = public.generate_setup_code(),
      setup_code_expires_at = now() + interval '30 days'
    where id = v_customer.id
    returning * into v_customer;
  end if;

  -- Store the customer's signup email for later resets / owner visibility
  update public.customers
  set contact_email = lower(trim(v_email)),
      contact_name = coalesce(nullif(trim(contact_name), ''), v_full_name)
  where id = v_customer.id
  returning * into v_customer;

  return jsonb_build_object(
    'matched', true,
    'customerId', v_customer.id,
    'clientId', v_customer.client_id,
    'setupCode', v_customer.setup_code,
    'companyName', v_customer.company_name,
    'contactName', v_customer.contact_name,
    'expiresAt', v_customer.setup_code_expires_at,
    'to', lower(trim(v_email)),
    'alreadyEmailed', v_customer.signup_access_emailed_at is not null
  );
end;
$$;

revoke all on function public.match_customer_for_client_signup() from public;
grant execute on function public.match_customer_for_client_signup() to authenticated;

create or replace function public.mark_customer_signup_access_emailed(p_customer_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_role text;
begin
  if v_uid is null then
    raise exception 'Must be signed in';
  end if;

  select role into v_role from public.user_profiles where id = v_uid;
  if v_role is distinct from 'client' then
    raise exception 'Not authorized';
  end if;

  update public.customers
  set signup_access_emailed_at = coalesce(signup_access_emailed_at, now())
  where id = p_customer_id
    and user_id is null
    and claimed_at is null;

  perform public.write_access_audit(
    'client_signup_access_email_sent',
    'customers',
    p_customer_id::text,
    jsonb_build_object('user_id', v_uid)
  );
end;
$$;

revoke all on function public.mark_customer_signup_access_emailed(uuid) from public;
grant execute on function public.mark_customer_signup_access_emailed(uuid) to authenticated;
