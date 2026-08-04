-- ============================================================================
-- GC Contract Manager - Demo Seed Data
-- ============================================================================
-- Creates 5 demo logins (all password: Demo123!) and a realistic set of
-- contracts, change orders, subcontractors, cost entries, invoices,
-- payments, field logs, and milestones.
--
-- Demo logins:
--   admin@gcmanager.demo  - admin              (11111111-1111-1111-1111-111111111111)
--   pm@gcmanager.demo     - project_manager    (22222222-2222-2222-2222-222222222222)
--   client@gcmanager.demo - client             (33333333-3333-3333-3333-333333333333)
--   field@gcmanager.demo  - field_supervisor   (44444444-4444-4444-4444-444444444444)
--   sub@gcmanager.demo    - subcontractor      (55555555-5555-5555-5555-555555555555)
--
-- This file is safe to re-run: auth users / profiles are upserted, and the
-- 8 demo contracts (fixed ids) are deleted and recreated, which cascades to
-- remove all their change orders, subcontractors, cost entries, invoices,
-- payments, field logs, milestones, and assignments before reinserting.
-- ============================================================================

create extension if not exists pgcrypto;

-- ----------------------------------------------------------------------------
-- 1. Demo auth users
-- ----------------------------------------------------------------------------
insert into auth.users (
  instance_id, id, aud, role, email, encrypted_password,
  email_confirmed_at, raw_app_meta_data, raw_user_meta_data,
  created_at, updated_at, confirmation_token, recovery_token,
  email_change_token_new, email_change, is_sso_user, is_anonymous
)
values
  ('00000000-0000-0000-0000-000000000000', '11111111-1111-1111-1111-111111111111', 'authenticated', 'authenticated',
   'admin@gcmanager.demo', crypt('Demo123!', gen_salt('bf')), now(),
   '{"provider":"email","providers":["email"]}', '{"full_name":"Demo Admin"}',
   now(), now(), '', '', '', '', false, false),

  ('00000000-0000-0000-0000-000000000000', '22222222-2222-2222-2222-222222222222', 'authenticated', 'authenticated',
   'pm@gcmanager.demo', crypt('Demo123!', gen_salt('bf')), now(),
   '{"provider":"email","providers":["email"]}', '{"full_name":"Demo Project Manager"}',
   now(), now(), '', '', '', '', false, false),

  ('00000000-0000-0000-0000-000000000000', '33333333-3333-3333-3333-333333333333', 'authenticated', 'authenticated',
   'client@gcmanager.demo', crypt('Demo123!', gen_salt('bf')), now(),
   '{"provider":"email","providers":["email"]}', '{"full_name":"Demo Client"}',
   now(), now(), '', '', '', '', false, false),

  ('00000000-0000-0000-0000-000000000000', '44444444-4444-4444-4444-444444444444', 'authenticated', 'authenticated',
   'field@gcmanager.demo', crypt('Demo123!', gen_salt('bf')), now(),
   '{"provider":"email","providers":["email"]}', '{"full_name":"Demo Field Supervisor"}',
   now(), now(), '', '', '', '', false, false),

  ('00000000-0000-0000-0000-000000000000', '55555555-5555-5555-5555-555555555555', 'authenticated', 'authenticated',
   'sub@gcmanager.demo', crypt('Demo123!', gen_salt('bf')), now(),
   '{"provider":"email","providers":["email"]}', '{"full_name":"Demo Subcontractor"}',
   now(), now(), '', '', '', '', false, false)
on conflict (id) do nothing;

insert into auth.identities (
  id, user_id, identity_data, provider, provider_id, last_sign_in_at, created_at, updated_at
)
values
  (gen_random_uuid(), '11111111-1111-1111-1111-111111111111',
   jsonb_build_object('sub', '11111111-1111-1111-1111-111111111111', 'email', 'admin@gcmanager.demo'),
   'email', '11111111-1111-1111-1111-111111111111', now(), now(), now()),

  (gen_random_uuid(), '22222222-2222-2222-2222-222222222222',
   jsonb_build_object('sub', '22222222-2222-2222-2222-222222222222', 'email', 'pm@gcmanager.demo'),
   'email', '22222222-2222-2222-2222-222222222222', now(), now(), now()),

  (gen_random_uuid(), '33333333-3333-3333-3333-333333333333',
   jsonb_build_object('sub', '33333333-3333-3333-3333-333333333333', 'email', 'client@gcmanager.demo'),
   'email', '33333333-3333-3333-3333-333333333333', now(), now(), now()),

  (gen_random_uuid(), '44444444-4444-4444-4444-444444444444',
   jsonb_build_object('sub', '44444444-4444-4444-4444-444444444444', 'email', 'field@gcmanager.demo'),
   'email', '44444444-4444-4444-4444-444444444444', now(), now(), now()),

  (gen_random_uuid(), '55555555-5555-5555-5555-555555555555',
   jsonb_build_object('sub', '55555555-5555-5555-5555-555555555555', 'email', 'sub@gcmanager.demo'),
   'email', '55555555-5555-5555-5555-555555555555', now(), now(), now())
on conflict (provider, provider_id) do nothing;

-- The on_auth_user_created trigger (see migration) already created a
-- user_profiles row with role = field_supervisor for each user above; fix
-- up roles / names here so this file is idempotent regardless of trigger state.
insert into public.user_profiles (id, email, full_name, role)
values
  ('11111111-1111-1111-1111-111111111111', 'admin@gcmanager.demo', 'Demo Admin', 'admin'),
  ('22222222-2222-2222-2222-222222222222', 'pm@gcmanager.demo', 'Demo Project Manager', 'project_manager'),
  ('33333333-3333-3333-3333-333333333333', 'client@gcmanager.demo', 'Demo Client', 'client'),
  ('44444444-4444-4444-4444-444444444444', 'field@gcmanager.demo', 'Demo Field Supervisor', 'field_supervisor'),
  ('55555555-5555-5555-5555-555555555555', 'sub@gcmanager.demo', 'Demo Subcontractor', 'subcontractor')
on conflict (id) do update
  set email = excluded.email,
      full_name = excluded.full_name,
      role = excluded.role;

-- ----------------------------------------------------------------------------
-- 2. Clean slate for demo business data (cascades to all child tables)
-- ----------------------------------------------------------------------------
delete from public.contracts
where id in (
  'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaa1',
  'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaa2',
  'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaa3',
  'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaa4',
  'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaa5',
  'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaa6',
  'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaa7',
  'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaa8'
);

-- ----------------------------------------------------------------------------
-- 3. Contracts (8)
-- ----------------------------------------------------------------------------
-- a1 Downtown Office Tower Renovation   - active,    fixed_price      - linked client login
-- a2 Riverside Medical Center Expansion - active,    cost_plus        - linked client login
-- a3 Lakeside Apartments Phase 2        - completed, fixed_price      - linked client login, multiple approved COs
-- a4 Westside Retail Plaza              - active,    time_and_materials
-- a5 Northgate Warehouse Build-Out      - on_hold,   fixed_price
-- a6 Harbor View Condominiums           - active,    fixed_price      - UNPROFITABLE (costs > value)
-- a7 Cedar Grove Elementary Addition    - active,    cost_plus        - nearing end date, unpaid balance
-- a8 Metro Parking Structure            - canceled,  fixed_price
insert into public.contracts (
  id, user_id, contract_name, client_name, client_email, client_phone,
  project_address, city, state, contract_type, original_value, retainage_percent,
  start_date, end_date, status, scope_description, special_terms, client_user_id, created_at
)
values
  ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaa1', '22222222-2222-2222-2222-222222222222',
   'Downtown Office Tower Renovation', 'Meridian Holdings LLC', 'client@gcmanager.demo', '312-555-0101',
   '400 W Wacker Dr', 'Chicago', 'IL', 'fixed_price', 850000.00, 10,
   (current_date - interval '150 days')::date, (current_date + interval '60 days')::date, 'active',
   'Full interior renovation of floors 12-18 including MEP upgrades, new curtain wall sections, and lobby remodel.',
   'Liquidated damages of $1,500/day beyond substantial completion. Client supplies finish allowances separately.',
   '33333333-3333-3333-3333-333333333333', now() - interval '150 days'),

  ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaa2', '22222222-2222-2222-2222-222222222222',
   'Riverside Medical Center Expansion', 'Riverside Health Partners', 'client@gcmanager.demo', '217-555-0177',
   '1200 Riverside Pkwy', 'Springfield', 'IL', 'cost_plus', 1250000.00, 5,
   (current_date - interval '200 days')::date, (current_date + interval '120 days')::date, 'active',
   'New 2-story outpatient wing addition with imaging suite and shell/core buildout for future tenant.',
   'Cost-plus 12% fee. Monthly open-book cost reporting required per contract.',
   '33333333-3333-3333-3333-333333333333', now() - interval '200 days'),

  ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaa3', '22222222-2222-2222-2222-222222222222',
   'Lakeside Apartments Phase 2', 'Lakeside Development Group', 'client@gcmanager.demo', '630-555-0142',
   '88 Lakeside Dr', 'Naperville', 'IL', 'fixed_price', 640000.00, 10,
   (current_date - interval '365 days')::date, (current_date - interval '30 days')::date, 'completed',
   'Construction of 24-unit apartment building, phase 2 of a 3-phase master development.',
   'Retainage released upon final punch-list sign-off and certificate of occupancy.',
   '33333333-3333-3333-3333-333333333333', now() - interval '365 days'),

  ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaa4', '22222222-2222-2222-2222-222222222222',
   'Westside Retail Plaza', 'Westside Retail Partners LLC', 'facilities@westsideretail.com', '630-555-0199',
   '2200 Ogden Ave', 'Aurora', 'IL', 'time_and_materials', 425000.00, 10,
   (current_date - interval '90 days')::date, (current_date + interval '90 days')::date, 'active',
   'Tenant improvement build-out of 4 retail suites plus shared common-area upgrades.',
   'Billed T&M monthly with GC markup of 15% on labor and 10% on materials.',
   null, now() - interval '90 days'),

  ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaa5', '22222222-2222-2222-2222-222222222222',
   'Northgate Warehouse Build-Out', 'Northgate Logistics Inc', 'ops@northgatelogistics.com', '815-555-0163',
   '5500 Northgate Rd', 'Rockford', 'IL', 'fixed_price', 980000.00, 10,
   (current_date - interval '45 days')::date, (current_date + interval '150 days')::date, 'on_hold',
   'New 60,000 sq ft distribution warehouse with racking infrastructure and dock upgrades.',
   'Project placed on hold pending client financing confirmation; remobilization TBD.',
   null, now() - interval '45 days'),

  ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaa6', '22222222-2222-2222-2222-222222222222',
   'Harbor View Condominiums', 'Harbor View Condo Association', 'board@harborviewcondos.org', '847-555-0128',
   '77 Harbor View Ln', 'Evanston', 'IL', 'fixed_price', 720000.00, 10,
   (current_date - interval '220 days')::date, (current_date + interval '20 days')::date, 'active',
   'Exterior envelope restoration and balcony waterproofing across 3 condominium towers.',
   'Fixed price bid; unforeseen structural remediation has driven costs above original scope.',
   null, now() - interval '220 days'),

  ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaa7', '22222222-2222-2222-2222-222222222222',
   'Cedar Grove Elementary Addition', 'Cedar Grove School District 47', 'purchasing@cgsd47.org', '847-555-0155',
   '900 Cedar Grove Rd', 'Elgin', 'IL', 'cost_plus', 1100000.00, 5,
   (current_date - interval '300 days')::date, (current_date + interval '12 days')::date, 'active',
   'New 6-classroom addition with ADA-compliant ramp and connector corridor to main building.',
   'Cost-plus 10% fee. Substantial completion required before start of fall semester.',
   null, now() - interval '300 days'),

  ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaa8', '22222222-2222-2222-2222-222222222222',
   'Metro Parking Structure', 'Metro Transit Authority', 'contracts@metrotransit.gov', '312-555-0187',
   '150 Transit Plaza', 'Joliet', 'IL', 'fixed_price', 300000.00, 10,
   (current_date - interval '400 days')::date, (current_date - interval '200 days')::date, 'canceled',
   'Precast parking structure repair and restriping for downtown transit hub, levels 2-4.',
   'Contract canceled by owner after funding was reallocated; final closeout invoice outstanding.',
   null, now() - interval '400 days')
on conflict (id) do nothing;

-- ----------------------------------------------------------------------------
-- 4. Contract assignments - field supervisor on several active contracts
-- ----------------------------------------------------------------------------
insert into public.contract_assignments (contract_id, user_id)
values
  ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaa1', '44444444-4444-4444-4444-444444444444'),
  ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaa2', '44444444-4444-4444-4444-444444444444'),
  ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaa4', '44444444-4444-4444-4444-444444444444'),
  ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaa6', '44444444-4444-4444-4444-444444444444'),
  ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaa7', '44444444-4444-4444-4444-444444444444')
on conflict (contract_id, user_id) do nothing;

-- ----------------------------------------------------------------------------
-- 5. Subcontractors (10) - demo subcontractor login linked to "Apex Electrical LLC"
--    across 3 contracts; row #9 is an overpayment scenario (amount_paid > value).
-- ----------------------------------------------------------------------------
insert into public.subcontractors (
  contract_id, company_name, contact_name, contact_email, contact_phone, trade,
  subcontract_value, amount_paid, retainage_percent, start_date, end_date, status,
  scope_of_work, user_id
)
values
  ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaa1', 'Apex Electrical LLC', 'Marco Diaz', 'marco@apexelectrical.demo', '312-555-0210',
   'Electrical', 95000.00, 95000.00, 10, (current_date - interval '140 days')::date, (current_date - interval '20 days')::date,
   'complete', 'Full electrical rough-in and finish for floors 12-18.', '55555555-5555-5555-5555-555555555555'),

  ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaa1', 'Summit Plumbing Co', 'Rachel Kim', 'rachel@summitplumbing.demo', '312-555-0219',
   'Plumbing', 78000.00, 60000.00, 10, (current_date - interval '130 days')::date, (current_date + interval '10 days')::date,
   'active', 'Restroom core relocation and domestic water riser upgrades.', null),

  ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaa2', 'Apex Electrical LLC', 'Marco Diaz', 'marco@apexelectrical.demo', '312-555-0210',
   'Electrical', 145000.00, 100000.00, 5, (current_date - interval '180 days')::date, (current_date + interval '30 days')::date,
   'active', 'Imaging suite shielding electrical and emergency power tie-ins.', '55555555-5555-5555-5555-555555555555'),

  ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaa2', 'BlueSky Mechanical HVAC', 'Tom Reyes', 'tom@blueskymech.demo', '217-555-0233',
   'HVAC', 210000.00, 180000.00, 5, (current_date - interval '170 days')::date, (current_date + interval '40 days')::date,
   'active', 'Air handling units, ductwork, and controls for new outpatient wing.', null),

  ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaa3', 'Apex Electrical LLC', 'Marco Diaz', 'marco@apexelectrical.demo', '312-555-0210',
   'Electrical', 68000.00, 68000.00, 10, (current_date - interval '350 days')::date, (current_date - interval '60 days')::date,
   'complete', 'Unit electrical rough-in and panel installs for 24-unit building.', '55555555-5555-5555-5555-555555555555'),

  ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaa3', 'Granite Concrete Works', 'Nina Alvarez', 'nina@graniteconcrete.demo', '630-555-0244',
   'Concrete', 92000.00, 92000.00, 10, (current_date - interval '360 days')::date, (current_date - interval '80 days')::date,
   'complete', 'Foundation, slab-on-grade, and balcony concrete work.', null),

  ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaa4', 'Precision Framing Inc', 'Deacon Wells', 'deacon@precisionframing.demo', '630-555-0256',
   'Framing', 110000.00, 70000.00, 10, (current_date - interval '85 days')::date, (current_date + interval '30 days')::date,
   'active', 'Metal stud framing and drywall substrate for 4 retail suites.', null),

  ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaa5', 'TopLine Roofing Co', 'Sam Patterson', 'sam@toplineroofing.demo', '815-555-0267',
   'Roofing', 130000.00, 40000.00, 10, (current_date - interval '40 days')::date, (current_date + interval '60 days')::date,
   'active', 'TPO roof membrane replacement and dock canopy structures.', null),

  ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaa6', 'Coastal Drywall & Paint', 'Elena Cho', 'elena@coastaldp.demo', '847-555-0278',
   'Drywall/Paint', 85000.00, 92000.00, 10, (current_date - interval '200 days')::date, (current_date + interval '5 days')::date,
   'active', 'Interior corridor drywall repair and full exterior painting, all 3 towers.', null),

  ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaa7', 'Reliable Landscaping LLC', 'Owen Park', 'owen@reliablelandscaping.demo', '847-555-0289',
   'Landscaping', 45000.00, 20000.00, 5, (current_date - interval '60 days')::date, (current_date + interval '30 days')::date,
   'active', 'Site restoration, sod, and plantings around new classroom addition.', null);

-- ----------------------------------------------------------------------------
-- 6. Change orders (15) - mix of pending / approved / rejected
--    a3 has 3 approved COs that increase the effective contract value.
-- ----------------------------------------------------------------------------
insert into public.change_orders (
  contract_id, change_order_number, description, reason, amount, status,
  date_submitted, date_resolved, notes
)
values
  ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaa1', 'CO-1001', 'Additional electrical panel upgrade, floor 15', 'Existing panel capacity insufficient for new tenant load.',
   25000.00, 'approved', (current_date - interval '60 days')::date, (current_date - interval '50 days')::date, 'Approved by client PM via email.'),
  ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaa1', 'CO-1002', 'Add glass partition walls, floor 16 conference suite', 'Client requested design change after walkthrough.',
   10000.00, 'pending', (current_date - interval '10 days')::date, null, 'Awaiting client sign-off.'),
  ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaa1', 'CO-1014', 'Upgrade lobby flooring to premium marble', 'Client-requested finish upgrade.',
   5000.00, 'rejected', (current_date - interval '80 days')::date, (current_date - interval '70 days')::date, 'Rejected; over allowance budget, client opted to keep standard finish.'),

  ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaa2', 'CO-1003', 'Expand MRI suite shielding and electrical capacity', 'Equipment vendor spec changed after design was finalized.',
   60000.00, 'approved', (current_date - interval '90 days')::date, (current_date - interval '80 days')::date, 'Approved; billed cost-plus per contract terms.'),
  ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaa2', 'CO-1004', 'Add rooftop generator enclosure', 'Owner-requested scope addition.',
   15000.00, 'rejected', (current_date - interval '40 days')::date, (current_date - interval '30 days')::date, 'Owner deferred to future phase.'),
  ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaa2', 'CO-1015', 'Additional nurse call system wiring', 'Added device count requested by clinical staff.',
   9000.00, 'pending', (current_date - interval '5 days')::date, null, 'Under review by facilities director.'),

  ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaa3', 'CO-1005', 'Add balconies to units 201-210', 'Client requested added amenity mid-construction.',
   45000.00, 'approved', (current_date - interval '300 days')::date, (current_date - interval '290 days')::date, 'Approved and incorporated into final invoice.'),
  ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaa3', 'CO-1006', 'Upgrade unit finishes package B', 'Client upgraded finish selections after model unit walkthrough.',
   30000.00, 'approved', (current_date - interval '250 days')::date, (current_date - interval '240 days')::date, 'Approved and incorporated into final invoice.'),
  ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaa3', 'CO-1007', 'Add covered parking canopy', 'Owner requested added amenity for phase 2 marketing.',
   18000.00, 'approved', (current_date - interval '200 days')::date, (current_date - interval '190 days')::date, 'Approved; final value now exceeds original contract value.'),

  ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaa4', 'CO-1008', 'Add exterior signage package', 'New tenant requested additional monument signage.',
   8000.00, 'pending', (current_date - interval '8 days')::date, null, 'Pending tenant landlord approval.'),

  ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaa5', 'CO-1009', 'Add mezzanine storage level', 'Client explored added storage capacity during hold.',
   20000.00, 'rejected', (current_date - interval '25 days')::date, (current_date - interval '15 days')::date, 'Rejected pending remobilization decision.'),

  ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaa6', 'CO-1010', 'Balcony waterproofing remediation, towers B and C', 'Unforeseen structural deterioration discovered during demo.',
   35000.00, 'approved', (current_date - interval '100 days')::date, (current_date - interval '90 days')::date, 'Approved; major driver of cost overrun on this contract.'),
  ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaa6', 'CO-1011', 'Upgrade to corrosion-resistant HVAC condenser units', 'Coastal exposure required upgraded equipment spec.',
   18000.00, 'pending', (current_date - interval '15 days')::date, null, 'Awaiting condo board vote.'),

  ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaa7', 'CO-1012', 'ADA ramp reconfiguration', 'Site survey revealed grade issue not in original design.',
   22000.00, 'approved', (current_date - interval '60 days')::date, (current_date - interval '50 days')::date, 'Approved; required for occupancy permit.'),

  ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaa8', 'CO-1013', 'Add security booth at level 2 entrance', 'Owner requested added security presence.',
   10000.00, 'rejected', (current_date - interval '350 days')::date, (current_date - interval '340 days')::date, 'Rejected prior to contract cancellation.');

-- ----------------------------------------------------------------------------
-- 7. Cost entries (30) - a6 intentionally exceeds its contract value.
-- ----------------------------------------------------------------------------
insert into public.cost_entries (contract_id, category, description, amount, date_incurred, notes)
values
  -- a1 (value 850,000)
  ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaa1', 'labor', 'Framing and drywall crew, floors 12-14', 84000.00, (current_date - interval '100 days')::date, null),
  ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaa1', 'materials', 'Curtain wall glazing units and hardware', 112000.00, (current_date - interval '80 days')::date, null),
  ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaa1', 'subcontractor', 'Apex Electrical LLC - progress billing', 95000.00, (current_date - interval '60 days')::date, 'Matches subcontractor payment.'),
  ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaa1', 'equipment', 'Scissor lift and scaffolding rental', 18000.00, (current_date - interval '40 days')::date, null),

  -- a2 (value 1,250,000)
  ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaa2', 'labor', 'MEP coordination and general labor', 130000.00, (current_date - interval '160 days')::date, null),
  ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaa2', 'materials', 'Structural steel and imaging suite shielding materials', 165000.00, (current_date - interval '130 days')::date, null),
  ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaa2', 'subcontractor', 'BlueSky Mechanical HVAC - progress billing', 145000.00, (current_date - interval '90 days')::date, null),
  ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaa2', 'permits', 'Building and mechanical permit fees', 22000.00, (current_date - interval '190 days')::date, null),

  -- a3 (value 640,000, completed)
  ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaa3', 'labor', 'General labor, all trades, full project', 95000.00, (current_date - interval '320 days')::date, null),
  ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaa3', 'materials', 'Lumber, roofing, and finish materials', 140000.00, (current_date - interval '280 days')::date, null),
  ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaa3', 'subcontractor', 'Concrete and electrical subcontractor billings', 160000.00, (current_date - interval '150 days')::date, 'Combined Apex Electrical + Granite Concrete billings.'),
  ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaa3', 'other', 'Final punch-list and cleanup costs', 25000.00, (current_date - interval '35 days')::date, null),

  -- a4 (value 425,000, time_and_materials)
  ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaa4', 'labor', 'Carpentry crew, retail suite build-out', 40000.00, (current_date - interval '70 days')::date, null),
  ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaa4', 'materials', 'Drywall, ceiling grid, and storefront materials', 55000.00, (current_date - interval '55 days')::date, null),
  ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaa4', 'subcontractor', 'Precision Framing Inc - progress billing', 70000.00, (current_date - interval '40 days')::date, null),
  ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaa4', 'equipment', 'Dumpster service and small tool rental', 9000.00, (current_date - interval '30 days')::date, null),

  -- a5 (value 980,000, on_hold)
  ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaa5', 'labor', 'Site prep and mobilization labor', 30000.00, (current_date - interval '44 days')::date, null),
  ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaa5', 'materials', 'Structural steel deposit', 48000.00, (current_date - interval '43 days')::date, null),
  ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaa5', 'subcontractor', 'TopLine Roofing Co - mobilization billing', 40000.00, (current_date - interval '38 days')::date, null),
  ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaa5', 'permits', 'Warehouse building permit', 6000.00, (current_date - interval '44 days')::date, null),

  -- a6 (value 720,000) - UNPROFITABLE: total costs = 742,000 > original_value
  ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaa6', 'labor', 'Structural remediation labor, towers A-C', 220000.00, (current_date - interval '190 days')::date, 'Scope grew significantly after demo exposed rot/corrosion.'),
  ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaa6', 'materials', 'Waterproofing membrane, sealants, and replacement precast', 300000.00, (current_date - interval '150 days')::date, null),
  ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaa6', 'subcontractor', 'Coastal Drywall & Paint - progress billing', 92000.00, (current_date - interval '100 days')::date, 'Subcontractor overpaid relative to contract value; see subcontractors table.'),
  ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaa6', 'equipment', 'Swing stage and suspended scaffold rental, 3 towers', 50000.00, (current_date - interval '80 days')::date, null),
  ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaa6', 'permits', 'Facade work permits and inspections', 20000.00, (current_date - interval '210 days')::date, null),
  ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaa6', 'other', 'Engineering assessment and remediation design changes', 60000.00, (current_date - interval '170 days')::date, 'Unbudgeted structural engineering fees.'),

  -- a7 (value 1,100,000)
  ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaa7', 'labor', 'Classroom addition framing and finish labor', 110000.00, (current_date - interval '200 days')::date, null),
  ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaa7', 'materials', 'Structural steel, masonry, and roofing materials', 150000.00, (current_date - interval '160 days')::date, null),
  ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaa7', 'subcontractor', 'Reliable Landscaping LLC - progress billing', 20000.00, (current_date - interval '50 days')::date, null),
  ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaa7', 'other', 'Temporary fencing and site safety measures', 15000.00, (current_date - interval '280 days')::date, null);

-- ----------------------------------------------------------------------------
-- 8. Invoices (12) - fixed ids so payments can reference them.
--    b08 is overdue by more than 60 days; b11 is an unpaid balance on a
--    contract nearing its end date (a7).
-- ----------------------------------------------------------------------------
insert into public.invoices (
  id, contract_id, invoice_number, invoice_date, due_date, description,
  invoice_amount, retainage_percent, retainage_amount, net_amount_due,
  amount_paid, status, notes
)
values
  ('bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbb001', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaa1', 'INV-1001',
   (current_date - interval '100 days')::date, (current_date - interval '70 days')::date, 'Progress billing #1 - floors 12-14',
   300000.00, 10, 30000.00, 270000.00, 270000.00, 'paid', 'Paid in two installments.'),

  ('bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbb002', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaa1', 'INV-1002',
   (current_date - interval '40 days')::date, (current_date - interval '10 days')::date, 'Progress billing #2 - floors 15-16',
   250000.00, 10, 25000.00, 225000.00, 120000.00, 'partially_paid', 'Balance pending client review of CO-1002.'),

  ('bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbb003', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaa2', 'INV-1003',
   (current_date - interval '150 days')::date, (current_date - interval '120 days')::date, 'Progress billing #1 - sitework and foundations',
   400000.00, 5, 20000.00, 380000.00, 380000.00, 'paid', null),

  ('bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbb004', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaa2', 'INV-1004',
   (current_date - interval '60 days')::date, (current_date - interval '30 days')::date, 'Progress billing #2 - structural steel and MEP rough-in',
   350000.00, 5, 17500.00, 332500.00, 200000.00, 'partially_paid', null),

  ('bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbb005', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaa3', 'INV-1005',
   (current_date - interval '300 days')::date, (current_date - interval '270 days')::date, 'Progress billing #1 - foundations and framing',
   350000.00, 10, 35000.00, 315000.00, 315000.00, 'paid', null),

  ('bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbb006', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaa3', 'INV-1006',
   (current_date - interval '60 days')::date, (current_date - interval '30 days')::date, 'Final billing including approved change orders CO-1005/1006/1007',
   133000.00, 0, 0.00, 133000.00, 133000.00, 'paid', 'Retainage released on final invoice after certificate of occupancy.'),

  ('bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbb007', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaa4', 'INV-1007',
   (current_date - interval '20 days')::date, (current_date + interval '10 days')::date, 'T&M billing - month 3',
   120000.00, 10, 12000.00, 108000.00, 0.00, 'unpaid', null),

  ('bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbb008', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaa4', 'INV-1008',
   (current_date - interval '100 days')::date, (current_date - interval '75 days')::date, 'T&M billing - month 1',
   95000.00, 10, 9500.00, 85500.00, 0.00, 'overdue', 'Over 60 days past due; client accounts payable unresponsive.'),

  ('bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbb009', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaa5', 'INV-1009',
   (current_date - interval '30 days')::date, current_date, 'Progress billing #1 - mobilization and site prep',
   150000.00, 10, 15000.00, 135000.00, 0.00, 'unpaid', 'On hold pending client financing; billing paused.'),

  ('bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbb010', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaa6', 'INV-1010',
   (current_date - interval '90 days')::date, (current_date - interval '60 days')::date, 'Progress billing #2 - remediation and waterproofing',
   280000.00, 10, 28000.00, 252000.00, 150000.00, 'partially_paid', 'Condo association disputing part of remediation scope.'),

  ('bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbb011', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaa7', 'INV-1011',
   (current_date - interval '15 days')::date, (current_date + interval '5 days')::date, 'Progress billing #3 - final classroom finishes',
   200000.00, 5, 10000.00, 190000.00, 0.00, 'unpaid', 'Contract nears end date with a significant unpaid balance.'),

  ('bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbb012', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaa8', 'INV-1012',
   (current_date - interval '190 days')::date, (current_date - interval '160 days')::date, 'Closeout billing prior to cancellation',
   80000.00, 10, 8000.00, 72000.00, 0.00, 'unpaid', 'Outstanding closeout invoice after owner canceled contract.')
on conflict (id) do nothing;

-- ----------------------------------------------------------------------------
-- 9. Payments (8)
-- ----------------------------------------------------------------------------
insert into public.payments (invoice_id, payment_amount, payment_date, payment_method, reference_number, notes)
values
  ('bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbb001', 150000.00, (current_date - interval '95 days')::date, 'ACH', 'PMT-1001', 'First installment.'),
  ('bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbb001', 120000.00, (current_date - interval '55 days')::date, 'Check', 'PMT-1002', 'Final installment, paid in full.'),
  ('bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbb002', 120000.00, (current_date - interval '20 days')::date, 'ACH', 'PMT-1003', 'Partial payment; balance held pending CO approval.'),
  ('bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbb003', 380000.00, (current_date - interval '140 days')::date, 'Wire', 'PMT-1004', null),
  ('bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbb004', 200000.00, (current_date - interval '25 days')::date, 'ACH', 'PMT-1005', 'Partial payment.'),
  ('bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbb005', 315000.00, (current_date - interval '290 days')::date, 'Wire', 'PMT-1006', null),
  ('bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbb006', 133000.00, (current_date - interval '50 days')::date, 'Check', 'PMT-1007', 'Final payment including retainage release.'),
  ('bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbb010', 150000.00, (current_date - interval '70 days')::date, 'ACH', 'PMT-1008', 'Partial payment while scope dispute is resolved.');

-- ----------------------------------------------------------------------------
-- 10. Field logs (15)
-- ----------------------------------------------------------------------------
insert into public.field_logs (
  contract_id, user_id, log_date, work_performed, hours_worked, workers_on_site,
  weather_conditions, equipment_used, materials_used, issues_or_delays, notes
)
values
  ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaa1', '44444444-4444-4444-4444-444444444444', (current_date - interval '95 days')::date,
   'Continued electrical rough-in on floor 15, began drywall hang on floor 14.', 9.5, 12, 'Clear, 68F', 'Scissor lifts (2), material hoist', 'Metal studs, drywall sheets, conduit', null, null),
  ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaa1', '55555555-5555-5555-5555-555555555555', (current_date - interval '75 days')::date,
   'Electrical panel install and circuit testing, floor 15.', 8.0, 4, 'Clear, 70F', 'Hand tools, panel lift', 'Breaker panels, wire', null, 'Panel upgrade tied to CO-1001.'),
  ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaa1', '44444444-4444-4444-4444-444444444444', (current_date - interval '30 days')::date,
   'Curtain wall glazing install, floors 16-17.', 10.0, 10, 'Windy, 55F', 'Boom lift, glazing rig', 'Glazing units, sealant', 'High winds halted work for 2 hours.', null),

  ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaa2', '44444444-4444-4444-4444-444444444444', (current_date - interval '120 days')::date,
   'Structural steel erection for new outpatient wing.', 10.0, 14, 'Clear, 60F', 'Crane, welding rigs', 'Structural steel, welding rod', null, null),
  ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaa2', '44444444-4444-4444-4444-444444444444', (current_date - interval '85 days')::date,
   'MEP rough-in continues; imaging suite shielding install begins.', 9.0, 11, 'Rain, 58F', 'Material hoist', 'Lead shielding panels, conduit', 'Minor delay due to material delivery.', null),
  ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaa2', '55555555-5555-5555-5555-555555555555', (current_date - interval '55 days')::date,
   'Electrical tie-ins for emergency power system.', 8.5, 5, 'Clear, 64F', 'Hand tools', 'Conduit, wire, transfer switch parts', null, null),

  ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaa3', '44444444-4444-4444-4444-444444444444', (current_date - interval '250 days')::date,
   'Framing complete on units 201-210, balcony additions per CO-1005 underway.', 9.0, 13, 'Clear, 72F', 'Nail guns, saws', 'Framing lumber, hardware', null, null),
  ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaa3', '44444444-4444-4444-4444-444444444444', (current_date - interval '45 days')::date,
   'Final punch-list walkthrough with client and inspector.', 6.0, 4, 'Clear, 66F', null, 'Touch-up paint, hardware', null, 'Certificate of occupancy issued same week.'),

  ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaa4', '44444444-4444-4444-4444-444444444444', (current_date - interval '65 days')::date,
   'Framing and drywall substrate install, suites A and B.', 8.0, 7, 'Clear, 71F', 'Hand tools', 'Metal studs, drywall', null, null),
  ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaa4', '44444444-4444-4444-4444-444444444444', (current_date - interval '25 days')::date,
   'Storefront glazing and signage rough-in.', 8.0, 6, 'Overcast, 62F', 'Boom lift', 'Storefront glazing, conduit', null, 'Signage scope pending CO-1008 approval.'),

  ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaa5', '44444444-4444-4444-4444-444444444444', (current_date - interval '44 days')::date,
   'Site mobilization and erosion control installed.', 8.0, 6, 'Clear, 75F', 'Excavator, compactor', 'Silt fence, gravel', null, 'Project placed on hold shortly after this log.'),
  ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaa5', '44444444-4444-4444-4444-444444444444', (current_date - interval '38 days')::date,
   'Roofing subcontractor mobilized, materials staged on site.', 5.0, 3, 'Clear, 73F', 'Forklift', 'Roofing membrane rolls', 'Work paused pending owner remobilization notice.', null),

  ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaa6', '44444444-4444-4444-4444-444444444444', (current_date - interval '180 days')::date,
   'Demo of deteriorated balcony sections, tower A.', 9.0, 10, 'Clear, 58F', 'Jackhammers, debris chute', 'N/A', 'Discovered extensive rebar corrosion beyond original scope.', 'Led to CO-1010 for remediation.'),
  ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaa6', '55555555-5555-5555-5555-555555555555', (current_date - interval '90 days')::date,
   'Drywall repair and priming, interior corridors towers B and C.', 8.0, 8, 'Clear, 61F', 'Scaffolding', 'Drywall compound, primer', null, null),

  ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaa7', '44444444-4444-4444-4444-444444444444', (current_date - interval '20 days')::date,
   'Interior finishes and casework install in new classrooms.', 9.0, 9, 'Clear, 70F', 'Hand tools', 'Casework, flooring, paint', null, 'On track for substantial completion before school year.');

-- ----------------------------------------------------------------------------
-- 11. Milestones (20)
-- ----------------------------------------------------------------------------
insert into public.milestones (contract_id, milestone_name, milestone_value, due_date, status)
values
  ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaa1', 'Demo and abatement complete', 85000.00, (current_date - interval '110 days')::date, 'completed'),
  ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaa1', 'MEP rough-in complete, floors 12-16', 220000.00, (current_date - interval '30 days')::date, 'in_progress'),
  ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaa1', 'Substantial completion', 850000.00, (current_date + interval '60 days')::date, 'pending'),

  ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaa2', 'Sitework and foundations complete', 250000.00, (current_date - interval '140 days')::date, 'completed'),
  ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaa2', 'Structural steel topped out', 300000.00, (current_date - interval '60 days')::date, 'in_progress'),

  ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaa3', 'Foundation and framing complete', 350000.00, (current_date - interval '280 days')::date, 'completed'),
  ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaa3', 'Interior finishes complete', 200000.00, (current_date - interval '60 days')::date, 'completed'),
  ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaa3', 'Certificate of occupancy issued', 90000.00, (current_date - interval '30 days')::date, 'completed'),

  ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaa4', 'Suites A and B ready for tenant fixturing', 200000.00, (current_date - interval '15 days')::date, 'completed'),
  ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaa4', 'Suites C and D ready for tenant fixturing', 225000.00, (current_date + interval '45 days')::date, 'in_progress'),

  ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaa5', 'Site mobilization and erosion control', 60000.00, (current_date - interval '44 days')::date, 'completed'),
  ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaa5', 'Building shell and roof complete', 500000.00, (current_date + interval '150 days')::date, 'pending'),

  ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaa6', 'Tower A demo and remediation complete', 260000.00, (current_date - interval '150 days')::date, 'completed'),
  ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaa6', 'Tower B and C waterproofing complete', 260000.00, (current_date - interval '30 days')::date, 'in_progress'),
  ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaa6', 'Final painting and punch-list', 200000.00, (current_date + interval '20 days')::date, 'pending'),

  ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaa7', 'Foundation and structural steel complete', 400000.00, (current_date - interval '200 days')::date, 'completed'),
  ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaa7', 'Building envelope and roofing complete', 350000.00, (current_date - interval '60 days')::date, 'completed'),
  ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaa7', 'Final finishes and occupancy', 350000.00, (current_date + interval '12 days')::date, 'in_progress'),

  ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaa8', 'Level 2-3 repair complete', 150000.00, (current_date - interval '260 days')::date, 'completed'),
  ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaa8', 'Level 4 repair and restriping', 150000.00, (current_date - interval '210 days')::date, 'in_progress');
