-- Star rating for subcontractors (1.0–5.0)

alter table public.subcontractors
  add column if not exists rating numeric(2,1)
    check (rating is null or (rating >= 1 and rating <= 5));

comment on column public.subcontractors.rating is
  'Internal GC star rating 1.0–5.0 for vendor performance.';

-- Demo seed ratings (idempotent by company name)
update public.subcontractors s
set rating = v.rating
from (
  values
    ('Midwest Steel Erectors', 5.0),
    ('Solid Concrete Works', 4.5),
    ('Spark Electric Co', 4.5),
    ('ClearView Fire Protection', 4.5),
    ('GreenLine Flooring Systems', 4.5),
    ('ShieldTech Low Voltage', 4.5),
    ('Climate HVAC LLC', 4.0),
    ('LakeShore Elevator Co', 4.0),
    ('MedSpec Millwork Inc', 4.0),
    ('NorthStar Acoustics', 4.0),
    ('Retail Glazing Pros', 4.0),
    ('School Safe Electric', 4.0),
    ('Flow Plumbing Inc', 3.5),
    ('FrameRight Carpentry', 3.5),
    ('Prairie Masonry Group', 3.5),
    ('Naperville HVAC', 3.0),
    ('Paused Piping Co', 2.5),
    ('Overpaid Demo Sub', 2.0)
) as v(company_name, rating)
where s.company_name = v.company_name
  and (s.rating is distinct from v.rating);
