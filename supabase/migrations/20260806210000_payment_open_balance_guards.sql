-- Strengthen payment guards: amount must be > $0 AND cannot exceed remaining
-- open AR on the invoice (net due − amount_paid − other pending payments).

create or replace function public.enforce_payment_amount_positive()
returns trigger
language plpgsql
as $$
declare
  net_due numeric(14, 2);
  amount_paid numeric(14, 2);
  pending_others numeric(14, 2);
  open_balance numeric(14, 2);
begin
  if new.payment_amount is null or new.payment_amount <= 0 then
    raise exception 'Payment amount must be greater than $0';
  end if;

  -- Rejected rows are kept for audit but must still be positive; skip capacity.
  if coalesce(new.approval_status, 'posted') = 'rejected' then
    return new;
  end if;

  select
    coalesce(i.net_amount_due, i.invoice_amount, 0),
    coalesce(i.amount_paid, 0)
  into net_due, amount_paid
  from public.invoices i
  where i.id = new.invoice_id;

  if net_due is null then
    raise exception 'Invoice not found for payment';
  end if;

  select coalesce(sum(p.payment_amount), 0)
  into pending_others
  from public.payments p
  where p.invoice_id = new.invoice_id
    and p.id is distinct from new.id
    and coalesce(p.approval_status, 'posted') = 'pending_approval';

  open_balance := greatest(net_due - amount_paid - pending_others, 0);

  if new.payment_amount > open_balance + 0.005 then
    raise exception
      'Payment amount (%) exceeds open invoice balance (% remaining)',
      new.payment_amount,
      open_balance;
  end if;

  return new;
end;
$$;

-- Recreate trigger (name unchanged) so definition stays attached.
drop trigger if exists trg_enforce_payment_amount_positive on public.payments;
create trigger trg_enforce_payment_amount_positive
  before insert or update on public.payments
  for each row
  execute function public.enforce_payment_amount_positive();
