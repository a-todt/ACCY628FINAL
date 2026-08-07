-- ============================================================================
-- 3-year demo operational reseed (40 contracts) + SoD demo samples.
-- Safe to re-run. Wipes ops data; keeps auth users, profiles, company_settings.
-- Historical rows use explicit approved/posted statuses so charts/WIP stay valid.
-- ============================================================================

-- Ensure SoD demo override stays available for Accounting walkthroughs.
update public.company_settings
set allow_owner_sod_override = true,
    updated_at = now()
where true;

alter table public.invoices disable trigger trg_enforce_invoice_billing_guards;
alter table public.payments disable trigger trg_enforce_payment_amount_positive;
alter table public.invoices disable trigger trg_sync_invoice_wip_billings;

-- Wipe operational data (keep users / settings).
delete from public.messages where true;
delete from public.message_thread_participants where true;
delete from public.message_threads where true;
delete from public.bids where true;
delete from public.bid_packages where true;
delete from public.payments where true;
delete from public.invoices where true;
delete from public.field_logs where true;
delete from public.cost_entries where true;
delete from public.change_orders where true;
delete from public.milestones where true;
delete from public.subcontractor_payments where true;
delete from public.subcontractor_invites where true;
delete from public.insurance_policies where true;
delete from public.contract_insurance_requirements where true;
delete from public.safety_incidents where true;
delete from public.subcontractors where true;
delete from public.contract_assignments where true;
delete from public.attachments where true;
delete from public.access_audit_log where true;
delete from public.customers where true;
delete from public.project_change_orders where true;
delete from public.project_costs where true;
delete from public.billings where true;
delete from public.projects where true;
delete from public.employee_certifications where true;
delete from public.contracts where true;

do $$
declare
  admin_id uuid;
  accounting_id uuid;
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
  m int;
  months_active int;
  month_d date;
  billed_to_date numeric;
  cost_amt numeric;
  cat text;
  sub_val numeric;
  sub_paid numeric;
  project_row_id uuid;
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
  categories text[] := array['labor','materials','subcontractor','equipment','permits','other'];
begin
  select id into admin_id from auth.users where email = 'admin@gcmanager.demo';
  select id into accounting_id from auth.users where email = 'accounting@gcmanager.demo';
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

    -- Three cohorts spanning ~3 years.
    if i <= 14 then
      -- Oldest: mostly completed jobs started 24–36 months ago.
      start_d := (current_date - ((730 + i * 25) || ' days')::interval)::date;
      cstatus := case when i in (3, 7, 11) then 'on_hold' when i = 14 then 'canceled' else 'completed' end;
      end_d := case cstatus
        when 'completed' then (start_d + ((280 + (i % 8) * 20) || ' days')::interval)::date
        when 'canceled' then (start_d + 120)::date
        else (current_date + 90)::date
      end;
    elsif i <= 28 then
      -- Mid: started 12–24 months ago; mix of active / completed.
      start_d := (current_date - ((365 + (i - 14) * 22) || ' days')::interval)::date;
      cstatus := case when i in (18, 22) then 'completed' when i = 25 then 'on_hold' when i = 28 then 'canceled' else 'active' end;
      end_d := case cstatus
        when 'completed' then (current_date - ((10 + i % 40) || ' days')::interval)::date
        when 'canceled' then (start_d + 90)::date
        else (current_date + ((90 + i * 2) || ' days')::interval)::date
      end;
    else
      -- Recent: started within last year; mostly active.
      start_d := (current_date - ((20 + (i - 28) * 18) || ' days')::interval)::date;
      cstatus := case when i in (36) then 'on_hold' when i = 40 then 'canceled' else 'active' end;
      end_d := case cstatus
        when 'canceled' then (start_d + 45)::date
        else (current_date + ((120 + i * 3) || ' days')::interval)::date
      end;
    end if;

    oval := round((280000 + (i * 51250) + ((i % 9) * 22000))::numeric, 2);
    retain := case when ctype = 'cost_plus' then 5 else 10 end;
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
      '3-year demo seed scope for ' || cname,
      'Retainage ' || retain::text || '%. Seeded for reporting / SoD demos.',
      case when (i % 4) = 1 then client_id else null end,
      start_d
    );

    insert into public.contract_assignments (contract_id, user_id, assignment_role)
    values (cid, pm_id, 'project_manager'), (cid, field_id, 'field_supervisor');

    insert into public.customers (
      company_name, contact_name, contact_email, contact_phone,
      billing_address, city, state, postal_code, user_id, notes, is_active, contract_id, client_id
    ) values (
      client_name, split_part(client_name, ' ', 1) || ' Contact',
      case when (i % 4) = 1 then 'client@gcmanager.demo'
           else lower(replace(split_part(client_name, ' ', 1), '.', '')) || '@example.com' end,
      '312-555-' || lpad((1000 + i)::text, 4, '0'),
      addr, city, 'IL', lpad((60000 + i)::text, 5, '0'),
      case when (i % 4) = 1 then client_id else null end,
      '3yr seeded customer', true, cid, 'C' || lpad(i::text, 3, '0')
    );

    insert into public.milestones (contract_id, milestone_name, milestone_value, due_date, status) values
      (cid, 'Mobilization & Site Setup', round(oval * 0.10, 2), start_d + 30,
        case when cstatus = 'canceled' then 'pending' else 'completed' end),
      (cid, 'Structure / Shell', round(oval * 0.35, 2), start_d + 120,
        case when cstatus = 'completed' then 'completed' when cstatus = 'canceled' then 'pending' else 'in_progress' end),
      (cid, 'MEP Rough-In', round(oval * 0.25, 2), start_d + 220,
        case when cstatus = 'completed' then 'completed' else 'pending' end),
      (cid, 'Finishes & Closeout', round(oval * 0.30, 2), end_d,
        case when cstatus = 'completed' then 'completed' else 'pending' end);

    insert into public.change_orders (
      contract_id, change_order_number, description, reason, amount, status, date_submitted, date_resolved, notes
    ) values (
      cid, 'CO-' || lpad(i::text, 2, '0') || '-1',
      'Owner-directed scope add on ' || cname, 'Owner request',
      round((15000 + (i % 11) * 1800)::numeric, 2), 'approved', start_d + 45, start_d + 52, '3yr seed'
    );

    if (i % 5) = 0 and cstatus = 'active' then
      insert into public.change_orders (
        contract_id, change_order_number, description, reason, amount, status, date_submitted, notes
      ) values (
        cid, 'CO-' || lpad(i::text, 2, '0') || '-2',
        'Pending CO for approvals demo', 'Field condition',
        round((8000 + i * 100)::numeric, 2), 'pending', current_date - 5, 'Awaiting approval'
      );
    end if;

    months_active := greatest(
      1,
      (extract(year from age(least(end_d, current_date), start_d)) * 12
        + extract(month from age(least(end_d, current_date), start_d)))::int
    );
    -- Cap density so seed stays practical (~18 months of monthly rows max per job).
    months_active := least(months_active, 18);
    billed_to_date := 0;

    for m in 0..(months_active - 1) loop
      month_d := (date_trunc('month', start_d) + (m || ' months')::interval)::date + 12;
      if month_d > current_date then
        exit;
      end if;

      -- 2 cost entries per month (approved so they hit charts).
      for j in 1..2 loop
        cat := categories[1 + ((m + j + i) % 6)];
        cost_amt := round((4200 + ((m + 1) * 650) + (i * 85) + (j * 400))::numeric, 2);
        insert into public.cost_entries (
          contract_id, user_id, category, description, amount, date_incurred, notes, approval_status,
          submitted_by, submitted_at, accounting_approved_by, accounting_approved_at
        ) values (
          cid,
          case when j = 1 then field_id else pm_id end,
          cat,
          initcap(cat) || ' period ' || to_char(month_d, 'YYYY-MM') || ' — ' || cname,
          cost_amt,
          month_d + (j * 3),
          '3yr seed cost',
          'approved',
          case when j = 1 then field_id else pm_id end,
          month_d,
          accounting_id,
          month_d + 1
        );
      end loop;

      -- Field log most months.
      if cstatus <> 'canceled' and (m % 2) = 0 then
        insert into public.field_logs (
          contract_id, user_id, log_date, work_performed, hours_worked, workers_on_site,
          weather_conditions, notes
        ) values (
          cid, field_id, month_d + 5,
          'Progress through ' || to_char(month_d, 'Mon YYYY') || ' on ' || cname,
          8 + (m % 3), 5 + (i % 4), 'Clear', '3yr seed field log'
        );
      end if;

      -- Progress invoice every other month; keep cumulative billed under ~85% of value.
      if cstatus <> 'canceled' and (m % 2) = 1 then
        inv_amt := round(oval * 0.07, 2);
        if billed_to_date + inv_amt > oval * 0.85 then
          inv_amt := greatest(round(oval * 0.85 - billed_to_date, 2), 0);
        end if;
        if inv_amt > 100 then
          billed_to_date := billed_to_date + inv_amt;
          inv_status := case
            when month_d < current_date - 90 then 'paid'
            when month_d < current_date - 45 and (i % 4) = 0 then 'partially_paid'
            when month_d < current_date - 35 and (i % 6) = 0 then 'overdue'
            when month_d >= current_date - 20 then 'unpaid'
            else 'paid'
          end;
          paid_amt := case inv_status
            when 'paid' then round(inv_amt * (1 - retain / 100.0), 2)
            when 'partially_paid' then round(inv_amt * 0.45, 2)
            else 0
          end;
          inv_id := gen_random_uuid();
          insert into public.invoices (
            id, contract_id, invoice_number, invoice_date, due_date, description,
            invoice_amount, retainage_percent, retainage_amount, net_amount_due,
            amount_paid, status, notes, approval_status,
            submitted_by, submitted_at, accounting_approved_by, accounting_approved_at
          ) values (
            inv_id, cid,
            'INV-' || lpad(i::text, 2, '0') || '-' || lpad((m + 1)::text, 2, '0'),
            month_d, month_d + 30,
            'Progress billing ' || to_char(month_d, 'Mon YYYY') || ' — ' || cname,
            inv_amt, retain, round(inv_amt * retain / 100.0, 2),
            round(inv_amt * (1 - retain / 100.0), 2),
            paid_amt, inv_status, '3yr seed invoice', 'approved',
            pm_id, month_d, accounting_id, month_d + 1
          );
          if paid_amt > 0 then
            insert into public.payments (
              invoice_id, payment_amount, payment_date, payment_method, reference_number, notes,
              approval_status, submitted_by, submitted_at, accounting_approved_by, accounting_approved_at,
              approved_by, approved_at
            ) values (
              inv_id, paid_amt, month_d + 12,
              case when m % 4 = 0 then 'Check' else 'ACH' end,
              'PMT-' || lpad(i::text, 2, '0') || lpad((m + 1)::text, 2, '0'),
              '3yr seed payment',
              'posted', pm_id, month_d + 10, accounting_id, month_d + 11,
              accounting_id, month_d + 11
            );
          end if;
        end if;
      end if;
    end loop;

    sub_val := round(oval * 0.14, 2);
    sub_paid := case
      when cstatus = 'completed' then round(sub_val * 0.9, 2)
      when cstatus = 'canceled' then round(sub_val * 0.2, 2)
      else round(sub_val * 0.35, 2)
    end;

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
      sub_val, sub_paid, 10, start_d + 20, end_d,
      case when cstatus = 'completed' then 'complete' when cstatus = 'canceled' then 'terminated' else 'active' end,
      '3yr seeded subcontract package',
      case when (i % 5) = 1 then sub1_id when (i % 7) = 2 then sub2_id else null end,
      4.0 + ((i % 5) * 0.1)
    );

    insert into public.projects (
      user_id, project_name, client_name, original_contract_value, revised_contract_value,
      estimated_total_cost, start_date, end_date, status, contract_id
    ) values (
      admin_id, cname, client_name, oval, oval + 15000,
      round(oval * 0.88, 2), start_d, end_d,
      case cstatus when 'completed' then 'completed' when 'on_hold' then 'on_hold' when 'canceled' then 'on_hold' else 'active' end,
      cid
    )
    returning id into project_row_id;

    -- Mirror a slice of costs/billings into WIP tables for revenue recognition demos.
    insert into public.project_costs (project_id, user_id, cost_date, cost_category, description, amount)
    select project_row_id, admin_id, ce.date_incurred, ce.category, ce.description, ce.amount
    from public.cost_entries ce
    where ce.contract_id = cid
    order by ce.date_incurred
    limit 12;

    insert into public.billings (
      user_id, project_id, billing_number, billing_date, amount_billed, retainage_held, net_amount, status
    )
    select
      admin_id, project_row_id, i.invoice_number, i.invoice_date,
      i.invoice_amount, i.retainage_amount, i.net_amount_due, 'submitted'
    from public.invoices i
    where i.contract_id = cid and i.approval_status = 'approved'
    order by i.invoice_date
    limit 10;
  end loop;

  -- SoD demo: PM-submitted payment awaiting Accounting (same-person block unless override).
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
    'SOD-PMT-DEMO-01',
    'DEMO — payment awaiting Accounting approval (SoD)',
    'pending_accounting',
    p.id,
    now() - interval '1 day'
  from public.invoices i
  cross join public.user_profiles p
  where i.status in ('unpaid', 'partially_paid', 'overdue')
    and i.approval_status = 'approved'
    and coalesce(i.net_amount_due, 0) > coalesce(i.amount_paid, 0) + 1000
    and p.email = 'pm@gcmanager.demo'
  order by i.invoice_date desc
  limit 1
  on conflict (id) do update set
    approval_status = 'pending_accounting',
    notes = excluded.notes,
    submitted_by = excluded.submitted_by;

  -- Pending cost for Approvals / SoD queue.
  insert into public.cost_entries (
    contract_id, user_id, category, description, amount, date_incurred, notes,
    approval_status, submitted_by, submitted_at
  )
  select
    c.id, p.id, 'labor', 'DEMO — cost awaiting Accounting (SoD)',
    18500.00, current_date - 2, 'Pending approval sample',
    'pending_accounting', p.id, now() - interval '2 days'
  from public.contracts c
  cross join public.user_profiles p
  where c.status = 'active'
    and p.email = 'pm@gcmanager.demo'
  order by c.start_date desc
  limit 1;

  insert into public.access_audit_log (actor_user_id, action, entity_type, entity_id, details)
  values (
    admin_id,
    'seed_3yr_completed',
    'system',
    null,
    jsonb_build_object('contracts', 40, 'span_years', 3, 'sod_override', true)
  );
end $$;

alter table public.invoices enable trigger trg_enforce_invoice_billing_guards;
alter table public.payments enable trigger trg_enforce_payment_amount_positive;
alter table public.invoices enable trigger trg_sync_invoice_wip_billings;
