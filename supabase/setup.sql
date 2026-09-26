-- HEMA Space Passport — database setup.
-- Run once: Supabase → SQL Editor → New query → paste this whole file → Run.
-- Safe to run again (it only adds what is missing and refreshes the functions and rules).

-- 1. Passports ------------------------------------------------------------
create table if not exists public.passports (
  id           bigint generated always as identity primary key,
  serial       text        not null,
  first_name   text        not null,
  second_name  text        not null,
  third_name   text        not null default '',
  age          int         not null check (age between 1 and 120),
  origin       text        not null,
  callsign     text        not null,
  destination  int         not null,
  role         int         not null,
  mission      int         not null,
  issued       date        not null,
  created_at   timestamptz not null default now(),
  offline      boolean     not null default false,  -- issued while the kiosk had no internet, saved later
  photo        text,                                -- 360×480 JPEG (data URL)
  photo_thumb  text                                 -- 96×128 JPEG (data URL) for the admin list
);
create index if not exists passports_created_idx on public.passports (created_at desc);
create index if not exists passports_serial_idx  on public.passports (serial);

-- 2. Who may open the admin page ----------------------------------------
-- Add more organisers later with:  insert into public.admins (email) values ('someone@example.com');
create table if not exists public.admins (email text primary key);
insert into public.admins (email) values ('redyar8r@gmail.com') on conflict do nothing;

create or replace function public.is_admin() returns boolean
language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.admins
    where lower(email) = lower(coalesce(auth.jwt() ->> 'email', ''))
  );
$$;

-- 3. Rules (row level security) ------------------------------------------
-- Visitors cannot read, change or delete anything. They can only add a passport through issue_passport().
-- Signed-in admins can read and delete.
alter table public.passports enable row level security;
alter table public.admins    enable row level security;

revoke all on public.passports from anon, authenticated;
revoke all on public.admins    from anon, authenticated;
grant select, delete on public.passports to authenticated;

drop policy if exists "admins read passports"   on public.passports;
drop policy if exists "admins delete passports" on public.passports;
create policy "admins read passports"   on public.passports for select to authenticated using (public.is_admin());
create policy "admins delete passports" on public.passports for delete to authenticated using (public.is_admin());

-- 4. Issuing a passport (called by the website) ---------------------------
-- Checks the data, gives out a unique passport number and saves the record.
-- Passports issued while the kiosk was offline arrive later with their number already printed (p_serial).
create or replace function public.issue_passport(
  p_first       text,
  p_second      text,
  p_third       text,
  p_age         int,
  p_origin      text,
  p_callsign    text,
  p_destination int,
  p_role        int,
  p_mission     int,
  p_photo       text        default null,
  p_photo_thumb text        default null,
  p_serial      text        default null,
  p_issued      date        default null,
  p_created     timestamptz default null
) returns json
language plpgsql volatile security definer set search_path = public as $$
declare
  v_serial  text;
  v_issued  date;
  v_offline boolean := coalesce(p_serial ~ '^[0-9]{6}$', false);
  v_tries   int := 0;
begin
  p_first    := left(btrim(regexp_replace(coalesce(p_first, ''),    '\s+', ' ', 'g')), 24);
  p_second   := left(btrim(regexp_replace(coalesce(p_second, ''),   '\s+', ' ', 'g')), 24);
  p_third    := left(btrim(regexp_replace(coalesce(p_third, ''),    '\s+', ' ', 'g')), 24);
  p_origin   := left(btrim(regexp_replace(coalesce(p_origin, ''),   '\s+', ' ', 'g')), 48);
  p_callsign := upper(left(btrim(coalesce(p_callsign, '')), 16));

  if p_first = '' or p_second = '' or p_origin = '' or p_callsign = ''
     or p_age is null or p_age not between 1 and 120
     or p_destination is null or p_destination not between 0 and 5
     or p_role is null or p_role not between 0 and 7
     or p_mission is null or p_mission not between 0 and 5 then
    raise exception 'Invalid passport data' using errcode = '22023';
  end if;

  -- only small JPEGs are kept
  if p_photo is not null and (left(p_photo, 23) <> 'data:image/jpeg;base64,' or length(p_photo) > 200000) then
    p_photo := null;
  end if;
  if p_photo_thumb is not null and (left(p_photo_thumb, 23) <> 'data:image/jpeg;base64,' or length(p_photo_thumb) > 30000) then
    p_photo_thumb := null;
  end if;

  if v_offline then
    v_serial := p_serial;
  else
    loop
      v_serial := lpad((1 + floor(random() * 999999))::int::text, 6, '0');
      exit when not exists (select 1 from public.passports p where p.serial = v_serial);
      v_tries := v_tries + 1;
      if v_tries > 50 then raise exception 'Could not allocate a passport number'; end if;
    end loop;
  end if;

  -- dates are Erbil time
  v_issued := case
    when v_offline and p_issued between date '2026-01-01' and (now() at time zone 'Asia/Baghdad')::date then p_issued
    else (now() at time zone 'Asia/Baghdad')::date
  end;

  insert into public.passports (serial, first_name, second_name, third_name, age, origin, callsign,
                                destination, role, mission, issued, created_at, offline, photo, photo_thumb)
  values (v_serial, p_first, p_second, p_third, p_age, p_origin, p_callsign,
          p_destination, p_role, p_mission, v_issued,
          case when v_offline and p_created between now() - interval '30 days' and now() then p_created else now() end,
          v_offline, p_photo, p_photo_thumb);

  return json_build_object('serial', v_serial, 'issued', v_issued);
end;
$$;

revoke all on function public.issue_passport(text, text, text, int, text, text, int, int, int, text, text, text, date, timestamptz) from public;
grant execute on function public.issue_passport(text, text, text, int, text, text, int, int, int, text, text, text, date, timestamptz) to anon, authenticated;
revoke all on function public.is_admin() from public;
grant execute on function public.is_admin() to authenticated;
