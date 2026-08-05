-- Revenue recognition: per-contract method + estimated total cost for POC.

alter table public.contracts
  add column if not exists revenue_recognition_method text not null
    default 'percentage_of_completion';

alter table public.contracts
  add column if not exists estimated_total_cost numeric(14, 2);

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'contracts_revenue_recognition_method_check'
  ) then
    alter table public.contracts
      add constraint contracts_revenue_recognition_method_check
      check (
        revenue_recognition_method in (
          'percentage_of_completion',
          'completed_contract'
        )
      );
  end if;
end $$;

comment on column public.contracts.revenue_recognition_method is
  'percentage_of_completion (cost-to-cost) or completed_contract.';

comment on column public.contracts.estimated_total_cost is
  'Estimated total job cost used for percentage-of-completion recognition.';
