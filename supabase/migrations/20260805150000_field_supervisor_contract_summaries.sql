-- Field supervisors may browse a limited summary of every contract while
-- retaining full row-level access only to contracts assigned to them.

create or replace function public.list_contract_summaries()
returns table (
  id uuid,
  contract_name text,
  client_name text,
  city text,
  state text,
  contract_type text,
  start_date date,
  end_date date,
  status text,
  supervised_by_me boolean
)
language sql
security definer
set search_path = ''
stable
as $$
  select
    c.id,
    c.contract_name,
    c.client_name,
    c.city,
    c.state,
    c.contract_type,
    c.start_date,
    c.end_date,
    c.status,
    exists (
      select 1
      from public.contract_assignments ca
      where ca.contract_id = c.id
        and ca.user_id = (select auth.uid())
    ) as supervised_by_me
  from public.contracts c
  where
    public.get_user_role() = 'field_supervisor'
    or public.can_access_contract(c.id)
  order by c.contract_name;
$$;

revoke all on function public.list_contract_summaries() from public;
grant execute on function public.list_contract_summaries() to authenticated;
