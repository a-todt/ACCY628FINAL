-- Seed WIP projects from existing contracts (idempotent by user_id + project_name).
-- Creates a row for the contract owner and also for the demo admin so Finance → Projects
-- is populated when signed in as admin@gcmanager.demo.

INSERT INTO public.projects (
  user_id,
  project_name,
  client_name,
  original_contract_value,
  revised_contract_value,
  estimated_total_cost,
  start_date,
  end_date,
  status
)
SELECT
  c.user_id,
  c.contract_name,
  c.client_name,
  COALESCE(c.original_value, 0),
  COALESCE(c.original_value, 0) + COALESCE(co.approved_cos, 0),
  CASE
    WHEN COALESCE(ce.total_costs, 0) > 0
      THEN GREATEST(COALESCE(ce.total_costs, 0), COALESCE(c.original_value, 0) * 0.85)
    ELSE COALESCE(c.original_value, 0) * 0.85
  END,
  c.start_date,
  c.end_date,
  CASE c.status
    WHEN 'completed' THEN 'completed'
    WHEN 'on_hold' THEN 'on_hold'
    WHEN 'canceled' THEN 'on_hold'
    ELSE 'active'
  END
FROM public.contracts c
LEFT JOIN (
  SELECT contract_id, SUM(amount) AS approved_cos
  FROM public.change_orders
  WHERE status = 'approved'
  GROUP BY contract_id
) co ON co.contract_id = c.id
LEFT JOIN (
  SELECT contract_id, SUM(amount) AS total_costs
  FROM public.cost_entries
  GROUP BY contract_id
) ce ON ce.contract_id = c.id
WHERE NOT EXISTS (
  SELECT 1
  FROM public.projects p
  WHERE p.user_id = c.user_id
    AND p.project_name = c.contract_name
);

INSERT INTO public.projects (
  user_id,
  project_name,
  client_name,
  original_contract_value,
  revised_contract_value,
  estimated_total_cost,
  start_date,
  end_date,
  status
)
SELECT
  admin_user.id,
  c.contract_name,
  c.client_name,
  COALESCE(c.original_value, 0),
  COALESCE(c.original_value, 0) + COALESCE(co.approved_cos, 0),
  CASE
    WHEN COALESCE(ce.total_costs, 0) > 0
      THEN GREATEST(COALESCE(ce.total_costs, 0), COALESCE(c.original_value, 0) * 0.85)
    ELSE COALESCE(c.original_value, 0) * 0.85
  END,
  c.start_date,
  c.end_date,
  CASE c.status
    WHEN 'completed' THEN 'completed'
    WHEN 'on_hold' THEN 'on_hold'
    WHEN 'canceled' THEN 'on_hold'
    ELSE 'active'
  END
FROM public.contracts c
CROSS JOIN (
  SELECT id FROM public.user_profiles WHERE email = 'admin@gcmanager.demo' LIMIT 1
) admin_user
LEFT JOIN (
  SELECT contract_id, SUM(amount) AS approved_cos
  FROM public.change_orders
  WHERE status = 'approved'
  GROUP BY contract_id
) co ON co.contract_id = c.id
LEFT JOIN (
  SELECT contract_id, SUM(amount) AS total_costs
  FROM public.cost_entries
  GROUP BY contract_id
) ce ON ce.contract_id = c.id
WHERE NOT EXISTS (
  SELECT 1
  FROM public.projects p
  WHERE p.user_id = admin_user.id
    AND p.project_name = c.contract_name
);
