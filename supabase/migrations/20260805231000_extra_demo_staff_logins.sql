-- Extra demo staff logins for role testing (password: Demo123!)
-- Keeps original pm@ / field@ / sub@ plus one extra of each (2 total per role).
--   pm2@gcmanager.demo    / Alex Chen       / project_manager
--   field2@gcmanager.demo / Casey Morgan    / field_supervisor
--   sub2@gcmanager.demo   / Taylor Quinn    / subcontractor

create extension if not exists pgcrypto;

insert into auth.users (
  instance_id, id, aud, role, email, encrypted_password,
  email_confirmed_at, raw_app_meta_data, raw_user_meta_data,
  created_at, updated_at, confirmation_token, recovery_token,
  email_change_token_new, email_change, is_sso_user, is_anonymous
)
values
  ('00000000-0000-0000-0000-000000000000', '66666666-6666-6666-6666-666666666661', 'authenticated', 'authenticated',
   'pm2@gcmanager.demo', crypt('Demo123!', gen_salt('bf')), now(),
   '{"provider":"email","providers":["email"]}', '{"full_name":"Alex Chen"}',
   now(), now(), '', '', '', '', false, false),
  ('00000000-0000-0000-0000-000000000000', '66666666-6666-6666-6666-666666666663', 'authenticated', 'authenticated',
   'field2@gcmanager.demo', crypt('Demo123!', gen_salt('bf')), now(),
   '{"provider":"email","providers":["email"]}', '{"full_name":"Casey Morgan"}',
   now(), now(), '', '', '', '', false, false),
  ('00000000-0000-0000-0000-000000000000', '66666666-6666-6666-6666-666666666665', 'authenticated', 'authenticated',
   'sub2@gcmanager.demo', crypt('Demo123!', gen_salt('bf')), now(),
   '{"provider":"email","providers":["email"]}', '{"full_name":"Taylor Quinn"}',
   now(), now(), '', '', '', '', false, false)
on conflict (id) do nothing;

insert into auth.identities (
  id, user_id, identity_data, provider, provider_id, last_sign_in_at, created_at, updated_at
)
values
  (gen_random_uuid(), '66666666-6666-6666-6666-666666666661',
   jsonb_build_object('sub', '66666666-6666-6666-6666-666666666661', 'email', 'pm2@gcmanager.demo'),
   'email', '66666666-6666-6666-6666-666666666661', now(), now(), now()),
  (gen_random_uuid(), '66666666-6666-6666-6666-666666666663',
   jsonb_build_object('sub', '66666666-6666-6666-6666-666666666663', 'email', 'field2@gcmanager.demo'),
   'email', '66666666-6666-6666-6666-666666666663', now(), now(), now()),
  (gen_random_uuid(), '66666666-6666-6666-6666-666666666665',
   jsonb_build_object('sub', '66666666-6666-6666-6666-666666666665', 'email', 'sub2@gcmanager.demo'),
   'email', '66666666-6666-6666-6666-666666666665', now(), now(), now())
on conflict (provider, provider_id) do nothing;

insert into public.user_profiles (id, email, full_name, role)
values
  ('66666666-6666-6666-6666-666666666661', 'pm2@gcmanager.demo', 'Alex Chen', 'project_manager'),
  ('66666666-6666-6666-6666-666666666663', 'field2@gcmanager.demo', 'Casey Morgan', 'field_supervisor'),
  ('66666666-6666-6666-6666-666666666665', 'sub2@gcmanager.demo', 'Taylor Quinn', 'subcontractor')
on conflict (id) do update
  set email = excluded.email,
      full_name = excluded.full_name,
      role = excluded.role;

insert into public.contract_assignments (contract_id, user_id, assignment_role)
select v.contract_id, v.user_id, v.assignment_role
from (values
  ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaa4'::uuid, '66666666-6666-6666-6666-666666666661'::uuid, 'project_manager'),
  ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaa6'::uuid, '66666666-6666-6666-6666-666666666661'::uuid, 'project_manager'),
  ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaa7'::uuid, '66666666-6666-6666-6666-666666666661'::uuid, 'project_manager'),
  ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaa1'::uuid, '66666666-6666-6666-6666-666666666663'::uuid, 'field_supervisor'),
  ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaa4'::uuid, '66666666-6666-6666-6666-666666666663'::uuid, 'field_supervisor')
) as v(contract_id, user_id, assignment_role)
where exists (select 1 from public.contracts c where c.id = v.contract_id)
  and not exists (
    select 1 from public.contract_assignments ca
    where ca.contract_id = v.contract_id and ca.user_id = v.user_id
  );

update public.subcontractors
set user_id = '66666666-6666-6666-6666-666666666665',
    contact_email = 'sub2@gcmanager.demo',
    contact_name = 'Taylor Quinn'
where company_name in ('Flow Plumbing Inc', 'Solid Concrete Works')
  and (user_id is null or user_id = '66666666-6666-6666-6666-666666666665');
