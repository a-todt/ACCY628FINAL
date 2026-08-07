-- WIP amount sanity + keep invoice junk from polluting WIP billings.
-- Background: migration 20260805151000 copied invoices → public.billings by project name.
-- So a bad invoice (e.g. $10B "Hello") showed up on the WIP tab as billed-to-date.

-- 1) Remove absurd WIP lines (including any leftover synced invoice copies).
delete from public.project_costs where coalesce(amount, 0) >= 1000000000;
delete from public.billings where coalesce(amount_billed, 0) >= 1000000000;
delete from public.project_change_orders where abs(coalesce(amount, 0)) >= 1000000000;

delete from public.billings
where lower(coalesce(billing_number, '')) in ('hello', 'test', 'asdf');

-- Orphan billings left behind after junk invoices were deleted:
-- same billing # + amount as a removed invoice pattern, or billing # with no invoice
-- on the linked contract and amount >= $50M (clearly not a normal progress bill).
delete from public.billings b
using public.projects p
where b.project_id = p.id
  and coalesce(b.amount_billed, 0) >= 50000000
  and not exists (
    select 1
    from public.invoices i
    join public.contracts c on c.id = i.contract_id
    where i.invoice_number is not distinct from b.billing_number
      and (
        p.contract_id = c.id
        or p.project_name = c.contract_name
      )
  );

alter table public.project_costs
  drop constraint if exists project_costs_amount_sane;
alter table public.project_costs
  add constraint project_costs_amount_sane
  check (amount is null or (amount > 0 and amount < 1000000000));

alter table public.billings
  drop constraint if exists billings_amount_billed_sane;
alter table public.billings
  add constraint billings_amount_billed_sane
  check (amount_billed is null or (amount_billed > 0 and amount_billed < 1000000000));

alter table public.project_change_orders
  drop constraint if exists project_change_orders_amount_sane;
alter table public.project_change_orders
  add constraint project_change_orders_amount_sane
  check (amount is null or (amount <> 0 and abs(amount) < 1000000000));

-- 2) When an invoice is deleted/updated, keep matching WIP billings in sync
--    (matched by invoice_number on projects linked via contract_id or name).
create or replace function public.sync_invoice_wip_billings()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  contract_name text;
begin
  if tg_op = 'DELETE' then
    select c.contract_name into contract_name
    from public.contracts c
    where c.id = old.contract_id;

    delete from public.billings b
    using public.projects p
    where b.project_id = p.id
      and b.billing_number is not distinct from old.invoice_number
      and (
        p.contract_id = old.contract_id
        or (contract_name is not null and p.project_name = contract_name)
      );

    return old;
  end if;

  -- UPDATE: if number/amount/retainage changed, push into matching WIP rows.
  if tg_op = 'UPDATE' then
    select c.contract_name into contract_name
    from public.contracts c
    where c.id = new.contract_id;

    update public.billings b
    set
      billing_number = new.invoice_number,
      billing_date = new.invoice_date,
      amount_billed = coalesce(new.invoice_amount, 0),
      retainage_held = coalesce(new.retainage_amount, 0),
      net_amount = coalesce(
        new.net_amount_due,
        coalesce(new.invoice_amount, 0) - coalesce(new.retainage_amount, 0)
      )
    from public.projects p
    where b.project_id = p.id
      and b.billing_number is not distinct from old.invoice_number
      and (
        p.contract_id = coalesce(new.contract_id, old.contract_id)
        or (contract_name is not null and p.project_name = contract_name)
      );

    return new;
  end if;

  return new;
end;
$$;

drop trigger if exists trg_sync_invoice_wip_billings on public.invoices;
create trigger trg_sync_invoice_wip_billings
  after update or delete on public.invoices
  for each row
  execute function public.sync_invoice_wip_billings();
