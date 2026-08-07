-- Demo structuring / threshold-skirting charges for fraud alerts.
-- Exact $249,999 ×2 by same PM + three invoices in the $240k–$250k band.

do $$
declare
  v_pm uuid;
  v_c1 uuid := 'a0000000-0000-4000-8000-000000000030'; -- Arlington (room to bill)
  v_c2 uuid := 'a0000000-0000-4000-8000-000000000036'; -- Waukegan
  v_c3 uuid := 'a0000000-0000-4000-8000-000000000040'; -- Geneva
begin
  select id into v_pm from public.user_profiles where email = 'pm@gcmanager.demo' limit 1;
  if v_pm is null then
    return;
  end if;

  insert into public.contract_assignments (contract_id, user_id, assignment_role)
  values
    (v_c1, v_pm, 'project_manager'),
    (v_c2, v_pm, 'project_manager'),
    (v_c3, v_pm, 'project_manager')
  on conflict (contract_id, user_id) do nothing;

  insert into public.cost_entries (
    id, contract_id, user_id, category, description, amount, date_incurred, notes
  ) values
  (
    'b0000000-0000-4000-8000-0000000000c1',
    v_c1,
    v_pm,
    'subcontractor',
    'DEMO FRAUD — structuring charge A ($249,999)',
    249999.00,
    current_date - 5,
    'Seeded fraud demo: repeated $249,999 by same PM'
  ),
  (
    'b0000000-0000-4000-8000-0000000000c2',
    v_c2,
    v_pm,
    'subcontractor',
    'DEMO FRAUD — structuring charge B ($249,999)',
    249999.00,
    current_date - 3,
    'Seeded fraud demo: repeated $249,999 by same PM'
  )
  on conflict (id) do update set
    amount = excluded.amount,
    user_id = excluded.user_id,
    description = excluded.description,
    notes = excluded.notes;

  insert into public.invoices (
    id, contract_id, invoice_number, invoice_date, due_date, description,
    invoice_amount, retainage_percent, retainage_amount, net_amount_due,
    amount_paid, status, notes
  ) values
  (
    'b0000000-0000-4000-8000-0000000000a1',
    v_c1,
    'INV-FRAUD-240A',
    current_date - 10,
    current_date + 20,
    'DEMO FRAUD — threshold-skirting invoice A',
    245000.00,
    10,
    24500.00,
    220500.00,
    0,
    'unpaid',
    'Seeded fraud demo: $240k–$250k band'
  ),
  (
    'b0000000-0000-4000-8000-0000000000a2',
    v_c2,
    'INV-FRAUD-240B',
    current_date - 8,
    current_date + 22,
    'DEMO FRAUD — threshold-skirting invoice B',
    248500.00,
    10,
    24850.00,
    223650.00,
    0,
    'unpaid',
    'Seeded fraud demo: $240k–$250k band'
  ),
  (
    'b0000000-0000-4000-8000-0000000000a3',
    v_c3,
    'INV-FRAUD-240C',
    current_date - 6,
    current_date + 24,
    'DEMO FRAUD — threshold-skirting invoice C',
    242000.00,
    10,
    24200.00,
    217800.00,
    0,
    'unpaid',
    'Seeded fraud demo: $240k–$250k band'
  )
  on conflict (id) do update set
    invoice_amount = excluded.invoice_amount,
    description = excluded.description,
    notes = excluded.notes,
    status = excluded.status;
end $$;
