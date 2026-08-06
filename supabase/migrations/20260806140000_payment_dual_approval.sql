-- Dual-approval workflow for payments (maker / owner checker).
-- Existing payments are backfilled as posted so historical AR stays intact.

alter table public.payments
  add column if not exists approval_status text not null default 'posted',
  add column if not exists submitted_by uuid references auth.users (id),
  add column if not exists approved_by uuid references auth.users (id),
  add column if not exists submitted_at timestamptz,
  add column if not exists approved_at timestamptz,
  add column if not exists rejection_reason text;

alter table public.payments
  drop constraint if exists payments_approval_status_check;

alter table public.payments
  add constraint payments_approval_status_check
  check (approval_status in ('pending_approval', 'posted', 'rejected'));

-- Historical rows stay posted (already applied to invoice.amount_paid).
update public.payments
set
  approval_status = 'posted',
  submitted_at = coalesce(submitted_at, created_at),
  approved_at = coalesce(approved_at, created_at)
where approval_status is null
   or approval_status = 'posted';

create index if not exists idx_payments_approval_status
  on public.payments (approval_status);

comment on column public.payments.approval_status is
  'pending_approval = awaiting owner; posted = applied to AR; rejected = not applied';
