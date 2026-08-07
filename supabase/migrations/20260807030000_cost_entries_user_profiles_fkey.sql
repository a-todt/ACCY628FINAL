-- PostgREST embed `cost_entries.select('..., user_profiles(...)')` needs an FK
-- to public.user_profiles (auth.users alone is not enough for that relationship).
do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'cost_entries_user_profiles_fkey'
  ) then
    alter table public.cost_entries
      add constraint cost_entries_user_profiles_fkey
      foreign key (user_id) references public.user_profiles (id)
      on delete set null;
  end if;
exception
  when others then
    raise notice 'skip cost_entries_user_profiles_fkey: %', sqlerrm;
end $$;
