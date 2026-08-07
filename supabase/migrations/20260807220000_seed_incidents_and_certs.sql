-- Demo safety incidents + employee certifications (wiped by 3yr ops seed).

delete from public.safety_incidents where true;
delete from public.employee_certifications where true;

-- ---------------------------------------------------------------------------
-- Safety / incident logs (mix of open/closed across live contracts)
-- ---------------------------------------------------------------------------
insert into public.safety_incidents (
  contract_id, reported_by, incident_date, incident_type, severity, status,
  injured_party, description, corrective_action, notes
)
select
  c.id,
  up.id,
  v.incident_date::date,
  v.incident_type,
  v.severity,
  v.status,
  v.injured_party,
  v.description,
  v.corrective_action,
  v.notes
from (
  values
    -- Recent / open (dashboard pulse)
    (1, 'field@gcmanager.demo', current_date - 2, 'injury', 'medium', 'open',
      'Electrician apprentice (sub)',
      'Apprentice received a minor shock while landing conduit near an energized panel.',
      'Lockout/tagout refresher scheduled; panel labeled and barricaded.',
      'First aid administered on site; no hospital visit.'),
    (2, 'pm@gcmanager.demo', current_date - 5, 'near_miss', 'high', 'open',
      null,
      'Unsecured scaffold plank shifted when a worker stepped on it; no fall occurred.',
      'Scaffold inspected and tagged; daily scaffold checklist enforced.',
      'Reported during morning stretch-and-flex.'),
    (3, 'field2@gcmanager.demo', current_date - 8, 'injury', 'low', 'open',
      'Field crew member',
      'Minor cut to hand from metal edge while installing decking. First aid only.',
      'Cut-resistant gloves required for decking install.',
      null),
    (4, 'pm2@gcmanager.demo', current_date - 11, 'property_damage', 'medium', 'open',
      null,
      'Forklift brushed a finished drywall corner while staging materials in corridor B.',
      'Spotter required in finished corridors; damaged corner patched.',
      'Client notified; patch in progress.'),
    (5, 'field3@gcmanager.demo', current_date - 14, 'other', 'low', 'open',
      null,
      'Visitor entered active work zone without hard hat during owner walkthrough.',
      'Gate escort policy restated; visitor PPE kit restocked at trailer.',
      'No injury.'),

    -- Closed recent
    (6, 'field@gcmanager.demo', current_date - 28, 'injury', 'medium', 'closed',
      'Subcontractor laborer (drywall)',
      'Worker strained lower back while lifting sheetrock without a panel lift.',
      'Toolbox talk on lifting; panel lift required for sheets over 4x8.',
      'Returned to work next day with restrictions.'),
    (7, 'pm3@gcmanager.demo', current_date - 35, 'near_miss', 'medium', 'closed',
      null,
      'Suspended load swung toward pedestrian path when tag line was dropped.',
      'Tag-line mandatory checklist added to crane pick permits.',
      null),
    (8, 'field4@gcmanager.demo', current_date - 42, 'property_damage', 'low', 'closed',
      null,
      'Paint overspray on adjacent storefront glass during exterior coating.',
      'Masking protocol updated; glass cleaned same day.',
      'No claim filed.'),

    -- Mid history (2025)
    (9, 'pm@gcmanager.demo', '2025-11-18', 'injury', 'high', 'closed',
      'Ironworker (sub)',
      'Fall from ladder after rung slip; sprained ankle. Transported to urgent care.',
      'Ladder inspection tags reissued; step-ladder use banned for elevations over 6 ft.',
      'OSHA recordable; full investigation closed.'),
    (10, 'field5@gcmanager.demo', '2025-09-03', 'near_miss', 'high', 'closed',
      null,
      'Excavator boom contacted overhead power line clearance envelope; power not interrupted.',
      'Spotter + utility locate re-walk; 10 ft clearance flagged with cones.',
      'Utility company consulted.'),
    (11, 'pm2@gcmanager.demo', '2025-06-21', 'injury', 'low', 'closed',
      'Carpenter',
      'Splinter under fingernail while handling rough lumber. First aid.',
      'Gloves required for rough lumber handling.',
      null),
    (12, 'field@gcmanager.demo', '2025-03-14', 'property_damage', 'medium', 'closed',
      null,
      'Water from temporary hose flooded unfinished slab overnight.',
      'End-of-day hose shutoff checklist added to field close-out.',
      'Slab dried; no structural impact.'),
    (1, 'field6@gcmanager.demo', '2025-01-09', 'other', 'low', 'closed',
      null,
      'Chemical spill of small solvent can in laydown yard; contained with absorbent.',
      'SDS binder reviewed; spill kit relocated closer to storage.',
      'EPA reportable threshold not met.'),

    -- Older history (2024 / 2023)
    (2, 'pm4@gcmanager.demo', '2024-10-02', 'injury', 'medium', 'closed',
      'Masonry helper',
      'Brick struck knee after scaffold toe-board failure.',
      'Toe boards audited site-wide; damaged boards replaced.',
      null),
    (3, 'field2@gcmanager.demo', '2024-07-19', 'near_miss', 'medium', 'closed',
      null,
      'Rebar delivery truck rolled through uncontrolled intersection on site road.',
      'Flagger posted at intersection during deliveries.',
      null),
    (4, 'pm@gcmanager.demo', '2024-04-08', 'property_damage', 'high', 'closed',
      null,
      'Crane pick brushed curtain wall mullion causing cracked glass panel.',
      'Pick radius redrawn; glass panel replaced under sub insurance.',
      'Insurance claim closed.'),
    (5, 'field3@gcmanager.demo', '2024-01-22', 'injury', 'low', 'closed',
      'Field supervisor',
      'Twisted ankle on icy temporary walkway before dawn shift.',
      'Salt/sand staging at trailer; walkway mats installed.',
      null),
    (6, 'pm5@gcmanager.demo', '2023-11-30', 'near_miss', 'high', 'closed',
      null,
      'Worker almost struck by reversing skid steer in staging area; horns not used.',
      'Backup alarm check added to equipment daily; high-vis required in yard.',
      'All-hands safety stand-down held.'),
    (7, 'field@gcmanager.demo', '2023-09-15', 'injury', 'medium', 'closed',
      'HVAC tech (sub)',
      'Flash burn to forearm from hot solder during rooftop piping.',
      'FR sleeves required for soldering; burn kit restocked.',
      'Clinic visit; light duty 3 days.'),
    (8, 'pm2@gcmanager.demo', '2023-06-05', 'other', 'low', 'closed',
      null,
      'Unauthorized photo of unfinished client space posted to personal social media.',
      'Jobsite media policy toolbox talk; phones restricted in client areas.',
      'Post removed; client satisfied.')
) as v(
  ord, reporter_email, incident_date, incident_type, severity, status,
  injured_party, description, corrective_action, notes
)
join lateral (
  select id
  from public.contracts
  order by created_at
  offset (v.ord - 1)
  limit 1
) c on true
left join public.user_profiles up on lower(up.email) = lower(v.reporter_email);

-- ---------------------------------------------------------------------------
-- Employee certifications / licenses (valid, expiring, expired mix)
-- ---------------------------------------------------------------------------
insert into public.employee_certifications (
  user_id, certification_name, certification_number, issuing_body,
  issued_date, expiration_date, notes
)
select
  up.id,
  v.certification_name,
  v.certification_number,
  v.issuing_body,
  v.issued_date::date,
  v.expiration_date::date,
  v.notes
from public.user_profiles up
join (
  values
    -- Project managers
    ('pm@gcmanager.demo', 'PMP', 'PMP-204418', 'PMI', '2023-01-15', '2026-08-25', 'Expiring soon — renewal in progress'),
    ('pm@gcmanager.demo', 'OSHA 30', 'OSHA30-11802', 'OSHA', '2024-03-01', '2027-03-01', 'Construction safety'),
    ('pm@gcmanager.demo', 'First Aid / CPR', 'AHA-88021', 'American Heart Association', '2024-06-01', '2026-06-01', 'Expired — schedule refresh'),
    ('pm2@gcmanager.demo', 'LEED AP BD+C', 'LEED-55190', 'USGBC', '2022-06-10', '2026-12-31', null),
    ('pm2@gcmanager.demo', 'Illinois GC License', 'IL-GC-88901', 'State of Illinois', '2021-05-01', '2027-04-30', 'Company qualifying party'),
    ('pm2@gcmanager.demo', 'OSHA 30', 'OSHA30-44110', 'OSHA', '2023-09-12', '2026-09-12', null),
    ('pm3@gcmanager.demo', 'OSHA 30', 'OSHA30-55201', 'OSHA', '2024-05-20', '2027-05-20', null),
    ('pm3@gcmanager.demo', 'PMP', 'PMP-319902', 'PMI', '2024-02-01', '2027-02-01', null),
    ('pm4@gcmanager.demo', 'OSHA 30', 'OSHA30-66012', 'OSHA', '2023-11-01', '2026-11-01', null),
    ('pm4@gcmanager.demo', 'Confined Space Entrant', 'CSE-1204', 'National Safety Council', '2024-08-01', '2026-08-10', 'Expiring this month'),
    ('pm5@gcmanager.demo', 'OSHA 30', 'OSHA30-77033', 'OSHA', '2025-01-15', '2028-01-15', null),
    ('pm5@gcmanager.demo', 'Illinois GC License', 'IL-GC-90221', 'State of Illinois', '2022-03-01', '2025-03-01', 'Expired — renew before next bid'),

    -- Field supervisors
    ('field@gcmanager.demo', 'OSHA 30', 'OSHA30-22011', 'OSHA', '2024-01-20', '2027-01-20', null),
    ('field@gcmanager.demo', 'First Aid / CPR', 'AHA-44102', 'American Heart Association', '2025-02-01', '2027-02-01', null),
    ('field@gcmanager.demo', 'Forklift Operator', 'FL-33881', 'National Safety Council', '2023-05-01', '2026-05-01', 'Expired'),
    ('field2@gcmanager.demo', 'Scaffold Competent Person', 'SCP-9022', 'Scaffold Training Institute', '2024-08-15', '2026-08-15', 'Expiring soon'),
    ('field2@gcmanager.demo', 'OSHA 30', 'OSHA30-90122', 'OSHA', '2024-04-10', '2027-04-10', null),
    ('field3@gcmanager.demo', 'OSHA 30', 'OSHA30-11233', 'OSHA', '2023-08-01', '2026-08-01', 'Expired this week'),
    ('field3@gcmanager.demo', 'First Aid / CPR', 'AHA-55210', 'American Heart Association', '2024-09-01', '2026-09-01', null),
    ('field4@gcmanager.demo', 'OSHA 10', 'OSHA10-44190', 'OSHA', '2025-03-01', '2028-03-01', null),
    ('field4@gcmanager.demo', 'Aerial Lift Operator', 'AL-77801', 'IPAF', '2024-10-01', '2026-10-01', null),
    ('field5@gcmanager.demo', 'OSHA 30', 'OSHA30-33440', 'OSHA', '2024-07-15', '2027-07-15', null),
    ('field5@gcmanager.demo', 'Crane Signal Person', 'CSP-2201', 'NCCCO', '2023-12-01', '2026-12-01', null),
    ('field6@gcmanager.demo', 'OSHA 30', 'OSHA30-99881', 'OSHA', '2025-01-01', '2028-01-01', null),
    ('field6@gcmanager.demo', 'HazMat Awareness', 'HAZ-4411', 'FEMA / DHS', '2024-02-15', '2026-02-15', 'Expired'),

    -- Accounting (owner) + admin
    ('accounting@gcmanager.demo', 'Illinois Qualifying Party', 'IL-QP-10001', 'State of Illinois', '2020-01-01', '2027-12-31', 'Owner license holder'),
    ('accounting@gcmanager.demo', 'CPA', 'IL-CPA-441902', 'State of Illinois', '2018-06-01', '2026-09-30', 'License renewal due Q3'),
    ('admin@gcmanager.demo', 'OSHA 10', 'OSHA10-admin01', 'OSHA', '2024-01-01', '2027-01-01', 'Office awareness course')
) as v(email, certification_name, certification_number, issuing_body, issued_date, expiration_date, notes)
  on lower(up.email) = lower(v.email);
