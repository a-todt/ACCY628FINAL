-- Fix SQL-created demo staff passwords so GoTrue accepts Demo123!
-- (pgcrypto crypt defaults to bcrypt cost 6; Auth API uses cost 10)

update auth.users u
set encrypted_password = w.encrypted_password,
    email_confirmed_at = coalesce(u.email_confirmed_at, now()),
    updated_at = now()
from auth.users w
where w.email = 'pm@gcmanager.demo'
  and u.email in (
    'pm2@gcmanager.demo',
    'field2@gcmanager.demo',
    'sub2@gcmanager.demo'
  );
