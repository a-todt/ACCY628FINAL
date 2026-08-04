-- Roles for demo users already created via Auth API.
-- Run AFTER SCHEMA_ONLY.sql

insert into public.user_profiles (id, email, full_name, role)
select u.id, u.email, coalesce(u.raw_user_meta_data->>'full_name', u.email), v.role
from auth.users u
join (
  values
    ('admin@gcmanager.demo', 'admin'),
    ('pm@gcmanager.demo', 'project_manager'),
    ('client@gcmanager.demo', 'client'),
    ('field@gcmanager.demo', 'field_supervisor'),
    ('sub@gcmanager.demo', 'subcontractor')
) as v(email, role) on lower(u.email) = lower(v.email)
on conflict (id) do update
  set email = excluded.email,
      full_name = excluded.full_name,
      role = excluded.role;
