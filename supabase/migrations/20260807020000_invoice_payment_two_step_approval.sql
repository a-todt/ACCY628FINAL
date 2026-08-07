-- Invoice approval workflow + two-step payment approval (Accounting, then Admin over $250k).
-- Existing invoices/payments are treated as already cleared so historical AR stays intact.

-- Invoices -----------------------------------------------------------------
alter table public.invoices
  add column if not exists approval_status text not null default 'approved',
  add column if not exists submitted_by uuid references auth.users (id),
  add column if not exists accounting_approved_by uuid references auth.users (id),
  add column if not exists admin_approved_by uuid references auth.users (id),
  add column if not exists submitted_at timestamptz,
  add column if not exists accounting_approved_at timestamptz,
  add column if not exists admin_approved_at timestamptz,
  add column if not exists rejection_reason text;

alter table public.invoices
  drop constraint if exists invoices_approval_status_check;

alter table public.invoices
  add constraint invoices_approval_status_check
  check (
    approval_status in (
      'pending_accounting',
      'pending_admin',
      'approved',
      'rejected'
    )
  );

update public.invoices
set approval_status = 'approved'
where approval_status is null
   or approval_status = 'approved';

create index if not exists idx_invoices_approval_status
  on public.invoices (approval_status);

comment on column public.invoices.approval_status is
  'pending_accounting = awaiting Accounting; pending_admin = awaiting Admin over $250k; approved = billable; rejected = not billable';

-- Payments -----------------------------------------------------------------
alter table public.payments
  add column if not exists accounting_approved_by uuid references auth.users (id),
  add column if not exists admin_approved_by uuid references auth.users (id),
  add column if not exists accounting_approved_at timestamptz,
  add column if not exists admin_approved_at timestamptz;

alter table public.payments
  drop constraint if exists payments_approval_status_check;

-- Map legacy single-step pending to Accounting queue.
update public.payments
set approval_status = 'pending_accounting'
where approval_status = 'pending_approval';

alter table public.payments
  add constraint payments_approval_status_check
  check (
    approval_status in (
      'pending_accounting',
      'pending_admin',
      'posted',
      'rejected',
      'pending_approval'
    )
  );

comment on column public.payments.approval_status is
  'pending_accounting = awaiting Accounting; pending_admin = awaiting Admin over $250k; posted = applied to AR; rejected = not applied';
