-- Keep only @gcmanager.demo logins. Ensure Accounting demo signs in with Demo123!.
-- Reassign NO ACTION ownership FKs so auth.users deletes succeed.

create extension if not exists pgcrypto;

do $$
declare
  v_admin uuid;
begin
  select id into v_admin from auth.users where lower(email) = 'admin@gcmanager.demo' limit 1;
  if v_admin is null then
    raise exception 'admin@gcmanager.demo is required before pruning non-demo users';
  end if;

  create temporary table tmp_non_demo_users on commit drop as
  select id
  from auth.users
  where lower(coalesce(email, '')) not like '%@gcmanager.demo';

  -- Optional approval / actor columns (NO ACTION) — clear first
  update public.invoices
  set submitted_by = null
  where submitted_by in (select id from tmp_non_demo_users);

  update public.invoices
  set accounting_approved_by = null
  where accounting_approved_by in (select id from tmp_non_demo_users);

  update public.invoices
  set admin_approved_by = null
  where admin_approved_by in (select id from tmp_non_demo_users);

  update public.payments
  set submitted_by = null
  where submitted_by in (select id from tmp_non_demo_users);

  update public.payments
  set approved_by = null
  where approved_by in (select id from tmp_non_demo_users);

  update public.payments
  set accounting_approved_by = null
  where accounting_approved_by in (select id from tmp_non_demo_users);

  update public.payments
  set admin_approved_by = null
  where admin_approved_by in (select id from tmp_non_demo_users);

  update public.insurance_policies
  set created_by = v_admin
  where created_by in (select id from tmp_non_demo_users);

  -- Ownership columns that cannot be null — reassign to demo admin
  update public.contracts
  set user_id = v_admin
  where user_id in (select id from tmp_non_demo_users);

  update public.cost_entries
  set user_id = v_admin
  where user_id in (select id from tmp_non_demo_users);

  update public.field_logs
  set user_id = v_admin
  where user_id in (select id from tmp_non_demo_users);

  update public.billings
  set user_id = v_admin
  where user_id in (select id from tmp_non_demo_users);

  update public.projects
  set user_id = v_admin
  where user_id in (select id from tmp_non_demo_users);

  update public.project_costs
  set user_id = v_admin
  where user_id in (select id from tmp_non_demo_users);

  update public.project_change_orders
  set user_id = v_admin
  where user_id in (select id from tmp_non_demo_users);

  -- Drop non-demo auth users (cascades profiles, sessions, assignments, messages, bids)
  delete from auth.users
  where id in (select id from tmp_non_demo_users);
end $$;

-- Ensure Accounting demo login exists and uses Demo123! (same hash as admin).
insert into auth.users (
  instance_id, id, aud, role, email, encrypted_password,
  email_confirmed_at, raw_app_meta_data, raw_user_meta_data,
  created_at, updated_at, confirmation_token, recovery_token,
  email_change_token_new, email_change, is_sso_user, is_anonymous
)
values (
  '00000000-0000-0000-0000-000000000000',
  '44444444-4444-4444-4444-444444444444',
  'authenticated',
  'authenticated',
  'accounting@gcmanager.demo',
  crypt('Demo123!', gen_salt('bf')),
  now(),
  '{"provider":"email","providers":["email"]}',
  '{"full_name":"Demo Accounting","intended_role":"owner"}',
  now(),
  now(),
  '',
  '',
  '',
  '',
  false,
  false
)
on conflict (id) do update
set
  email = 'accounting@gcmanager.demo',
  email_confirmed_at = coalesce(auth.users.email_confirmed_at, now()),
  raw_user_meta_data = coalesce(auth.users.raw_user_meta_data, '{}'::jsonb)
    || jsonb_build_object('full_name', 'Demo Accounting', 'intended_role', 'owner'),
  updated_at = now();

update auth.users u
set
  email = 'accounting@gcmanager.demo',
  encrypted_password = w.encrypted_password,
  email_confirmed_at = coalesce(u.email_confirmed_at, now()),
  updated_at = now()
from auth.users w
where w.email = 'admin@gcmanager.demo'
  and u.id = '44444444-4444-4444-4444-444444444444';

update auth.identities i
set
  identity_data = coalesce(i.identity_data, '{}'::jsonb)
    || jsonb_build_object('email', 'accounting@gcmanager.demo', 'sub', i.user_id::text),
  provider_id = i.user_id::text,
  updated_at = now()
where i.user_id = '44444444-4444-4444-4444-444444444444'
  and i.provider = 'email';

insert into auth.identities (
  id, user_id, identity_data, provider, provider_id, last_sign_in_at, created_at, updated_at
)
select
  gen_random_uuid(),
  '44444444-4444-4444-4444-444444444444',
  jsonb_build_object(
    'sub', '44444444-4444-4444-4444-444444444444',
    'email', 'accounting@gcmanager.demo'
  ),
  'email',
  '44444444-4444-4444-4444-444444444444',
  now(),
  now(),
  now()
where not exists (
  select 1
  from auth.identities
  where provider = 'email'
    and user_id = '44444444-4444-4444-4444-444444444444'
);

insert into public.user_profiles (id, email, full_name, role, is_active, onboarding_complete)
values (
  '44444444-4444-4444-4444-444444444444',
  'accounting@gcmanager.demo',
  'Demo Accounting',
  'owner',
  true,
  true
)
on conflict (id) do update
set
  email = excluded.email,
  full_name = excluded.full_name,
  role = 'owner',
  is_active = true,
  onboarding_complete = true;
