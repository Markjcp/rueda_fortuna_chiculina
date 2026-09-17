-- Run once in Supabase SQL Editor. Safe to rerun; does not delete progress.
begin;

create table if not exists public.chicu_spins (
  campaign text not null default 'chicu-2026' check (campaign = 'chicu-2026'),
  request_id uuid not null,
  spin_date date not null check (spin_date between date '2026-09-16' and date '2026-12-21'),
  slot smallint not null check (slot in (1, 2)),
  prize_id smallint not null check (prize_id between 1 and 83),
  created_at timestamptz not null default now(),
  primary key (campaign, request_id),
  unique (campaign, spin_date, slot),
  unique (campaign, prize_id),
  check (extract(isodow from spin_date) between 1 and 5),
  check (slot = 1 or extract(isodow from spin_date) = 1)
);

alter table public.chicu_spins enable row level security;
-- No direct table access. Only the two narrow RPC functions below are public.
revoke all on public.chicu_spins from public, anon, authenticated;

-- One shared family collection. Anyone with the site link can read and spin.
create or replace function public.chicu_state()
returns jsonb language plpgsql security definer set search_path = '' as $$
begin
  return jsonb_build_object(
    'server_time', clock_timestamp(),
    'spins', coalesce((select jsonb_agg(to_jsonb(s) order by s.created_at)
      from public.chicu_spins s where s.campaign = 'chicu-2026'), '[]'::jsonb)
  );
end;
$$;

-- One transaction chooses AND saves the number. The client never picks a real prize.
create or replace function public.chicu_spin(p_request_id uuid)
returns public.chicu_spins language plpgsql security definer set search_path = '' as $$
declare
  v_local timestamp;
  v_date date;
  v_allowed integer;
  v_count integer;
  v_prize integer;
  v_result public.chicu_spins;
begin
  if p_request_id is null then raise exception 'CHICU_REQUEST_REQUIRED'; end if;

  -- Serialize all family spins, including simultaneous clicks on different devices.
  perform pg_advisory_xact_lock(hashtextextended('chicu-2026', 0));
  select * into v_result from public.chicu_spins
    where campaign = 'chicu-2026' and request_id = p_request_id;
  if found then return v_result; end if;

  v_local := clock_timestamp() at time zone 'America/Argentina/Buenos_Aires';
  v_date := v_local::date;
  if v_date < date '2026-09-16' or v_date > date '2026-12-21' then
    raise exception 'CHICU_OUTSIDE_CAMPAIGN';
  end if;
  if extract(isodow from v_date) > 5 then raise exception 'CHICU_WEEKEND'; end if;
  v_allowed := case when extract(isodow from v_date) = 1 and v_local::time >= time '12:00' then 2 else 1 end;
  select count(*) into v_count from public.chicu_spins
    where campaign = 'chicu-2026' and spin_date = v_date;
  if v_count >= v_allowed then raise exception 'CHICU_DAILY_LIMIT'; end if;

  select n into v_prize from generate_series(1, 83) as numbers(n)
    where not exists (select 1 from public.chicu_spins s
      where s.campaign = 'chicu-2026' and s.prize_id = n)
    order by random() limit 1;
  if v_prize is null then raise exception 'CHICU_COMPLETE'; end if;

  insert into public.chicu_spins(request_id, spin_date, slot, prize_id)
    values (p_request_id, v_date, v_count + 1, v_prize) returning * into v_result;
  return v_result;
end;
$$;

revoke all on function public.chicu_state() from public, anon, authenticated;
revoke all on function public.chicu_spin(uuid) from public, anon, authenticated;
grant execute on function public.chicu_state() to anon, authenticated;
grant execute on function public.chicu_spin(uuid) to anon, authenticated;
commit;
