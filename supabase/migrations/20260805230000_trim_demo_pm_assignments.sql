-- Demo PM should only be assigned to a subset of projects (not every contract).

delete from public.contract_assignments ca
using public.user_profiles up
where ca.user_id = up.id
  and up.email = 'pm@gcmanager.demo'
  and ca.contract_id not in (
    'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaa1', -- Downtown Office Tower Renovation
    'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaa2', -- Riverside Medical Center Expansion
    'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaa3'  -- Lakeside Apartments Phase 2
  );

-- Ensure those three assignments exist for the demo PM
insert into public.contract_assignments (contract_id, user_id, assignment_role)
select c.id, p.id, 'project_manager'
from public.contracts c
cross join public.user_profiles p
where p.email = 'pm@gcmanager.demo'
  and c.id in (
    'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaa1',
    'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaa2',
    'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaa3'
  )
  and not exists (
    select 1
    from public.contract_assignments ca
    where ca.contract_id = c.id
      and ca.user_id = p.id
  );
