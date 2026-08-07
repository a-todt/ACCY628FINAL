-- Seed WIP child tables from contract-side cost_entries / invoices / change_orders.
-- Matched by projects.project_name = contracts.contract_name (idempotent).

INSERT INTO public.project_costs (
  user_id, project_id, cost_date, cost_category, description, amount
)
SELECT
  p.user_id,
  p.id,
  ce.date_incurred,
  COALESCE(ce.category, 'other'),
  ce.description,
  COALESCE(ce.amount, 0)
FROM public.cost_entries ce
JOIN public.contracts c ON c.id = ce.contract_id
JOIN public.projects p ON p.project_name = c.contract_name
WHERE NOT EXISTS (
  SELECT 1
  FROM public.project_costs pc
  WHERE pc.project_id = p.id
    AND pc.amount IS NOT DISTINCT FROM ce.amount
    AND pc.cost_date IS NOT DISTINCT FROM ce.date_incurred
    AND pc.description IS NOT DISTINCT FROM ce.description
);

INSERT INTO public.billings (
  user_id, project_id, billing_number, billing_date,
  amount_billed, retainage_held, net_amount, status
)
SELECT
  p.user_id,
  p.id,
  i.invoice_number,
  i.invoice_date,
  COALESCE(i.invoice_amount, 0),
  COALESCE(i.retainage_amount, 0),
  COALESCE(i.net_amount_due, COALESCE(i.invoice_amount, 0) - COALESCE(i.retainage_amount, 0)),
  CASE
    WHEN i.status IN ('paid', 'partially_paid') THEN 'paid'
    WHEN i.status = 'sent' THEN 'submitted'
    WHEN i.status = 'draft' THEN 'draft'
    ELSE COALESCE(i.status, 'submitted')
  END
FROM public.invoices i
JOIN public.contracts c ON c.id = i.contract_id
JOIN public.projects p ON p.project_name = c.contract_name
WHERE coalesce(i.invoice_amount, 0) > 0
  AND coalesce(i.invoice_amount, 0) < 1000000000
  AND NOT EXISTS (
  SELECT 1
  FROM public.billings b
  WHERE b.project_id = p.id
    AND b.billing_number IS NOT DISTINCT FROM i.invoice_number
    AND b.amount_billed IS NOT DISTINCT FROM i.invoice_amount
);

INSERT INTO public.project_change_orders (
  user_id, project_id, change_order_number, description, amount, status, approved_date
)
SELECT
  p.user_id,
  p.id,
  co.change_order_number,
  co.description,
  COALESCE(co.amount, 0),
  COALESCE(co.status, 'pending'),
  COALESCE(co.date_resolved, CASE WHEN co.status = 'approved' THEN co.date_submitted ELSE NULL END)
FROM public.change_orders co
JOIN public.contracts c ON c.id = co.contract_id
JOIN public.projects p ON p.project_name = c.contract_name
WHERE NOT EXISTS (
  SELECT 1
  FROM public.project_change_orders pco
  WHERE pco.project_id = p.id
    AND pco.change_order_number IS NOT DISTINCT FROM co.change_order_number
    AND pco.amount IS NOT DISTINCT FROM co.amount
);
