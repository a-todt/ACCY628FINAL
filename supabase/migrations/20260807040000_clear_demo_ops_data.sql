-- Clear operational demo/seed rows while preserving schema, RLS, auth users,
-- user_profiles, and company_settings so the app keeps working empty.

delete from public.messages;
delete from public.message_thread_participants;
delete from public.message_threads;
delete from public.bids;
delete from public.bid_packages;
delete from public.payments;
delete from public.invoices;
delete from public.field_logs;
delete from public.cost_entries;
delete from public.change_orders;
delete from public.milestones;
delete from public.subcontractor_invites;
delete from public.insurance_policies;
delete from public.contract_insurance_requirements;
delete from public.safety_incidents;
delete from public.subcontractors;
delete from public.contract_assignments;
delete from public.attachments;
delete from public.access_audit_log;
delete from public.customers;
delete from public.project_change_orders;
delete from public.project_costs;
delete from public.billings;
delete from public.projects;
delete from public.employee_certifications;
delete from public.contracts;

-- Field-supervisor Contracts page RPC (may be missing on remote).
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

notify pgrst, 'reload schema';
