-- Allow GC staff to record bids and attach reviews/ratings on each bid

alter table public.bids
  alter column user_id drop not null;

alter table public.bids
  add column if not exists gc_rating numeric(2,1)
    check (gc_rating is null or (gc_rating >= 1 and gc_rating <= 5)),
  add column if not exists gc_review text;

comment on column public.bids.gc_rating is
  'Internal GC star rating (1.0–5.0) for this bid / vendor performance.';
comment on column public.bids.gc_review is
  'Internal GC review notes for this bid / vendor.';

-- Managers can insert bids (e.g. phone/email quotes); user_id may be null
drop policy if exists "bids_insert" on public.bids;
create policy "bids_insert"
  on public.bids for insert to authenticated
  with check (
    (
      public.get_user_role() in ('admin', 'owner', 'project_manager')
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
