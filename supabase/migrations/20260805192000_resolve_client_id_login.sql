-- Resolve Client ID → login email (after customer has claimed access)
create or replace function public.resolve_client_id_login(p_client_id text)
returns text
language plpgsql
security definer
set search_path = public
stable
as $$
declare
  v_email text;
begin
  select coalesce(up.email, c.contact_email)
  into v_email
  from public.customers c
  left join public.user_profiles up on up.id = c.user_id
  where upper(c.client_id) = upper(trim(p_client_id))
    and c.user_id is not null
  limit 1;

  if v_email is null or length(trim(v_email)) = 0 then
    raise exception 'Client ID not found or not activated yet. Use your setup code first, or sign in with email.';
  end if;

  return lower(trim(v_email));
end;
$$;

revoke all on function public.resolve_client_id_login(text) from public;
grant execute on function public.resolve_client_id_login(text) to anon, authenticated;
