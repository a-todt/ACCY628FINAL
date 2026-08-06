-- Owners/executives review and approve bids; they do not staff-enter quotes.
-- Subcontractors still submit their own portal bids.

drop policy if exists "bids_insert" on public.bids;
create policy "bids_insert"
  on public.bids for insert to authenticated
  with check (
    (
      public.get_user_role() = 'admin'
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
