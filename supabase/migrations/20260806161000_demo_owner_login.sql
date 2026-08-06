-- Demo Owner / Executive login (password: Demo123!, same hash as admin).
-- There was no owner profile in the project, so role-preview was the only way
-- to "log in" as owner — and preview does not change RLS.

create extension if not exists pgcrypto;

insert into auth.users (
  instance_id, id, aud, role, email, encrypted_password,
  email_confirmed_at, raw_app_meta_data, raw_user_meta_data,
  created_at, updated_at, confirmation_token, recovery_token,
  email_change_token_new, email_change, is_sso_user, is_anonymous
)
values
  ('00000000-0000-0000-0000-000000000000', '44444444-4444-4444-4444-444444444444', 'authenticated', 'authenticated',
   'owner@gcmanager.demo', crypt('Demo123!', gen_salt('bf')), now(),
   '{"provider":"email","providers":["email"]}', '{"full_name":"Demo Owner"}',
   now(), now(), '', '', '', '', false, false)
on conflict (id) do nothing;

insert into auth.identities (
  id, user_id, identity_data, provider, provider_id, last_sign_in_at, created_at, updated_at
)
select
  gen_random_uuid(),
  '44444444-4444-4444-4444-444444444444',
  jsonb_build_object('sub', '44444444-4444-4444-4444-444444444444', 'email', 'owner@gcmanager.demo'),
  'email',
  '44444444-4444-4444-4444-444444444444',
  now(),
  now(),
  now()
where not exists (
  select 1 from auth.identities
  where provider = 'email' and provider_id = '44444444-4444-4444-4444-444444444444'
);

insert into public.user_profiles (id, email, full_name, role)
values (
  '44444444-4444-4444-4444-444444444444',
  'owner@gcmanager.demo',
  'Demo Owner',
  'owner'
)
on conflict (id) do update
  set email = excluded.email,
      full_name = excluded.full_name,
      role = excluded.role;

-- Use a known-good Auth password hash so Demo123! signs in
update auth.users u
set encrypted_password = w.encrypted_password,
    email_confirmed_at = coalesce(u.email_confirmed_at, now()),
    updated_at = now()
from auth.users w
where w.email = 'admin@gcmanager.demo'
  and u.email = 'owner@gcmanager.demo';
