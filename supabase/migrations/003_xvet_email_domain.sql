-- Reject non-XVET emails at the database, even if the client is bypassed.
create or replace function public.enforce_xvet_email()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.email is null or new.email !~* '@([a-z0-9-]+\.)*xvetgermany\.com$' then
    raise exception 'Only @xvetgermany.com emails can be used';
  end if;
  return new;
end;
$$;

drop trigger if exists enforce_xvet_email on auth.users;
create trigger enforce_xvet_email
  before insert or update of email on auth.users
  for each row execute procedure public.enforce_xvet_email();
