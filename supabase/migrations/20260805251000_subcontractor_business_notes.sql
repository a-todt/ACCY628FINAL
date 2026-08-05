-- Internal GC business notes on subcontractors + historical awarded packages.

alter table public.subcontractors
  add column if not exists business_notes text;

comment on column public.subcontractors.business_notes is
  'Internal GC notes on sub reliability, professionalism, responsiveness, and on-time performance.';
