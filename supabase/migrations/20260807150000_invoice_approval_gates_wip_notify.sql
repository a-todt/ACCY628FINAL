-- Only approved invoices sync into WIP billings.
-- Pending / rejected invoices must not pollute billed-to-date or reports.
-- Capacity guards ignore rejected invoices (pending still reserves billable room).

create or replace function public.sync_invoice_wip_billings()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  contract_name text;
  proj record;
  v_user uuid;
  v_amount numeric(14, 2);
  v_retainage numeric(14, 2);
  v_net numeric(14, 2);
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

  -- INSERT or UPDATE
  select c.contract_name into contract_name
  from public.contracts c
  where c.id = new.contract_id;

  -- If invoice number changed, drop rows tied to the old number first.
  if tg_op = 'UPDATE'
     and old.invoice_number is distinct from new.invoice_number then
    delete from public.billings b
    using public.projects p
    where b.project_id = p.id
      and b.billing_number is not distinct from old.invoice_number
      and (
        p.contract_id = coalesce(new.contract_id, old.contract_id)
        or (contract_name is not null and p.project_name = contract_name)
      );
  end if;

  -- Not approved yet (or rejected): remove any WIP billing copies and stop.
  if coalesce(new.approval_status, 'approved') is distinct from 'approved' then
    delete from public.billings b
    using public.projects p
    where b.project_id = p.id
      and b.billing_number is not distinct from new.invoice_number
      and (
        p.contract_id = new.contract_id
        or (contract_name is not null and p.project_name = contract_name)
      );
    return new;
  end if;

  -- Approved: upsert matching WIP billings on linked projects.
  v_amount := coalesce(new.invoice_amount, 0);
  v_retainage := coalesce(new.retainage_amount, 0);
  v_net := coalesce(
    new.net_amount_due,
    v_amount - v_retainage
  );

  for proj in
    select p.id, p.user_id
    from public.projects p
    where p.contract_id = new.contract_id
       or (contract_name is not null and p.project_name = contract_name)
  loop
    update public.billings b
    set
      billing_number = new.invoice_number,
      billing_date = new.invoice_date,
      amount_billed = v_amount,
      retainage_held = v_retainage,
      net_amount = v_net,
      status = coalesce(b.status, 'submitted')
    where b.project_id = proj.id
      and b.billing_number is not distinct from new.invoice_number;

    if not found then
      v_user := coalesce(proj.user_id, new.submitted_by, auth.uid());
      if v_user is null then
        continue;
      end if;
      insert into public.billings (
        user_id,
        project_id,
        billing_number,
        billing_date,
        amount_billed,
        retainage_held,
        net_amount,
        status
      ) values (
        v_user,
        proj.id,
        new.invoice_number,
        new.invoice_date,
        v_amount,
        v_retainage,
        v_net,
        'submitted'
      );
    end if;
  end loop;

  return new;
end;
$$;

drop trigger if exists trg_sync_invoice_wip_billings on public.invoices;
create trigger trg_sync_invoice_wip_billings
  after insert or update or delete on public.invoices
  for each row
  execute function public.sync_invoice_wip_billings();

-- Strip existing WIP copies of invoices that are not approved.
delete from public.billings b
using public.projects p
where b.project_id = p.id
  and exists (
    select 1
    from public.invoices i
    join public.contracts c on c.id = i.contract_id
    where i.invoice_number is not distinct from b.billing_number
      and coalesce(i.approval_status, 'approved') is distinct from 'approved'
      and (
        p.contract_id = c.id
        or p.project_name = c.contract_name
      )
  );

-- Rejected invoices must not consume billable capacity; pending still reserves.
create or replace function public.enforce_invoice_billing_guards()
returns trigger
language plpgsql
as $function$
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
    or new.contract_id is distinct from old.contract_id
    or coalesce(new.approval_status, 'approved') is distinct from coalesce(old.approval_status, 'approved');

  if check_capacity and coalesce(new.approval_status, 'approved') is distinct from 'rejected' then
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
      and i.id is distinct from new.id
      and coalesce(i.approval_status, 'approved') is distinct from 'rejected';

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
$function$;
