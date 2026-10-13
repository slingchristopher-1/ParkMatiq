-- ParkMatiq — Supabase schema (auth + sync test, 2026-07).
-- Run once in the Supabase dashboard: SQL Editor -> New query -> paste -> Run.
-- Idempotent: safe to re-run.

-- One row per user. Settings and the active session ride along as jsonb so the
-- client model (utils/storage.js) maps 1:1 without schema churn during the test.
create table if not exists public.profiles (
  id             uuid primary key references auth.users (id) on delete cascade,
  name           text,
  plate          text,
  email          text,
  settings       jsonb,
  active_session jsonb,
  updated_at     timestamptz not null default now()
);

-- Completed parking sessions. id = client-side start timestamp (ms since epoch),
-- unique per user. Full session object lives in `data` (jsonb).
create table if not exists public.sessions (
  user_id    uuid not null references auth.users (id) on delete cascade,
  id         bigint not null,
  data       jsonb not null,
  created_at timestamptz not null default now(),
  primary key (user_id, id)
);

-- Table grants: Supabase projects no longer auto-grant table access to the
-- authenticated role (secure-by-default, 2025+) — without these, every write
-- fails with "permission denied" (403) before RLS is even evaluated.
grant usage on schema public to authenticated;
grant select, insert, update, delete on public.profiles to authenticated;
grant select, insert, update, delete on public.sessions to authenticated;

-- Row Level Security: users can only touch their own rows. This is the GDPR
-- backbone — without a matching auth.uid() no row is readable or writable,
-- even with the publishable key.
alter table public.profiles enable row level security;
alter table public.sessions enable row level security;

drop policy if exists "own profile" on public.profiles;
create policy "own profile" on public.profiles
  for all using (auth.uid() = id) with check (auth.uid() = id);

drop policy if exists "own sessions" on public.sessions;
create policy "own sessions" on public.sessions
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

-- GDPR right to erasure: lets a signed-in user delete their own auth account
-- from the client (anon key can't touch auth.users directly). profiles and
-- sessions rows are removed via the on delete cascade above.
create or replace function public.delete_user()
returns void
language sql
security definer
set search_path = ''
as $$
  delete from auth.users where id = auth.uid();
$$;

revoke execute on function public.delete_user() from anon, public;
grant execute on function public.delete_user() to authenticated;
