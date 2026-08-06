-- ============================================================================
-- GC Contract Manager - Full Demo Reseed (40 contracts)
-- ============================================================================
-- Safe to re-run. Wipes all prior operational demo data, ensures demo staff
-- logins, and seeds 40 contracts with daily-ops child data.
--
-- Staffing (reasonable for 40 jobs):
--   5 project managers  (~8 contracts each)
--   6 field supervisors (~6–7 contracts each)
--
-- Demo logins (password: Demo123!):
--   admin@gcmanager.demo
--   pm@ … pm5@gcmanager.demo
--   field@ … field6@gcmanager.demo
--   client@ / sub@ / sub2@gcmanager.demo
-- ============================================================================

create extension if not exists pgcrypto;

-- ----------------------------------------------------------------------------
-- 0. Ensure expanded demo staff auth users exist
-- ----------------------------------------------------------------------------
insert into auth.users (
  instance_id, id, aud, role, email, encrypted_password,
  email_confirmed_at, raw_app_meta_data, raw_user_meta_data,
  created_at, updated_at, confirmation_token, recovery_token,
  email_change_token_new, email_change, is_sso_user, is_anonymous
)
select
  '00000000-0000-0000-0000-000000000000', v.id, 'authenticated', 'authenticated', v.email,
  coalesce(
    (select encrypted_password from auth.users where email = 'admin@gcmanager.demo' limit 1),
    crypt('Demo123!', gen_salt('bf'))
  ),
  now(), '{"provider":"email","providers":["email"]}', jsonb_build_object('full_name', v.full_name),
  now(), now(), '', '', '', '', false, false
from (values
  ('66666666-6666-6666-6666-666666666671'::uuid, 'pm3@gcmanager.demo', 'Morgan Ellis'),
  ('66666666-6666-6666-6666-666666666672'::uuid, 'pm4@gcmanager.demo', 'Priya Nair'),
  ('66666666-6666-6666-6666-666666666673'::uuid, 'pm5@gcmanager.demo', 'Chris Delgado'),
  ('66666666-6666-6666-6666-666666666681'::uuid, 'field3@gcmanager.demo', 'Devon Walsh'),
  ('66666666-6666-6666-6666-666666666682'::uuid, 'field4@gcmanager.demo', 'Harper Lee'),
  ('66666666-6666-6666-6666-666666666683'::uuid, 'field5@gcmanager.demo', 'Quinn Brooks'),
  ('66666666-6666-6666-6666-666666666684'::uuid, 'field6@gcmanager.demo', 'Jamie Soto')
) as v(id, email, full_name)
where not exists (select 1 from auth.users u where u.id = v.id)
  and not exists (select 1 from auth.users u where lower(u.email) = lower(v.email));

insert into auth.identities (
  id, user_id, identity_data, provider, provider_id, last_sign_in_at, created_at, updated_at
)
select gen_random_uuid(), u.id,
       jsonb_build_object('sub', u.id::text, 'email', u.email),
       'email', u.id::text, now(), now(), now()
from auth.users u
where lower(u.email) in (
  'pm3@gcmanager.demo','pm4@gcmanager.demo','pm5@gcmanager.demo',
  'field3@gcmanager.demo','field4@gcmanager.demo','field5@gcmanager.demo','field6@gcmanager.demo'
)
and not exists (
  select 1 from auth.identities i where i.provider = 'email' and i.provider_id = u.id::text
);

update auth.users u
set encrypted_password = w.encrypted_password,
    email_confirmed_at = coalesce(u.email_confirmed_at, now()),
    updated_at = now()
from auth.users w
where w.email = 'admin@gcmanager.demo'
  and lower(u.email) in (
    'pm3@gcmanager.demo','pm4@gcmanager.demo','pm5@gcmanager.demo',
    'field3@gcmanager.demo','field4@gcmanager.demo','field5@gcmanager.demo','field6@gcmanager.demo',
    'pm@gcmanager.demo','pm2@gcmanager.demo','field@gcmanager.demo','field2@gcmanager.demo',
    'client@gcmanager.demo','sub@gcmanager.demo','sub2@gcmanager.demo'
  );

-- ----------------------------------------------------------------------------
-- 1. Sync profiles to existing auth users (by email)
-- ----------------------------------------------------------------------------
insert into public.user_profiles (
  id, email, full_name, role, employee_id, title, phone, is_active, onboarding_complete
)
select u.id, u.email, v.full_name, v.role, v.employee_id, v.title, v.phone, true, true
from auth.users u
join (values
  ('admin@gcmanager.demo', 'Demo Admin', 'admin', 'EMP-001', 'Company Administrator', '312-555-0100'),
  ('pm@gcmanager.demo', 'Jordan Blake', 'project_manager', 'EMP-101', 'Senior Project Manager', '312-555-0101'),
  ('pm2@gcmanager.demo', 'Alex Chen', 'project_manager', 'EMP-102', 'Project Manager', '312-555-0102'),
  ('pm3@gcmanager.demo', 'Morgan Ellis', 'project_manager', 'EMP-103', 'Project Manager', '312-555-0103'),
  ('pm4@gcmanager.demo', 'Priya Nair', 'project_manager', 'EMP-104', 'Project Manager', '312-555-0104'),
  ('pm5@gcmanager.demo', 'Chris Delgado', 'project_manager', 'EMP-105', 'Project Manager', '312-555-0105'),
  ('field@gcmanager.demo', 'Sam Rivera', 'field_supervisor', 'EMP-201', 'Field Supervisor', '312-555-0201'),
  ('field2@gcmanager.demo', 'Casey Morgan', 'field_supervisor', 'EMP-202', 'Field Supervisor', '312-555-0202'),
  ('field3@gcmanager.demo', 'Devon Walsh', 'field_supervisor', 'EMP-203', 'Field Supervisor', '312-555-0203'),
  ('field4@gcmanager.demo', 'Harper Lee', 'field_supervisor', 'EMP-204', 'Field Supervisor', '312-555-0204'),
  ('field5@gcmanager.demo', 'Quinn Brooks', 'field_supervisor', 'EMP-205', 'Field Supervisor', '312-555-0205'),
  ('field6@gcmanager.demo', 'Jamie Soto', 'field_supervisor', 'EMP-206', 'Field Supervisor', '312-555-0206'),
  ('client@gcmanager.demo', 'Riley Client', 'client', null, null, '312-555-0199'),
  ('sub@gcmanager.demo', 'Apex Contact', 'subcontractor', null, 'Subcontractor Contact', '312-555-0301'),
  ('sub2@gcmanager.demo', 'Taylor Quinn', 'subcontractor', null, 'Subcontractor Contact', '312-555-0302')
) as v(email, full_name, role, employee_id, title, phone)
  on lower(u.email) = lower(v.email)
on conflict (id) do update
  set email = excluded.email,
      full_name = excluded.full_name,
      role = excluded.role,
      employee_id = excluded.employee_id,
      title = excluded.title,
      phone = excluded.phone,
      is_active = true,
      onboarding_complete = true;

update public.company_settings
set company_name = 'Midwest Building Group',
    gc_license_number = 'IL-GC-44821',
    gc_license_state = 'IL',
    gc_license_expiration = (current_date + interval '400 days')::date,
    address_line1 = '200 W Madison St',
    city = 'Chicago',
    state = 'IL',
    postal_code = '60606',
    default_retainage_percent = 10,
    default_payment_terms = 'Net 30',
    updated_by = (select id from auth.users where email = 'admin@gcmanager.demo' limit 1),
    updated_at = now();

-- ----------------------------------------------------------------------------
-- 2. Wipe previous operational data
-- ----------------------------------------------------------------------------
delete from public.bids;
delete from public.bid_packages;
delete from public.payments;
delete from public.invoices;
delete from public.field_logs;
delete from public.cost_entries;
delete from public.change_orders;
delete from public.milestones;
delete from public.subcontractor_invites where true;
delete from public.insurance_policies where true;
delete from public.contract_insurance_requirements where true;
delete from public.subcontractors;
delete from public.contract_assignments;
delete from public.attachments where true;
delete from public.access_audit_log where true;
delete from public.customers;
delete from public.project_change_orders;
delete from public.project_costs;
delete from public.billings;
delete from public.projects;
delete from public.employee_certifications;
delete from public.contracts;

-- ----------------------------------------------------------------------------
-- 3. Seed 40 contracts + daily-ops children
-- ----------------------------------------------------------------------------
do $$
declare
  admin_id uuid;
  pm_ids uuid[];
  field_ids uuid[];
  n_pm int;
  n_field int;
  client_id uuid;
  sub1_id uuid;
  sub2_id uuid;

  names text[] := array[
    'Lakeshore Office Tower Fit-Out','River North Mixed-Use Core','Oak Park Civic Center Renovation',
    'Naperville Logistics Hub','Evanston Research Lab Expansion','Aurora Retail Pavilion',
    'Schaumburg Data Hall Shell','Wicker Park Multifamily Phase 1','Midway Airport Support Building',
    'Peoria Medical Pavilion','Champaign Student Housing Block B','Rockford Industrial Retrofit',
    'Joliet Transit Plaza Upgrade','Elgin Water Treatment Annex','Bloomington Hotel Interior Package',
    'Decatur Food Plant Expansion','Springfield Capitol Annex Remodel','Carbondale Arena Seating Refresh',
    'Moline Riverfront Condos','Quincy Courthouse Accessibility','Skokie Tech Campus Building C',
    'Des Plaines Warehouse Mezzanine','Orland Park Community Pool House','Tinley Park Fire Station 3',
    'Bolingbrook Cold Storage Shell','Wheaton Library Addition','Downers Grove Bank Branch TI',
    'Glenview Senior Living Wing','Highland Park Yacht Club Dock','Arlington Heights Parking Deck',
    'Palatine Middle School STEM Wing','Buffalo Grove Corporate HQ Lobby','Vernon Hills Distribution Crossdock',
    'Mundelein Packaging Line Buildout','Gurnee Outlet Court Renovation','Waukegan Harbor Warehouse',
    'Crystal Lake Rec Center Expansion','McHenry County Garage Rebuild','St. Charles Riverwalk Cafe Shell',
    'Geneva Biotech Cleanroom Suite'
  ];
  clients text[] := array[
    'Meridian Holdings LLC','Riverside Health Partners','Lakeside Development Group',
    'Northgate Logistics Inc','Prairie Capital Partners','Westside Retail Partners LLC',
    'Harbor View Condo Association','Cedar Grove School District 47','Metro Transit Authority',
    'Heartland Food Systems','Illinois Civic Facilities Board','Midwest Research Institutes',
    'Fox Valley Hospitality Co','Great Lakes Industrial REIT','Summit Multifamily Partners',
    'Cornerstone Banking Group','Prairie Fire Protection Dist','North Shore Senior Living',
    'Illinois Yacht Clubs Assoc','Municipal Parking Authority','STEM Education Foundation',
    'Buffalo Grove Corp Campus','Regional Distribution Trust','PackRight Manufacturing',
    'Outlet Court Holdings','Waukegan Port District','Crystal Lake Park District',
    'McHenry County Facilities','Riverwalk Hospitality LLC','Geneva Biotech Labs Inc',
    'Oak Park Civic Trust','Naperville Industrial Partners','Evanston Innovation Hub',
    'Aurora Retail Collective','Schaumburg Data Partners','Wicker Park Living LLC',
    'Midway Support Services','Peoria Medical Group','Champaign Housing Partners',
    'Rockford Works Coalition'
  ];
  cities text[] := array[
    'Chicago','Chicago','Oak Park','Naperville','Evanston','Aurora','Schaumburg','Chicago',
    'Chicago','Peoria','Champaign','Rockford','Joliet','Elgin','Bloomington','Decatur',
    'Springfield','Carbondale','Moline','Quincy','Skokie','Des Plaines','Orland Park','Tinley Park',
    'Bolingbrook','Wheaton','Downers Grove','Glenview','Highland Park','Arlington Heights',
    'Palatine','Buffalo Grove','Vernon Hills','Mundelein','Gurnee','Waukegan',
    'Crystal Lake','McHenry','St. Charles','Geneva'
  ];
  addresses text[] := array[
    '400 W Wacker Dr','1200 N Wells St','123 Madison St','5500 Diehl Rd','1801 Orrington Ave',
    '2200 Ogden Ave','1500 Woodfield Rd','1620 N Milwaukee Ave','5700 S Cicero Ave','901 NE Glen Oak',
    '505 S Sixth St','4401 S Main St','150 Transit Plaza','900 Water Works Rd','201 E Washington St',
    '3300 Packaging Way','401 S Spring St','1400 Arena Dr','77 River Dr','100 N 5th St',
    '3500 Gross Point Rd','950 Touhy Ave','14700 Ravinia Ave','17355 Oak Park Ave','501 Remington Blvd',
    '225 N Cross St','3450 Lacey Rd','2601 Willow Rd','10 Harbor St','201 N Vail Ave',
    '700 E Wood St','1650 Lake Cook Rd','700 N Milwaukee Ave','1200 Lake St','6170 W Grand Ave',
    '1 Pershing Rd','1 N Main St','2200 N Seminary Ave','5 N 2nd St','1100 Fabyan Pkwy'
  ];
  trades text[] := array['Electrical','Plumbing','HVAC','Concrete','Drywall','Roofing','Fire Protection','Sitework'];
  weather text[] := array['Clear','Cloudy','Rain','Wind','Snow','Extreme Heat','Fog'];
  categories text[] := array['labor','materials','subcontractor','equipment','permits','other'];
  work_items text[] := array[
    'Framed interior partitions on level 2','Set rooftop RTU and curb adapters',
    'Poured elevated slab section B','Installed feeder conduits in electrical room',
    'Hung drywall and taped corridors','Rough-in plumbing wet walls floors 3-4',
    'Set curtain wall anchors at podium','Site grading and storm structures',
    'Fire sprinkler mains and drops','Roof membrane patch and flashings'
  ];

  i int; cid uuid; pm_id uuid; field_id uuid; owner_id uuid;
  cname text; client_name text; city text; addr text; ctype text; cstatus text;
  oval numeric; retain numeric; start_d date; end_d date; link_client boolean;
  inv_id uuid; pkg_id uuid; inv_amt numeric; paid_amt numeric; inv_status text; co_status text;
  cat text; n_costs int; n_logs int; n_inv int; n_cos int; j int;
  sub_company text; sub_user uuid; cost_total numeric; approved_co numeric;
  project_id_admin uuid; project_id_owner uuid;
begin
  select id into admin_id from auth.users where email = 'admin@gcmanager.demo';
  select id into client_id from auth.users where email = 'client@gcmanager.demo';
  select id into sub1_id from auth.users where email = 'sub@gcmanager.demo';
  select id into sub2_id from auth.users where email = 'sub2@gcmanager.demo';

  select array_agg(id order by email) into pm_ids
  from public.user_profiles
  where role = 'project_manager' and coalesce(is_active, true)
    and email like '%@gcmanager.demo';

  select array_agg(id order by email) into field_ids
  from public.user_profiles
  where role = 'field_supervisor' and coalesce(is_active, true)
    and email like '%@gcmanager.demo';

  n_pm := coalesce(array_length(pm_ids, 1), 0);
  n_field := coalesce(array_length(field_ids, 1), 0);

  if admin_id is null or n_pm < 2 or n_field < 2 then
    raise exception 'Missing required demo staff (admin / PMs / field). PMs=%, field=%', n_pm, n_field;
  end if;

  for i in 1..40 loop
    cname := names[i];
    client_name := clients[i];
    city := cities[i];
    addr := addresses[i];

    pm_id := pm_ids[((i - 1) % n_pm) + 1];
    field_id := field_ids[((i - 1) % n_field) + 1];
    owner_id := pm_id;
    link_client := (i % 4) = 1;

    ctype := case (i % 5) when 0 then 'cost_plus' when 1 then 'time_and_materials' else 'fixed_price' end;
    cstatus := case
      when i in (8, 19, 31) then 'completed'
      when i in (12, 24) then 'on_hold'
      when i in (16, 36) then 'canceled'
      else 'active'
    end;

    oval := round((250000 + (i * 47350) + ((i % 7) * 18000))::numeric, 2);
    retain := case when ctype = 'cost_plus' then 5 else 10 end;
    start_d := (current_date - ((40 + i * 7) || ' days')::interval)::date;
    end_d := case cstatus
      when 'completed' then (current_date - ((5 + (i % 20)) || ' days')::interval)::date
      when 'canceled' then (current_date - ((30 + (i % 40)) || ' days')::interval)::date
      else (current_date + ((60 + i * 3) || ' days')::interval)::date
    end;

    cid := ('a0000000-0000-4000-8000-' || lpad(i::text, 12, '0'))::uuid;

    insert into public.contracts (
      id, user_id, contract_name, client_name, client_email, client_phone,
      project_address, city, state, contract_type, original_value, retainage_percent,
      start_date, end_date, status, scope_description, special_terms, client_user_id, created_at
    ) values (
      cid, owner_id, cname, client_name,
      case when link_client then 'client@gcmanager.demo'
           else lower(replace(split_part(client_name, ' ', 1), '.', '')) || '@example.com' end,
      '312-555-' || lpad((1000 + i)::text, 4, '0'),
      addr, city, 'IL', ctype, oval, retain, start_d, end_d, cstatus,
      'Seeded project scope for ' || cname || ' including architectural, MEP, and finishes packages coordinated under GC management.',
      'Standard AIA-style terms. Retainage ' || retain::text || '%. Liquidated damages $1,000/day after substantial completion.',
      case when link_client then client_id else null end,
      now() - ((40 + i * 7) || ' days')::interval
    );

    insert into public.contract_assignments (contract_id, user_id, assignment_role)
    values (cid, pm_id, 'project_manager'), (cid, field_id, 'field_supervisor');

    insert into public.customers (
      company_name, contact_name, contact_email, contact_phone,
      billing_address, city, state, postal_code, user_id, notes, is_active, contract_id, client_id
    ) values (
      client_name, split_part(client_name, ' ', 1) || ' Contact',
      case when link_client then 'client@gcmanager.demo'
           else lower(replace(split_part(client_name, ' ', 1), '.', '')) || '@example.com' end,
      '312-555-' || lpad((1000 + i)::text, 4, '0'),
      addr, city, 'IL', lpad((60000 + i)::text, 5, '0'),
      case when link_client then client_id else null end,
      'Seeded customer linked to contract ' || cname, true, cid, 'C' || lpad(i::text, 3, '0')
    );

    insert into public.milestones (contract_id, milestone_name, milestone_value, due_date, status) values
      (cid, 'Mobilization & Site Setup', round(oval * 0.10, 2), start_d + 20,
        case when cstatus = 'canceled' then 'pending' else 'completed' end),
      (cid, 'Structure / Shell', round(oval * 0.35, 2), start_d + 90,
        case when cstatus = 'completed' then 'completed' when cstatus = 'canceled' then 'pending'
             when i % 4 = 0 then 'in_progress' else 'completed' end),
      (cid, 'MEP Rough-In', round(oval * 0.25, 2), start_d + 150,
        case when cstatus = 'completed' then 'completed' when cstatus in ('canceled','on_hold') then 'pending'
             else 'in_progress' end),
      (cid, 'Finishes & Closeout', round(oval * 0.30, 2), end_d,
        case when cstatus = 'completed' then 'completed' else 'pending' end);

    n_cos := 1 + (i % 3);
    approved_co := 0;
    for j in 1..n_cos loop
      co_status := case
        when cstatus = 'canceled' then 'rejected'
        when j = n_cos and (i % 5) = 0 then 'pending'
        when j = 1 then 'approved'
        when (i + j) % 4 = 0 then 'rejected'
        else 'approved'
      end;
      insert into public.change_orders (
        contract_id, change_order_number, description, reason, amount, status, date_submitted, date_resolved, notes
      ) values (
        cid, 'CO-' || lpad(i::text, 2, '0') || '-' || j::text,
        'Scope adjustment #' || j || ' on ' || cname,
        case (j % 3) when 1 then 'Owner request' when 2 then 'Unforeseen condition' else 'Design coordination' end,
        round((8000 + j * 4500 + (i % 9) * 1200)::numeric, 2), co_status,
        start_d + (20 * j), case when co_status = 'pending' then null else start_d + (25 * j) end,
        'Seeded change order'
      );
      if co_status = 'approved' then
        approved_co := approved_co + round((8000 + j * 4500 + (i % 9) * 1200)::numeric, 2);
      end if;
    end loop;

    n_costs := 4 + (i % 4);
    cost_total := 0;
    for j in 1..n_costs loop
      cat := categories[1 + ((i + j) % array_length(categories, 1))];
      insert into public.cost_entries (
        contract_id, user_id, category, description, amount, date_incurred, notes
      ) values (
        cid, case when (i + j) % 2 = 0 then field_id else pm_id end, cat,
        initcap(cat) || ' cost entry ' || j || ' — ' || cname,
        round((3500 + j * 2750 + (i % 11) * 900)::numeric * case when i in (6, 22, 34) then 1.35 else 1.0 end, 2),
        start_d + (10 * j), 'Seeded cost'
      );
      cost_total := cost_total + round((3500 + j * 2750 + (i % 11) * 900)::numeric *
        case when i in (6, 22, 34) then 1.35 else 1.0 end, 2);
    end loop;

    if cstatus <> 'canceled' then
      n_logs := 3 + (i % 3);
      for j in 1..n_logs loop
        insert into public.field_logs (
          contract_id, user_id, log_date, work_performed, hours_worked, workers_on_site,
          weather_conditions, equipment_used, materials_used, issues_or_delays, notes
        ) values (
          cid, field_id, least(current_date, start_d + (7 * j)),
          work_items[1 + ((i + j) % array_length(work_items, 1))],
          6 + ((i + j) % 5), 4 + ((i + j) % 12),
          weather[1 + ((i + j) % array_length(weather, 1))],
          'Excavator / scissors / lifts as needed', 'Rebar, conduit, drywall, fasteners',
          case when (i + j) % 5 = 0 then 'Material delivery delay 1/2 day' else null end,
          'Seeded field log'
        );
      end loop;
    end if;

    n_inv := case when cstatus = 'canceled' then 1 else 2 + (i % 2) end;
    for j in 1..n_inv loop
      inv_amt := round((oval + approved_co) * (0.12 + j * 0.08), 2);
      inv_status := case
        when cstatus = 'completed' and j < n_inv then 'paid'
        when cstatus = 'canceled' then 'overdue'
        when j = 1 then 'paid'
        when j = n_inv and (i % 6) = 0 then 'overdue'
        when j = n_inv and (i % 3) = 0 then 'partially_paid'
        when j = n_inv then 'unpaid'
        else 'paid'
      end;
      paid_amt := case inv_status
        when 'paid' then inv_amt * (1 - retain / 100.0)
        when 'partially_paid' then round(inv_amt * 0.4, 2)
        else 0 end;

      inv_id := gen_random_uuid();
      insert into public.invoices (
        id, contract_id, invoice_number, invoice_date, due_date, description,
        invoice_amount, retainage_percent, retainage_amount, net_amount_due, amount_paid, status, notes
      ) values (
        inv_id, cid, 'INV-' || lpad(i::text, 2, '0') || '-' || j::text,
        start_d + (30 * j), start_d + (30 * j) + 30,
        'Progress billing #' || j || ' — ' || cname,
        inv_amt, retain, round(inv_amt * retain / 100.0, 2),
        round(inv_amt * (1 - retain / 100.0), 2), paid_amt, inv_status, 'Seeded invoice'
      );

      if paid_amt > 0 then
        insert into public.payments (invoice_id, payment_amount, payment_date, payment_method, reference_number, notes)
        values (inv_id, paid_amt, start_d + (30 * j) + 10,
          case when (i + j) % 2 = 0 then 'ACH' else 'Check' end,
          'PMT-' || lpad(i::text, 2, '0') || j::text, 'Seeded payment');
      end if;
    end loop;

    for j in 1..(1 + (i % 2)) loop
      sub_company := trades[1 + ((i + j) % array_length(trades, 1))] || ' Pros #' || ((i + j) % 9 + 1)::text;
      sub_user := case
        when j = 1 and (i % 5) = 1 then sub1_id
        when j = 2 and (i % 7) = 2 then sub2_id
        else null end;
      insert into public.subcontractors (
        contract_id, company_name, contact_name, contact_email, contact_phone, trade,
        subcontract_value, amount_paid, retainage_percent, start_date, end_date, status,
        scope_of_work, user_id, license_number, license_state, license_expiration, business_notes, rating
      ) values (
        cid,
        case when sub_user = sub1_id then 'Apex Electrical LLC'
             when sub_user = sub2_id then 'Flow Plumbing Inc' else sub_company end,
        case when sub_user = sub1_id then 'Apex Contact'
             when sub_user = sub2_id then 'Taylor Quinn' else 'Sub Contact ' || j end,
        case when sub_user = sub1_id then 'sub@gcmanager.demo'
             when sub_user = sub2_id then 'sub2@gcmanager.demo'
             else 'sub' || i::text || j::text || '@example.com' end,
        '708-555-' || lpad((2000 + i * 2 + j)::text, 4, '0'),
        trades[1 + ((i + j) % array_length(trades, 1))],
        round(oval * (0.08 + j * 0.04), 2),
        round(oval * (0.08 + j * 0.04) * case when cstatus = 'completed' then 0.9 else 0.35 end, 2),
        10, start_d + 15, end_d,
        case when cstatus = 'completed' then 'complete' when cstatus = 'canceled' then 'terminated' else 'active' end,
        trades[1 + ((i + j) % array_length(trades, 1))] || ' package for ' || cname,
        sub_user, 'IL-SUB-' || lpad((1000 + i * 10 + j)::text, 4, '0'), 'IL',
        (current_date + ((120 + i * 3) || ' days')::interval)::date, 'Seeded subcontractor',
        (3 + ((i + j) % 3))::numeric
      );
    end loop;

    if cstatus = 'active' and (i % 3) = 0 then
      pkg_id := gen_random_uuid();
      insert into public.bid_packages (
        id, contract_id, title, trade, status, project_name, project_address, project_city, project_state,
        client_name, contract_type, project_start_date, project_end_date, estimated_package_value,
        scope_of_work, bid_instructions, bids_due_at, contact_name, contact_email, contact_phone, created_by
      ) values (
        pkg_id, cid,
        trades[1 + (i % array_length(trades, 1))] || ' Bid Package — ' || cname,
        trades[1 + (i % array_length(trades, 1))],
        case when (i % 6) = 0 then 'awarded' else 'open' end,
        cname, addr, city, 'IL', client_name, ctype, start_d, end_d, round(oval * 0.12, 2),
        'Provide complete ' || trades[1 + (i % array_length(trades, 1))] || ' scope including materials, labor, and coordination.',
        'Submit lump-sum bid with schedule and exclusions.', (current_date + 21)::date,
        'Jordan Blake', 'pm@gcmanager.demo', '312-555-0101', pm_id
      );

      insert into public.bids (
        bid_package_id, user_id, company_name, amount, days_to_complete, proposal_notes,
        exclusions, license_number, license_state, license_expiration, status, gc_rating, gc_review
      ) values
      (pkg_id, sub1_id, 'Apex Electrical LLC', round(oval * 0.11, 2), 45,
        'Includes premium gear and overtime allowance.', 'Owner-furnished equipment excluded.',
        'IL-SUB-9001', 'IL', (current_date + 200)::date,
        case when (i % 6) = 0 then 'accepted' else 'submitted' end, 4.5, 'Competitive and complete.'),
      (pkg_id, sub2_id, 'Flow Plumbing Inc', round(oval * 0.125, 2), 50,
        'Standard package with 2-week float.', 'Hazardous abatement excluded.',
        'IL-SUB-9002', 'IL', (current_date + 180)::date,
        case when (i % 6) = 0 then 'rejected' else 'submitted' end, 3.5, null);
    end if;

    insert into public.projects (
      user_id, project_name, client_name, original_contract_value, revised_contract_value,
      estimated_total_cost, start_date, end_date, status
    ) values (
      admin_id, cname, client_name, oval, oval + approved_co,
      greatest(cost_total, oval * 0.85), start_d, end_d,
      case cstatus when 'completed' then 'completed' when 'on_hold' then 'on_hold' when 'canceled' then 'on_hold' else 'active' end
    ) returning id into project_id_admin;

    if owner_id <> admin_id then
      insert into public.projects (
        user_id, project_name, client_name, original_contract_value, revised_contract_value,
        estimated_total_cost, start_date, end_date, status
      ) values (
        owner_id, cname, client_name, oval, oval + approved_co,
        greatest(cost_total, oval * 0.85), start_d, end_d,
        case cstatus when 'completed' then 'completed' when 'on_hold' then 'on_hold' when 'canceled' then 'on_hold' else 'active' end
      ) returning id into project_id_owner;
    else
      project_id_owner := project_id_admin;
    end if;

    insert into public.project_costs (project_id, user_id, cost_date, cost_category, description, amount)
    select project_id_admin, admin_id, ce.date_incurred, ce.category, ce.description, ce.amount
    from public.cost_entries ce where ce.contract_id = cid limit 4;

    insert into public.billings (
      project_id, user_id, billing_number, billing_date, amount_billed, retainage_held, net_amount, status
    )
    select project_id_admin, admin_id, inv.invoice_number, inv.invoice_date,
      inv.invoice_amount, inv.retainage_amount, inv.net_amount_due,
      case when inv.status = 'paid' then 'paid' else 'submitted' end
    from public.invoices inv where inv.contract_id = cid;

    insert into public.project_change_orders (
      project_id, user_id, change_order_number, description, amount, status, approved_date
    )
    select project_id_admin, admin_id, co.change_order_number, co.description, co.amount, co.status, co.date_resolved
    from public.change_orders co where co.contract_id = cid;
  end loop;

  insert into public.employee_certifications (
    user_id, certification_name, certification_number, issuing_body, issued_date, expiration_date, notes
  )
  select p.id, v.cert_name, v.cert_no, v.body, current_date - v.issued_ago, current_date + v.expires_in, 'Seeded'
  from public.user_profiles p
  join (values
    ('pm@gcmanager.demo', 'OSHA 30', 'OSHA-30-1001', 'OSHA', 400, 300),
    ('pm@gcmanager.demo', 'PMP', 'PMP-88421', 'PMI', 800, 120),
    ('pm2@gcmanager.demo', 'OSHA 30', 'OSHA-30-1002', 'OSHA', 200, 500),
    ('pm3@gcmanager.demo', 'OSHA 30', 'OSHA-30-1003', 'OSHA', 180, 400),
    ('pm4@gcmanager.demo', 'OSHA 30', 'OSHA-30-1004', 'OSHA', 220, 450),
    ('pm5@gcmanager.demo', 'PMP', 'PMP-91002', 'PMI', 500, 200),
    ('field@gcmanager.demo', 'OSHA 30', 'OSHA-30-2001', 'OSHA', 150, 40),
    ('field@gcmanager.demo', 'First Aid / CPR', 'FA-2210', 'Red Cross', 100, 250),
    ('field2@gcmanager.demo', 'OSHA 30', 'OSHA-30-2002', 'OSHA', 90, 600),
    ('field2@gcmanager.demo', 'Scaffold Competent Person', 'SCP-778', 'Scaffold Education', 50, 15),
    ('field3@gcmanager.demo', 'OSHA 30', 'OSHA-30-2003', 'OSHA', 100, 500),
    ('field4@gcmanager.demo', 'First Aid / CPR', 'FA-3301', 'Red Cross', 80, 280),
    ('field5@gcmanager.demo', 'OSHA 30', 'OSHA-30-2005', 'OSHA', 60, 30),
    ('field6@gcmanager.demo', 'Scaffold Competent Person', 'SCP-801', 'Scaffold Education', 40, 320)
  ) as v(email, cert_name, cert_no, body, issued_ago, expires_in)
    on lower(p.email) = lower(v.email);

  insert into public.access_audit_log (actor_user_id, action, entity_type, entity_id, details)
  values
    (admin_id, 'seed_reseed_completed', 'system', null, jsonb_build_object('contracts', 40, 'pms', n_pm, 'field', n_field)),
    (pm_ids[1], 'contract_created', 'contract', null, jsonb_build_object('source', 'seed')),
    (pm_ids[2], 'contract_created', 'contract', null, jsonb_build_object('source', 'seed'));
end $$;
