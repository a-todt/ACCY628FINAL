-- When a portal bid is accepted, the winner needs a subcontractors engagement
-- on the package contract so Contracts scoping (by user_id) includes the job.
-- Backfill any accepted bids that are missing that link.

insert into public.subcontractors (
  contract_id,
  company_name,
  contact_name,
  contact_email,
  contact_phone,
  trade,
  subcontract_value,
  amount_paid,
  status,
  scope_of_work,
  user_id,
  license_number,
  license_state,
  license_expiration
)
select
  bp.contract_id,
  b.company_name,
  b.contact_name,
  b.contact_email,
  b.contact_phone,
  bp.trade,
  b.amount,
  0,
  'active',
  bp.scope_of_work,
  b.user_id,
  b.license_number,
  b.license_state,
  b.license_expiration
from public.bids b
join public.bid_packages bp on bp.id = b.bid_package_id
where b.status = 'accepted'
  and bp.contract_id is not null
  and b.user_id is not null
  and not exists (
    select 1
    from public.subcontractors s
    where s.contract_id = bp.contract_id
      and s.user_id = b.user_id
  );
