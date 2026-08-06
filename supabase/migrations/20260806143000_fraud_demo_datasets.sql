-- Demo fraud / control exception datasets (visible to Owner via Alerts).
-- Idempotent: fixed UUIDs so re-applying is safe.

-- --------------------------------------------------------------------------
-- Dataset A: Duplicate invoice number (billing fraud red flag)
-- --------------------------------------------------------------------------
insert into public.invoices (
  id, contract_id, invoice_number, invoice_date, due_date, description,
  invoice_amount, retainage_percent, retainage_amount, net_amount_due,
  amount_paid, status, notes
) values (
  'b0000000-0000-4000-8000-0000000000f1',
  'a0000000-0000-4000-8000-000000000002',
  'INV-01-1',
  current_date - 12,
  current_date + 18,
  'DEMO FRAUD — duplicate invoice number reused on a second project',
  50000.00,
  10,
  5000.00,
  45000.00,
  0,
  'unpaid',
  'Seeded fraud demo: same invoice # as Lakeshore INV-01-1'
)
on conflict (id) do update set
  invoice_number = excluded.invoice_number,
  description = excluded.description,
  notes = excluded.notes,
  status = excluded.status,
  amount_paid = excluded.amount_paid;

-- --------------------------------------------------------------------------
-- Dataset B: Payment awaiting owner dual-approval
-- --------------------------------------------------------------------------
insert into public.payments (
  id, invoice_id, payment_amount, payment_date, payment_method,
  reference_number, notes, approval_status, submitted_by, submitted_at
)
select
  'b0000000-0000-4000-8000-0000000000f2',
  '8a5205d4-0b8d-4348-a5d2-262cdd4ffab3', -- INV-01-3 unpaid
  25000.00,
  current_date - 1,
  'ACH',
  'FRAUD-PMT-DEMO-01',
  'DEMO FRAUD — PM-submitted payment waiting for owner approval',
  'pending_approval',
  p.id,
  now() - interval '1 day'
from public.user_profiles p
where p.email = 'pm@gcmanager.demo'
limit 1
on conflict (id) do update set
  payment_amount = excluded.payment_amount,
  notes = excluded.notes,
  approval_status = 'pending_approval',
  reference_number = excluded.reference_number,
  submitted_at = excluded.submitted_at;

-- If PM profile missing, still insert the pending payment without submitted_by
insert into public.payments (
  id, invoice_id, payment_amount, payment_date, payment_method,
  reference_number, notes, approval_status, submitted_at
) values (
  'b0000000-0000-4000-8000-0000000000f2',
  '8a5205d4-0b8d-4348-a5d2-262cdd4ffab3',
  25000.00,
  current_date - 1,
  'ACH',
  'FRAUD-PMT-DEMO-01',
  'DEMO FRAUD — payment waiting for owner approval',
  'pending_approval',
  now() - interval '1 day'
)
on conflict (id) do nothing;

-- --------------------------------------------------------------------------
-- Dataset B (extra): Large pending change order (>$50k fraud threshold)
-- --------------------------------------------------------------------------
insert into public.change_orders (
  id, contract_id, change_order_number, description, reason, amount,
  status, date_submitted, notes
) values (
  'b0000000-0000-4000-8000-0000000000f3',
  'a0000000-0000-4000-8000-000000000001',
  'CO-FRAUD-01',
  'DEMO FRAUD — unusually large pending change order',
  'Scope expansion with weak supporting docs (demo)',
  78500.00,
  'pending',
  current_date - 3,
  'Seeded fraud demo for owner Alerts'
)
on conflict (id) do update set
  amount = excluded.amount,
  status = 'pending',
  description = excluded.description,
  notes = excluded.notes;

-- --------------------------------------------------------------------------
-- Dataset A (extra): Clear overpayment on a paid invoice
-- --------------------------------------------------------------------------
update public.invoices
set
  amount_paid = net_amount_due + 12500.00,
  notes = coalesce(notes, '') || ' | DEMO FRAUD — amount_paid exceeds net due',
  status = 'paid'
where id = 'ed2b7edc-acb9-4b11-b559-59bef326518b' -- INV-02-1
  and amount_paid <= net_amount_due + 0.01;
