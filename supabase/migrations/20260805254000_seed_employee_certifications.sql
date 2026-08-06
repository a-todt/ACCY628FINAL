-- Seed demo employee certifications / licenses for ownership visibility

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
    ('pm@gcmanager.demo', 'PMP', 'PMP-204418', 'PMI', '2023-01-15', '2026-08-25', 'Project management professional'),
    ('pm@gcmanager.demo', 'OSHA 30', 'OSHA30-11802', 'OSHA', '2024-03-01', '2027-03-01', 'Construction safety'),
    ('pm2@gcmanager.demo', 'LEED AP BD+C', 'LEED-55190', 'USGBC', '2022-06-10', '2026-12-31', null),
    ('pm2@gcmanager.demo', 'Illinois GC License', 'IL-GC-88901', 'State of Illinois', '2021-05-01', '2027-04-30', 'Company qualifying party'),
    ('field@gcmanager.demo', 'OSHA 30', 'OSHA30-22011', 'OSHA', '2024-01-20', '2027-01-20', null),
    ('field@gcmanager.demo', 'First Aid / CPR', 'AHA-44102', 'American Heart Association', '2025-02-01', '2027-02-01', null),
    ('field2@gcmanager.demo', 'Scaffold Competent Person', 'SCP-9022', 'Scaffold Training Institute', '2024-08-15', '2026-08-15', 'Expiring soon'),
    ('owner@gcmanager.demo', 'Illinois Qualifying Party', 'IL-QP-10001', 'State of Illinois', '2020-01-01', '2027-12-31', 'Owner license holder')
) as v(email, certification_name, certification_number, issuing_body, issued_date, expiration_date, notes)
  on lower(up.email) = lower(v.email)
where not exists (
  select 1
  from public.employee_certifications ec
  where ec.user_id = up.id
    and ec.certification_name = v.certification_name
);
