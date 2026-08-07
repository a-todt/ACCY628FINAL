-- Compact demo reseed after wipe (40 contracts + core child rows).
-- Disables billing/payment guards only for this seed transaction.

alter table public.invoices disable trigger trg_enforce_invoice_billing_guards;
alter table public.payments disable trigger trg_enforce_payment_amount_positive;
alter table public.invoices disable trigger trg_sync_invoice_wip_billings;

do $$
declare
  admin_id uuid;
  client_id uuid;
  sub1_id uuid;
  sub2_id uuid;
  pm_ids uuid[];
  field_ids uuid[];
  n_pm int;
  n_field int;
  i int;
  cid uuid;
  pm_id uuid;
  field_id uuid;
  cname text;
  client_name text;
  city text;
  addr text;
  ctype text;
  cstatus text;
  oval numeric;
  retain numeric;
  start_d date;
  end_d date;
  inv_id uuid;
  inv_amt numeric;
  paid_amt numeric;
  inv_status text;
  j int;
  n_inv int;
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
begin
  select id into admin_id from auth.users where email = 'admin@gcmanager.demo';
  select id into client_id from auth.users where email = 'client@gcmanager.demo';
  select id into sub1_id from auth.users where email = 'sub@gcmanager.demo';
  select id into sub2_id from auth.users where email = 'sub2@gcmanager.demo';

  select array_agg(id order by email) into pm_ids
  from public.user_profiles
  where role = 'project_manager' and coalesce(is_active, true) and email like '%@gcmanager.demo';

  select array_agg(id order by email) into field_ids
  from public.user_profiles
  where role = 'field_supervisor' and coalesce(is_active, true) and email like '%@gcmanager.demo';

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
      cid, pm_id, cname, client_name,
      case when (i % 4) = 1 then 'client@gcmanager.demo'
           else lower(replace(split_part(client_name, ' ', 1), '.', '')) || '@example.com' end,
      '312-555-' || lpad((1000 + i)::text, 4, '0'),
      addr, city, 'IL', ctype, oval, retain, start_d, end_d, cstatus,
      'Seeded project scope for ' || cname,
      'Retainage ' || retain::text || '%.',
      case when (i % 4) = 1 then client_id else null end,
      now() - ((40 + i * 7) || ' days')::interval
    );

    insert into public.contract_assignments (contract_id, user_id, assignment_role)
    values (cid, pm_id, 'project_manager'), (cid, field_id, 'field_supervisor');

    insert into public.milestones (contract_id, milestone_name, milestone_value, due_date, status) values
      (cid, 'Mobilization & Site Setup', round(oval * 0.10, 2), start_d + 20, 'completed'),
      (cid, 'Structure / Shell', round(oval * 0.35, 2), start_d + 90,
        case when cstatus = 'completed' then 'completed' else 'in_progress' end),
      (cid, 'MEP Rough-In', round(oval * 0.25, 2), start_d + 150, 'pending'),
      (cid, 'Finishes & Closeout', round(oval * 0.30, 2), end_d, 'pending');

    insert into public.change_orders (
      contract_id, change_order_number, description, reason, amount, status, date_submitted, date_resolved, notes
    ) values (
      cid, 'CO-' || lpad(i::text, 2, '0') || '-1',
      'Scope adjustment on ' || cname, 'Owner request',
      round((12000 + (i % 9) * 1500)::numeric, 2), 'approved', start_d + 20, start_d + 25, 'Seeded'
    );

    for j in 1..4 loop
      insert into public.cost_entries (
        contract_id, user_id, category, description, amount, date_incurred, notes
      ) values (
        cid, case when j % 2 = 0 then field_id else pm_id end,
        (array['labor','materials','subcontractor','equipment'])[j],
        'Seeded cost ' || j || ' — ' || cname,
        round((5000 + j * 2500 + i * 100)::numeric, 2),
        start_d + (10 * j), 'Seeded cost'
      );
    end loop;

    if cstatus <> 'canceled' then
      insert into public.field_logs (
        contract_id, user_id, log_date, work_performed, hours_worked, workers_on_site,
        weather_conditions, notes
      ) values (
        cid, field_id, least(current_date, start_d + 14),
        'Seeded field progress on ' || cname, 8, 6, 'Clear', 'Seeded field log'
      );
    end if;

    n_inv := case when cstatus = 'canceled' then 1 else 2 end;
    for j in 1..n_inv loop
      inv_amt := round(oval * (0.15 + j * 0.10), 2);
      inv_status := case
        when j = 1 then 'paid'
        when (i % 5) = 0 then 'overdue'
        when (i % 3) = 0 then 'partially_paid'
        else 'unpaid'
      end;
      paid_amt := case inv_status
        when 'paid' then round(inv_amt * (1 - retain / 100.0), 2)
        when 'partially_paid' then round(inv_amt * 0.4, 2)
        else 0 end;
      inv_id := gen_random_uuid();
      insert into public.invoices (
        id, contract_id, invoice_number, invoice_date, due_date, description,
        invoice_amount, retainage_percent, retainage_amount, net_amount_due,
        amount_paid, status, notes, approval_status
      ) values (
        inv_id, cid, 'INV-' || lpad(i::text, 2, '0') || '-' || j::text,
        start_d + (30 * j), start_d + (30 * j) + 30,
        'Progress billing #' || j || ' — ' || cname,
        inv_amt, retain, round(inv_amt * retain / 100.0, 2),
        round(inv_amt * (1 - retain / 100.0), 2), paid_amt, inv_status, 'Seeded invoice', 'approved'
      );
      if paid_amt > 0 then
        insert into public.payments (
          invoice_id, payment_amount, payment_date, payment_method, reference_number, notes, approval_status
        ) values (
          inv_id, paid_amt, start_d + (30 * j) + 10,
          case when j % 2 = 0 then 'ACH' else 'Check' end,
          'PMT-' || lpad(i::text, 2, '0') || j::text, 'Seeded payment', 'posted'
        );
      end if;
    end loop;

    insert into public.subcontractors (
      contract_id, company_name, contact_name, contact_email, contact_phone, trade,
      subcontract_value, amount_paid, retainage_percent, start_date, end_date, status,
      scope_of_work, user_id, rating
    ) values (
      cid,
      case when (i % 5) = 1 then 'Apex Electrical LLC' else 'Trade Pros #' || ((i % 9) + 1)::text end,
      case when (i % 5) = 1 then 'Apex Contact' else 'Sub Contact' end,
      case when (i % 5) = 1 then 'sub@gcmanager.demo' else 'sub' || i::text || '@example.com' end,
      '708-555-' || lpad((2000 + i)::text, 4, '0'),
      (array['Electrical','Plumbing','HVAC','Concrete'])[1 + (i % 4)],
      round(oval * 0.12, 2), round(oval * 0.04, 2), 10, start_d + 15, end_d,
      case when cstatus = 'completed' then 'complete' when cstatus = 'canceled' then 'terminated' else 'active' end,
      'Seeded subcontract package',
      case when (i % 5) = 1 then sub1_id when (i % 7) = 2 then sub2_id else null end,
      4.0
    );

    insert into public.projects (
      user_id, project_name, client_name, original_contract_value, revised_contract_value,
      estimated_total_cost, start_date, end_date, status, contract_id
    ) values (
      admin_id, cname, client_name, oval, oval + 12000,
      oval * 0.9, start_d, end_d,
      case cstatus when 'completed' then 'completed' when 'on_hold' then 'on_hold' when 'canceled' then 'on_hold' else 'active' end,
      cid
    );
  end loop;

  insert into public.access_audit_log (actor_user_id, action, entity_type, entity_id, details)
  values (admin_id, 'seed_reseed_completed', 'system', null, jsonb_build_object('contracts', 40, 'source', 'compact_reseed'));
end $$;

-- Pending Accounting payment demo on Lakeshore unpaid invoice
insert into public.payments (
  id, invoice_id, payment_amount, payment_date, payment_method,
  reference_number, notes, approval_status, submitted_by, submitted_at
)
select
  'b0000000-0000-4000-8000-0000000000f2',
  i.id,
  least(25000.00, greatest(coalesce(i.net_amount_due, 0) - coalesce(i.amount_paid, 0), 1000)),
  current_date - 1,
  'ACH',
  'FRAUD-PMT-DEMO-01',
  'DEMO — payment awaiting Accounting approval',
  'pending_accounting',
  p.id,
  now() - interval '1 day'
from public.invoices i
cross join public.user_profiles p
where i.invoice_number = 'INV-01-2'
  and i.contract_id = 'a0000000-0000-4000-8000-000000000001'
  and p.email = 'pm@gcmanager.demo'
limit 1
on conflict (id) do update set
  approval_status = 'pending_accounting',
  notes = excluded.notes;

alter table public.invoices enable trigger trg_enforce_invoice_billing_guards;
alter table public.payments enable trigger trg_enforce_payment_amount_positive;
alter table public.invoices enable trigger trg_sync_invoice_wip_billings;
