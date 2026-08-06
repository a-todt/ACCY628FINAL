-- Richer bid-package scope detail + bidder contact info on bids.
-- Project managers may review/award bids but no longer create packages or staff-enter bids.

alter table public.bid_packages
  add column if not exists scope_inclusions text,
  add column if not exists scope_exclusions text,
  add column if not exists work_quantities text;

comment on column public.bid_packages.scope_inclusions is
  'Work explicitly included in the package scope.';
comment on column public.bid_packages.scope_exclusions is
  'Work explicitly excluded from the package scope.';
comment on column public.bid_packages.work_quantities is
  'Key quantities / takeoff summary for bidders.';

alter table public.bids
  add column if not exists contact_name text,
  add column if not exists contact_email text,
  add column if not exists contact_phone text;

comment on column public.bids.contact_name is
  'Bidder contact person name submitted with the bid.';
comment on column public.bids.contact_email is
  'Bidder contact email submitted with the bid.';
comment on column public.bids.contact_phone is
  'Bidder contact phone submitted with the bid.';

-- Only admin/owner create or delete packages
drop policy if exists "bid_packages_insert" on public.bid_packages;
create policy "bid_packages_insert"
  on public.bid_packages for insert to authenticated
  with check (public.get_user_role() in ('admin', 'owner'));

drop policy if exists "bid_packages_delete" on public.bid_packages;
create policy "bid_packages_delete"
  on public.bid_packages for delete to authenticated
  using (public.get_user_role() in ('admin', 'owner'));

-- PM retained on update so they can award/close packages when reviewing bids
drop policy if exists "bid_packages_update" on public.bid_packages;
create policy "bid_packages_update"
  on public.bid_packages for update to authenticated
  using (public.get_user_role() in ('admin', 'owner', 'project_manager'))
  with check (public.get_user_role() in ('admin', 'owner', 'project_manager'));

-- Staff-entered bids: admin/owner only; subcontractors still submit their own
drop policy if exists "bids_insert" on public.bids;
create policy "bids_insert"
  on public.bids for insert to authenticated
  with check (
    (
      public.get_user_role() in ('admin', 'owner')
    )
    or (
      public.get_user_role() = 'subcontractor'
      and user_id = auth.uid()
      and exists (
        select 1 from public.bid_packages bp
        where bp.id = bid_package_id and bp.status = 'open'
      )
    )
  );

-- Enrich demo package scope sections when empty
update public.bid_packages
set
  scope_inclusions = coalesce(
    scope_inclusions,
    'All labor, materials, equipment, and supervision required to complete the described scope. Coordination with adjacent trades. As-built documentation and punch-list completion.'
  ),
  scope_exclusions = coalesce(
    scope_exclusions,
    'Owner-furnished equipment unless noted. Design services beyond shop drawings. Work outside the stated floors/areas. Hazardous material abatement.'
  ),
  work_quantities = coalesce(
    work_quantities,
    'See drawings and specifications for takeoff quantities. Bidder is responsible for field verification of dimensions prior to fabrication.'
  )
where scope_inclusions is null
   or scope_exclusions is null
   or work_quantities is null;
