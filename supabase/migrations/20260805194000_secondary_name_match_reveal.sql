-- Optional secondary names for Owner customers and Client profiles.
-- Name matching uses primary and secondary names; Access Gate shows Client ID on the site.

alter table public.customers
  add column if not exists secondary_name text;

alter table public.user_profiles
  add column if not exists secondary_name text;

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

  if v_customer.setup_code is null
     or (v_customer.setup_code_expires_at is not null and v_customer.setup_code_expires_at < now()) then
    update public.customers
    set
      setup_code = public.generate_setup_code(),
      setup_code_expires_at = now() + interval '30 days'
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
    'setupCode', v_customer.setup_code,
    'companyName', v_customer.company_name,
    'contactName', v_customer.contact_name,
    'expiresAt', v_customer.setup_code_expires_at,
    'to', case when v_email is not null then lower(trim(v_email)) else null end,
    'alreadyEmailed', v_customer.signup_access_emailed_at is not null
  );
end;
$$;
