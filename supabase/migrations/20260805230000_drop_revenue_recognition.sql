-- Remove revenue recognition columns added earlier.

alter table public.contracts
  drop constraint if exists contracts_revenue_recognition_method_check;

alter table public.contracts
  drop column if exists revenue_recognition_method;

alter table public.contracts
  drop column if exists estimated_total_cost;
