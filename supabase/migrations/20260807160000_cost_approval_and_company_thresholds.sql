-- Configurable approval thresholds + cost entry approval workflow.
-- Defaults: invoices need Admin at/above $250k; costs need Admin above $50k.
-- All new cost logs start in Accounting queue (same pattern as invoices).

alter table public.company_settings
  add column if not exists invoice_admin_approval_threshold numeric(14, 2)
    not null default 250000,
  add column if not exists cost_admin_approval_threshold numeric(14, 2)
    not null default 50000;

comment on column public.company_settings.invoice_admin_approval_threshold is
  'Invoice/payment amounts at or above this require Accounting then Admin / Owner.';
comment on column public.company_settings.cost_admin_approval_threshold is
  'Cost log amounts at or below this need Accounting only; above this need Accounting then Admin / Owner.';

alter table public.cost_entries
  add column if not exists approval_status text not null default 'approved',
  add column if not exists submitted_by uuid references auth.users (id),
  add column if not exists accounting_approved_by uuid references auth.users (id),
  add column if not exists admin_approved_by uuid references auth.users (id),
  add column if not exists submitted_at timestamptz,
  add column if not exists accounting_approved_at timestamptz,
  add column if not exists admin_approved_at timestamptz,
  add column if not exists rejection_reason text;

alter table public.cost_entries
  drop constraint if exists cost_entries_approval_status_check;

alter table public.cost_entries
  add constraint cost_entries_approval_status_check
  check (
    approval_status in (
      'pending_accounting',
      'pending_admin',
      'approved',
      'rejected'
    )
  );

-- Historical cost logs stay usable in reports.
update public.cost_entries
set approval_status = 'approved'
where approval_status is null
   or approval_status not in ('pending_accounting', 'pending_admin', 'approved', 'rejected');

create index if not exists idx_cost_entries_approval_status
  on public.cost_entries (approval_status);

comment on column public.cost_entries.approval_status is
  'pending_accounting = awaiting Accounting; pending_admin = awaiting Admin above cost threshold; approved = counts in job cost; rejected = excluded';

-- Let Accounting (owner) and Admin update approval fields on any accessible cost.
drop policy if exists "cost_entries_update" on public.cost_entries;
create policy "cost_entries_update"
  on public.cost_entries for update to authenticated
  using (
    public.is_admin_or_pm()
    or public.is_owner_or_admin()
    or (user_id = auth.uid() and public.can_access_contract(contract_id))
  )
  with check (
    public.is_admin_or_pm()
    or public.is_owner_or_admin()
    or (user_id = auth.uid() and public.can_access_contract(contract_id))
  );
