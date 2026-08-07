-- New invoices and cost logs must start pending — never auto-count in graphs/totals.
-- Historical approved rows keep approval_status = 'approved'.

alter table public.invoices
  alter column approval_status set default 'pending_accounting';

alter table public.cost_entries
  alter column approval_status set default 'pending_accounting';

comment on column public.invoices.approval_status is
  'pending_accounting = awaiting Accounting; pending_admin = awaiting Admin over threshold; approved = billable / charts; rejected = excluded';

comment on column public.cost_entries.approval_status is
  'pending_accounting = awaiting Accounting; pending_admin = awaiting Admin above cost threshold; approved = counts in job cost / charts; rejected = excluded';

-- Strip any WIP billings still tied to non-approved invoices (same match as sync trigger).
delete from public.billings b
using public.projects p
where b.project_id = p.id
  and exists (
    select 1
    from public.invoices i
    join public.contracts c on c.id = i.contract_id
    where i.invoice_number is not distinct from b.billing_number
      and i.approval_status is distinct from 'approved'
      and (
        p.contract_id = c.id
        or p.project_name = c.contract_name
      )
  );
