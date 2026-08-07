-- Rename demo Owner / Executive login email to Accounting.
-- Match by email only — do not key off a shared UUID that may belong to another demo user.

update auth.users
set
  email = 'accounting@gcmanager.demo',
  raw_user_meta_data = coalesce(raw_user_meta_data, '{}'::jsonb)
    || jsonb_build_object('full_name', 'Demo Accounting'),
  updated_at = now()
where email = 'owner@gcmanager.demo';

update auth.identities i
set
  identity_data = coalesce(i.identity_data, '{}'::jsonb)
    || jsonb_build_object('email', 'accounting@gcmanager.demo'),
  updated_at = now()
from auth.users u
where i.user_id = u.id
  and i.provider = 'email'
  and u.email = 'accounting@gcmanager.demo';

update public.user_profiles
set
  email = 'accounting@gcmanager.demo',
  full_name = 'Demo Accounting'
where email = 'owner@gcmanager.demo';
