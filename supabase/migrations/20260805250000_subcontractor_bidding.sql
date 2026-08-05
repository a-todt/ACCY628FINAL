-- Subcontractor bidding: bid packages with rich project detail, bids, and 8 licensed demo subs.

-- ---------------------------------------------------------------------------
-- 1. Tables
-- ---------------------------------------------------------------------------
create table if not exists public.bid_packages (
  id uuid primary key default gen_random_uuid(),
  contract_id uuid not null references public.contracts (id) on delete cascade,
  title text not null,
  trade text not null,
  status text not null default 'open'
    check (status in ('draft', 'open', 'closed', 'awarded')),
  -- Denormalized project facts so bidding subcontractors can see detail
  -- even when they do not yet have contract access.
  project_name text not null,
  project_address text,
  project_city text,
  project_state text,
  client_name text,
  contract_type text,
  project_start_date date,
  project_end_date date,
  estimated_package_value numeric(14, 2),
  scope_of_work text,
  technical_specifications text,
  materials_provided_by_gc text,
  materials_by_subcontractor text,
  site_conditions text,
  working_hours text,
  safety_requirements text,
  insurance_requirements text,
  bonding_requirements text,
  permit_notes text,
  schedule_milestones text,
  bid_instructions text,
  submission_requirements text,
  prebid_meeting_at timestamptz,
  questions_due_at date,
  bids_due_at date,
  contact_name text,
  contact_email text,
  contact_phone text,
  created_by uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_bid_packages_contract on public.bid_packages (contract_id);
create index if not exists idx_bid_packages_status on public.bid_packages (status);
create index if not exists idx_bid_packages_trade on public.bid_packages (trade);

create table if not exists public.bids (
  id uuid primary key default gen_random_uuid(),
  bid_package_id uuid not null references public.bid_packages (id) on delete cascade,
  user_id uuid not null references auth.users (id) on delete cascade,
  company_name text not null,
  amount numeric(14, 2) not null check (amount >= 0),
  days_to_complete integer check (days_to_complete is null or days_to_complete > 0),
  proposal_notes text,
  exclusions text,
  license_number text,
  license_state text,
  license_expiration date,
  status text not null default 'submitted'
    check (status in ('submitted', 'withdrawn', 'accepted', 'rejected')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (bid_package_id, user_id)
);

create index if not exists idx_bids_package on public.bids (bid_package_id);
create index if not exists idx_bids_user on public.bids (user_id);

alter table public.bid_packages enable row level security;
alter table public.bids enable row level security;

-- ---------------------------------------------------------------------------
-- 2. RLS
-- ---------------------------------------------------------------------------
drop policy if exists "bid_packages_select" on public.bid_packages;
create policy "bid_packages_select"
  on public.bid_packages for select to authenticated
  using (
    public.get_user_role() in ('admin', 'owner', 'project_manager', 'field_supervisor')
    or (
      public.get_user_role() = 'subcontractor'
      and status in ('open', 'closed', 'awarded')
    )
  );

drop policy if exists "bid_packages_insert" on public.bid_packages;
create policy "bid_packages_insert"
  on public.bid_packages for insert to authenticated
  with check (public.get_user_role() in ('admin', 'owner', 'project_manager'));

drop policy if exists "bid_packages_update" on public.bid_packages;
create policy "bid_packages_update"
  on public.bid_packages for update to authenticated
  using (public.get_user_role() in ('admin', 'owner', 'project_manager'))
  with check (public.get_user_role() in ('admin', 'owner', 'project_manager'));

drop policy if exists "bid_packages_delete" on public.bid_packages;
create policy "bid_packages_delete"
  on public.bid_packages for delete to authenticated
  using (public.get_user_role() in ('admin', 'owner', 'project_manager'));

drop policy if exists "bids_select" on public.bids;
create policy "bids_select"
  on public.bids for select to authenticated
  using (
    public.get_user_role() in ('admin', 'owner', 'project_manager')
    or user_id = auth.uid()
  );

drop policy if exists "bids_insert" on public.bids;
create policy "bids_insert"
  on public.bids for insert to authenticated
  with check (
    public.get_user_role() = 'subcontractor'
    and user_id = auth.uid()
    and exists (
      select 1 from public.bid_packages bp
      where bp.id = bid_package_id and bp.status = 'open'
    )
  );

drop policy if exists "bids_update" on public.bids;
create policy "bids_update"
  on public.bids for update to authenticated
  using (
    public.get_user_role() in ('admin', 'owner', 'project_manager')
    or (
      public.get_user_role() = 'subcontractor'
      and user_id = auth.uid()
    )
  )
  with check (
    public.get_user_role() in ('admin', 'owner', 'project_manager')
    or (
      public.get_user_role() = 'subcontractor'
      and user_id = auth.uid()
    )
  );

drop policy if exists "bids_delete" on public.bids;
create policy "bids_delete"
  on public.bids for delete to authenticated
  using (
    public.get_user_role() in ('admin', 'owner', 'project_manager')
    or (user_id = auth.uid() and status = 'submitted')
  );

grant select, insert, update, delete on public.bid_packages to authenticated;
grant select, insert, update, delete on public.bids to authenticated;

do $$ begin
  alter table public.bids
    add constraint bids_user_profiles_fkey
    foreign key (user_id) references public.user_profiles (id) on delete cascade;
exception when duplicate_object then null;
end $$;

-- ---------------------------------------------------------------------------
-- 3. Seed 8 licensed subcontractors (engagements on active jobs)
-- ---------------------------------------------------------------------------
insert into public.subcontractors (
  contract_id, company_name, contact_name, contact_email, contact_phone, trade,
  subcontract_value, amount_paid, retainage_percent, start_date, end_date, status,
  scope_of_work, license_number, license_state, license_expiration
)
select v.contract_id, v.company_name, v.contact_name, v.contact_email, v.contact_phone, v.trade,
  v.subcontract_value, v.amount_paid, v.retainage_percent, v.start_date, v.end_date, v.status,
  v.scope_of_work, v.license_number, v.license_state, v.license_expiration
from (values
  ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaa1'::uuid, 'Midwest Steel Erectors', 'Dana Holt', 'dana@midweststeel.demo', '312-555-2101', 'Structural Steel',
   210000.00, 40000.00, 10.0, (current_date - 40), (current_date + 90), 'active',
   'Structural steel erection for floors 12-15 including connection hardware.',
   'IL-STEEL-44102', 'IL', (current_date + 280)),
  ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaa1'::uuid, 'ClearView Fire Protection', 'Jamie Ortiz', 'jamie@clearviewfp.demo', '312-555-2102', 'Fire Protection',
   125000.00, 25000.00, 10.0, (current_date - 30), (current_date + 70), 'active',
   'Wet sprinkler system redesign and install for renovated office floors.',
   'IL-FIRE-88211', 'IL', (current_date + 400)),
  ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaa2'::uuid, 'MedSpec Millwork Inc', 'Priya Shah', 'priya@medspec.demo', '217-555-2103', 'Millwork',
   98000.00, 10000.00, 5.0, (current_date - 20), (current_date + 110), 'active',
   'Custom nurse station and exam room casework for outpatient wing.',
   'IL-MILL-33019', 'IL', (current_date + 500)),
  ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaa2'::uuid, 'ShieldTech Low Voltage', 'Chris Ng', 'chris@shieldtech.demo', '217-555-2104', 'Low Voltage',
   156000.00, 52000.00, 5.0, (current_date - 60), (current_date + 80), 'active',
   'Access control, nurse call, and structured cabling for imaging suite.',
   'IL-LV-77104', 'IL', (current_date + 220)),
  ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaa4'::uuid, 'Prairie Masonry Group', 'Alex Rivera', 'alex@prairiemasonry.demo', '773-555-2105', 'Masonry',
   88000.00, 0.00, 10.0, (current_date - 10), (current_date + 120), 'active',
   'CMU demising walls and brick veneer accents at retail plaza storefronts.',
   'IL-MAS-55901', 'IL', (current_date + 340)),
  ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaa6'::uuid, 'LakeShore Elevator Co', 'Morgan Blake', 'morgan@lakeshoreelev.demo', '312-555-2106', 'Elevator',
   240000.00, 80000.00, 10.0, (current_date - 90), (current_date + 50), 'active',
   'Modernization of two passenger elevators and lobby finishes coordination.',
   'IL-ELEV-12088', 'IL', (current_date + 190)),
  ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaa7'::uuid, 'GreenLine Flooring Systems', 'Taylor Brooks', 'taylor@greenlinefloor.demo', '630-555-2107', 'Flooring',
   72000.00, 18000.00, 5.0, (current_date - 25), (current_date + 40), 'active',
   'VCT and rubber flooring for classroom wing corridors and specialty rooms.',
   'IL-FLR-66440', 'IL', (current_date + 450)),
  ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaa7'::uuid, 'NorthStar Acoustics', 'Riley Chen', 'riley@northstaracoustics.demo', '630-555-2108', 'Acoustical',
   54000.00, 12000.00, 5.0, (current_date - 15), (current_date + 35), 'active',
   'Acoustical ceiling grid, panels, and sound attenuation in classrooms.',
   'IL-ACO-90821', 'IL', (current_date + 310))
) as v(
  contract_id, company_name, contact_name, contact_email, contact_phone, trade,
  subcontract_value, amount_paid, retainage_percent, start_date, end_date, status,
  scope_of_work, license_number, license_state, license_expiration
)
where exists (select 1 from public.contracts c where c.id = v.contract_id)
  and not exists (
    select 1 from public.subcontractors s
    where s.company_name = v.company_name and s.contract_id = v.contract_id
  );

-- Backfill licenses on a few existing rows missing them
update public.subcontractors
set
  license_number = coalesce(license_number, 'IL-GEN-' || substr(replace(id::text, '-', ''), 1, 6)),
  license_state = coalesce(license_state, 'IL'),
  license_expiration = coalesce(license_expiration, current_date + 365)
where license_number is null;

-- ---------------------------------------------------------------------------
-- 4. Seed detailed open bid packages
-- ---------------------------------------------------------------------------
insert into public.bid_packages (
  id, contract_id, title, trade, status,
  project_name, project_address, project_city, project_state, client_name, contract_type,
  project_start_date, project_end_date, estimated_package_value,
  scope_of_work, technical_specifications, materials_provided_by_gc, materials_by_subcontractor,
  site_conditions, working_hours, safety_requirements, insurance_requirements, bonding_requirements,
  permit_notes, schedule_milestones, bid_instructions, submission_requirements,
  prebid_meeting_at, questions_due_at, bids_due_at,
  contact_name, contact_email, contact_phone
)
select
  v.id, v.contract_id, v.title, v.trade, 'open',
  c.contract_name, c.project_address, c.city, c.state, c.client_name, c.contract_type::text,
  c.start_date, c.end_date, v.estimated_package_value,
  v.scope_of_work, v.technical_specifications, v.materials_provided_by_gc, v.materials_by_subcontractor,
  v.site_conditions, v.working_hours, v.safety_requirements, v.insurance_requirements, v.bonding_requirements,
  v.permit_notes, v.schedule_milestones, v.bid_instructions, v.submission_requirements,
  v.prebid_meeting_at, v.questions_due_at, v.bids_due_at,
  v.contact_name, v.contact_email, v.contact_phone
from (values
  (
    'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbb101'::uuid,
    'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaa1'::uuid,
    'Electrical Fit-Out Package — Floors 16-18',
    'Electrical',
    185000.00,
    $scope1$Provide complete electrical rough-in and finish for floors 16-18 including temporary power, panel boards, lighting controls, and emergency circuits. Coordinate with HVAC and low-voltage trades. Include as-built documentation and testing reports.$scope1$,
    $tech1$Follow Division 26 specifications. LED lighting per basis-of-design Lutron Vive. Panels: Square D or equal. Conduit: EMT above ceilings, MC cable where allowed. Provide arc-flash labels and coordination study summary.$tech1$,
    'Owner-furnished lighting fixtures staged in loading dock. GC provides temporary power to floor panels.',
    'All branch circuit conductors, devices, covers, supports, and specialty boxes. Firestopping materials.',
    'Occupied building. Freight elevator shared with other trades 7am-3pm. Dust partitions required at stair cores.',
    'Weekdays 7:00am–3:30pm; limited night work only with 72-hour notice.',
    'OSHA 30 for foreman; daily stretch-and-flex; hot-work permits for any soldering.',
    'GL $2M occ / $4M agg; Auto $1M; Workers Comp statutory; Umbrella $5M; Additional Insured + Waiver of Subrogation naming GC and Owner.',
    'Payment & performance bond 100% of subcontract value if bid exceeds $150,000.',
    'City of Chicago electrical permit by subcontractor; GC coordinates building permit revisions.',
    'Mobilization within 10 days of award. Rough-in complete by day 45. Trim/punch by day 75.',
    'Submit lump-sum bid with unit rates for added devices. Alternate: lighting control upgrade package.',
    'Signed bid form, license copy, insurance certificate, 3 project references, proposed crew size and schedule.',
    (now() + interval '5 days')::timestamptz,
    (current_date + 8),
    (current_date + 14),
    'Demo Project Manager',
    'pm@gcmanager.demo',
    '312-555-0199'
  ),
  (
    'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbb102'::uuid,
    'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaa2'::uuid,
    'Medical Gas & HVAC Specialty Package',
    'HVAC',
    320000.00,
    $scope2$Install medical gas outlets, vacuum, and HVAC terminal units for the imaging suite and adjacent prep rooms. Include balancing, commissioning support, and infection-control barriers during install.$scope2$,
    $tech2$ASHRAE 170 compliant. Copper medical gas tubing per NFPA 99. AHUs already set — this package covers VAV boxes, reheat coils, duct cleaning, and final connections. Provide startup checklists.$tech2$,
    'Major AHU equipment and roof curbs already installed by prior package.',
    'VAV boxes, duct, insulation, medical gas valves/outlets, hangers, identification.',
    'Active hospital campus — infection control risk assessment (ICRA) Class IV for imaging suite work.',
    'Weekdays 6:30am–2:30pm; weekend shutdowns available for tie-ins with 10-day notice.',
    'Hospital badging required. ICRA training. No smoking campus.',
    'GL $5M; Professional Liability $2M if design-assist; Workers Comp; Pollution Liability preferred.',
    'Bond required for packages over $250,000.',
    'State medical gas installer certification required with bid.',
    'Pre-install walkthrough day 7. Rough complete day 60. Commissioning support days 70-85.',
    'Base bid + alternate for redundant vacuum pump. List lead times for long-lead valves.',
    'Bid form, licenses, certifications, manpower histogram, infection-control plan outline.',
    (now() + interval '7 days')::timestamptz,
    (current_date + 10),
    (current_date + 18),
    'Demo Project Manager',
    'pm@gcmanager.demo',
    '217-555-0199'
  ),
  (
    'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbb103'::uuid,
    'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaa4'::uuid,
    'Storefront & Exterior Glazing Package',
    'Glazing',
    142000.00,
    $scope3$Furnish and install aluminum storefront systems, entrance doors, and exterior glazing for four retail suites including caulking, flashings, and hardware.$scope3$,
    $tech3$Kawneer TriFab or equal. 1" insulated low-E glass. Hardware: Schlage or equal per hardware schedule. Meet IECC air barrier continuity.$tech3$,
    'Rough openings and waterproofing membrane by GC.',
    'Framing, glass, doors, hardware, sealants, thresholds.',
    'Street-front urban site with limited laydown. Pedestrian protection required.',
    '7:00am–4:00pm; lane closure permits by GC when crane needed.',
    'Fall protection for canopy work; public protection plan.',
    'GL $2M/$4M; Auto; WC; Umbrella $5M.',
    'No bond required under $150k unless owner requests.',
    'City right-of-way permit coordinated by GC.',
    'Shop drawings due 14 days after award. Install window 45-70 days.',
    'Lump sum by suite + unit price for added openings.',
    'Bid form, license, product data cut sheets, warranty terms.',
    (now() + interval '3 days')::timestamptz,
    (current_date + 6),
    (current_date + 12),
    'Alex Chen',
    'pm2@gcmanager.demo',
    '773-555-0199'
  ),
  (
    'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbb104'::uuid,
    'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaa7'::uuid,
    'Classroom Technology Conduit & Device Package',
    'Electrical',
    96000.00,
    $scope4$Provide classroom AV conduit pathways, device rough-ins, and final trim for interactive displays, projectors, and teacher stations across the new classroom wing.$scope4$,
    $tech4$Coordinate with Owner IT standards. Provide empty conduits with pull strings to AV closet. Device boxes per elevation drawings A-501.$tech4$,
    'Owner-furnished AV displays and racks.',
    'Conduit, boxes, mud rings, cover plates, cable supports.',
    'School campus — background checks required for all on-site workers.',
    'School hours preferred after 3:30pm during semester; full days during breaks.',
    'Background check clearance; no contact with students policy.',
    'GL $2M; Auto; WC; Additional Insured school district + GC.',
    'Not required.',
    'School district facilities badge process — allow 10 days.',
    'Rough-in during framing; trim after paint. Final test with IT week 12.',
    'Base bid all rooms; alternate for lecture hall specialty rough-in.',
    'Bid form, license, background-check attestation, schedule.',
    null,
    (current_date + 9),
    (current_date + 16),
    'Alex Chen',
    'pm2@gcmanager.demo',
    '630-555-0199'
  )
) as v(
  id, contract_id, title, trade, estimated_package_value,
  scope_of_work, technical_specifications, materials_provided_by_gc, materials_by_subcontractor,
  site_conditions, working_hours, safety_requirements, insurance_requirements, bonding_requirements,
  permit_notes, schedule_milestones, bid_instructions, submission_requirements,
  prebid_meeting_at, questions_due_at, bids_due_at,
  contact_name, contact_email, contact_phone
)
join public.contracts c on c.id = v.contract_id
where not exists (select 1 from public.bid_packages bp where bp.id = v.id);
