-- Guardrails: no $0 invoices/payments; cannot bill past revised contract value;
-- cannot mark an invoice paid unless amount_paid covers net due.

-- Remove junk demo overbill (e.g. $10B "Hello" invoice) so capacity checks can apply.
delete from public.payments
where invoice_id in (
  select id from public.invoices
  where coalesce(invoice_amount, 0) > (
    select coalesce(c.original_value, 0) * 2
    from public.contracts c
    where c.id = invoices.contract_id
  )
  and (
    lower(coalesce(invoice_number, '')) in ('hello', 'test', 'asdf')
    or coalesce(invoice_amount, 0) >= 1000000000
  )
);

delete from public.invoices
where coalesce(invoice_amount, 0) >= 1000000000
   or lower(coalesce(invoice_number, '')) in ('hello', 'test', 'asdf');

-- Fix invoices already marked paid without coverage.
update public.invoices
set status = case
  when coalesce(amount_paid, 0) > 0.005 then 'partially_paid'
  else 'unpaid'
end
where status = 'paid'
  and coalesce(amount_paid, 0) + 0.005 < coalesce(net_amount_due, invoice_amount, 0);

update public.invoices
set status = 'unpaid'
where status = 'paid'
  and coalesce(net_amount_due, invoice_amount, 0) <= 0.005;

alter table public.invoices
  drop constraint if exists invoices_invoice_amount_positive;

alter table public.invoices
  add constraint invoices_invoice_amount_positive
  check (invoice_amount is null or invoice_amount > 0);

alter table public.payments
  drop constraint if exists payments_payment_amount_positive;

alter table public.payments
  add constraint payments_payment_amount_positive
  check (payment_amount is null or payment_amount > 0);

create or replace function public.enforce_invoice_billing_guards()
returns trigger
language plpgsql
as $$
declare
  revised numeric(14, 2);
  billed_others numeric(14, 2);
  net_due numeric(14, 2);
  paid numeric(14, 2);
  check_capacity boolean;
begin
  if new.invoice_amount is not null and new.invoice_amount <= 0 then
    raise exception 'Invoice amount must be greater than $0';
  end if;

  check_capacity :=
    tg_op = 'INSERT'
    or new.invoice_amount is distinct from old.invoice_amount
    or new.contract_id is distinct from old.contract_id;

  if check_capacity then
    select
      coalesce(c.original_value, 0) + coalesce((
        select sum(co.amount)
        from public.change_orders co
        where co.contract_id = c.id and co.status = 'approved'
      ), 0)
    into revised
    from public.contracts c
    where c.id = new.contract_id;

    if revised is null then
      raise exception 'Contract not found for invoice';
    end if;

    select coalesce(sum(i.invoice_amount), 0)
    into billed_others
    from public.invoices i
    where i.contract_id = new.contract_id
      and i.id is distinct from new.id;

    if coalesce(new.invoice_amount, 0) > (revised - billed_others) + 0.005 then
      raise exception
        'Invoice amount (%) exceeds remaining billable on contract (% left of % revised)',
        new.invoice_amount,
        greatest(revised - billed_others, 0),
        revised;
    end if;
  end if;

  net_due := coalesce(new.net_amount_due, new.invoice_amount, 0);
  paid := coalesce(new.amount_paid, 0);

  if new.status = 'paid' then
    if net_due <= 0.005 then
      raise exception 'Cannot mark paid: invoice net due must be greater than $0';
    end if;
    if paid + 0.005 < net_due then
      raise exception 'Cannot mark paid until payments cover the net due';
    end if;
  end if;

  return new;
end;
$$;

drop trigger if exists trg_enforce_invoice_billing_guards on public.invoices;
create trigger trg_enforce_invoice_billing_guards
  before insert or update on public.invoices
  for each row
  execute function public.enforce_invoice_billing_guards();

create or replace function public.enforce_payment_amount_positive()
returns trigger
language plpgsql
as $$
begin
  if new.payment_amount is not null and new.payment_amount <= 0 then
    raise exception 'Payment amount must be greater than $0';
  end if;
  return new;
end;
$$;

drop trigger if exists trg_enforce_payment_amount_positive on public.payments;
create trigger trg_enforce_payment_amount_positive
  before insert or update on public.payments
  for each row
  execute function public.enforce_payment_amount_positive();
