-- Demo control: allow Accounting (owner role) to bypass same-person
-- create/approve segregation of duties when enabled in Company Settings.

alter table public.company_settings
  add column if not exists allow_owner_sod_override boolean not null default true;

comment on column public.company_settings.allow_owner_sod_override is
  'When true, Accounting (owner) may approve invoices/payments/costs they submitted. Demo convenience; does not change amount thresholds.';
