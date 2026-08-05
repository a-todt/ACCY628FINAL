-- Per-contract Client IDs: each invite unlocks only that project.

alter table public.customers
  add column if not exists contract_id uuid references public.contracts(id) on delete set null;

create index if not exists idx_customers_contract_id on public.customers (contract_id);

-- One active invite row per contract is preferred; allow multiple historically but
-- only one unclaimed invite per contract.
create unique index if not exists idx_customers_one_unclaimed_per_contract
  on public.customers (contract_id)
  where contract_id is not null and claimed_at is null and user_id is null;

comment on column public.customers.contract_id is
  'Project this Client ID unlocks. Claiming links only this contract.';

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
  if v_customer.contract_id is null then
    raise exception 'This Client ID is not linked to a project. Ask your GC to invite you on a specific contract.';
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

  -- Only this project — not every contract that happens to match the name
  update public.contracts
  set client_user_id = auth.uid()
  where id = v_customer.contract_id;

  perform public.write_access_audit(
    'customer_claimed',
    'customers',
    v_customer.id::text,
    jsonb_build_object(
      'client_id', p_client_id,
      'contract_id', v_customer.contract_id
    )
  );

  return v_customer.id;
end;
$$;

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

-- Match still by name / spouse, but only among invites that have a contract
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
  v_contract_name text;
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
    and c.contract_id is not null
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
    and c.contract_id is not null
    and public.customer_name_matches(
      v_full_name,
      v_secondary,
      c.company_name,
      c.contact_name,
      c.secondary_name
    )
  for update;

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

  select contract_name into v_contract_name
  from public.contracts
  where id = v_customer.contract_id;

  return jsonb_build_object(
    'matched', true,
    'customerId', v_customer.id,
    'clientId', v_customer.client_id,
    'companyName', v_customer.company_name,
    'contactName', v_customer.contact_name,
    'contractId', v_customer.contract_id,
    'contractName', v_contract_name,
    'to', case when v_email is not null then lower(trim(v_email)) else null end,
    'alreadyEmailed', v_customer.signup_access_emailed_at is not null
  );
end;
$$;

-- Attach Joe Durrett demo invite to Test Joseph project when present
update public.customers c
set contract_id = '2a6a1e90-55f4-45de-a4c9-9268bf6fee8a'
where c.company_name = 'Joe Durrett'
  and c.contract_id is null
  and exists (select 1 from public.contracts where id = '2a6a1e90-55f4-45de-a4c9-9268bf6fee8a');

update public.customers c
set contract_id = (
  select id from public.contracts
  where contract_name ilike '%Apartment%' or contract_name ilike '%Condo%'
  order by contract_name
  limit 1
)
where c.company_name = 'Joe Durrett'
  and c.contract_id is null;

update public.customers c
set contract_id = (select id from public.contracts order by contract_name limit 1)
where c.company_name = 'Joe Durrett'
  and c.contract_id is null
  and exists (select 1 from public.contracts);
