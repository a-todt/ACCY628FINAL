-- Vendor (subcontractor) payments ledger for Accounting payables.
-- Posted payments bump subcontractors.amount_paid so the sub dashboard stays current.
-- Guards: no $0 / blank payments; no overpay beyond remaining subcontract value.

create table if not exists public.subcontractor_payments (
  id uuid primary key default gen_random_uuid(),
  subcontractor_id uuid not null references public.subcontractors (id) on delete cascade,
  payment_amount numeric(14, 2) not null,
  payment_date date,
  payment_method text,
  reference_number text,
  notes text,
  recorded_by uuid references auth.users (id),
  created_at timestamptz not null default now(),
  constraint subcontractor_payments_amount_positive check (payment_amount > 0)
);

create index if not exists idx_subcontractor_payments_sub_id
  on public.subcontractor_payments (subcontractor_id);

create index if not exists idx_subcontractor_payments_date
  on public.subcontractor_payments (payment_date desc nulls last);

comment on table public.subcontractor_payments is
  'AP payments to subcontractors. Each insert posts to subcontractors.amount_paid.';

-- Prevent overpayment and bump amount_paid on insert.
create or replace function public.apply_subcontractor_payment()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_value numeric(14, 2);
  v_paid numeric(14, 2);
  v_remaining numeric(14, 2);
begin
  if new.payment_amount is null or new.payment_amount <= 0 then
    raise exception 'Subcontractor payment must be greater than $0.';
  end if;

  select coalesce(subcontract_value, 0), coalesce(amount_paid, 0)
    into v_value, v_paid
  from public.subcontractors
  where id = new.subcontractor_id
  for update;

  if not found then
    raise exception 'Subcontractor not found.';
  end if;

  if v_value <= 0 then
    raise exception 'Cannot pay a subcontractor with no subcontract value.';
  end if;

  v_remaining := v_value - v_paid;
  if new.payment_amount > v_remaining + 0.005 then
    raise exception
      'Payment of % exceeds remaining payable (%) on this subcontract.',
      new.payment_amount,
      greatest(v_remaining, 0);
  end if;

  update public.subcontractors
  set amount_paid = coalesce(amount_paid, 0) + new.payment_amount
  where id = new.subcontractor_id;

  return new;
end;
$$;

drop trigger if exists trg_apply_subcontractor_payment on public.subcontractor_payments;
create trigger trg_apply_subcontractor_payment
  before insert on public.subcontractor_payments
  for each row
  execute function public.apply_subcontractor_payment();

-- Keep amount_paid consistent if a payment row is deleted (rare).
create or replace function public.revert_subcontractor_payment()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  update public.subcontractors
  set amount_paid = greatest(0, coalesce(amount_paid, 0) - coalesce(old.payment_amount, 0))
  where id = old.subcontractor_id;
  return old;
end;
$$;

drop trigger if exists trg_revert_subcontractor_payment on public.subcontractor_payments;
create trigger trg_revert_subcontractor_payment
  after delete on public.subcontractor_payments
  for each row
  execute function public.revert_subcontractor_payment();

alter table public.subcontractor_payments enable row level security;

drop policy if exists "subcontractor_payments_select" on public.subcontractor_payments;
create policy "subcontractor_payments_select"
  on public.subcontractor_payments for select to authenticated
  using (
    public.is_admin_or_pm()
    or public.is_owner_or_admin()
    or exists (
      select 1
      from public.subcontractors s
      where s.id = subcontractor_id
        and s.user_id = auth.uid()
    )
  );

drop policy if exists "subcontractor_payments_insert" on public.subcontractor_payments;
create policy "subcontractor_payments_insert"
  on public.subcontractor_payments for insert to authenticated
  with check (
    public.is_admin_or_pm()
    or public.is_owner_or_admin()
  );

drop policy if exists "subcontractor_payments_delete" on public.subcontractor_payments;
create policy "subcontractor_payments_delete"
  on public.subcontractor_payments for delete to authenticated
  using (public.is_owner_or_admin());
