-- Execute in Supabase SQL Editor for the Ateliê Manager app.
-- Each authenticated account can access only its own snapshot and backups.

create table if not exists public.atelie_snapshots (
  owner_id uuid primary key references auth.users (id) on delete cascade,
  data jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now()
);

alter table public.atelie_snapshots enable row level security;

drop policy if exists "Owners can read their snapshot" on public.atelie_snapshots;
create policy "Owners can read their snapshot"
  on public.atelie_snapshots for select to authenticated
  using ((select auth.uid()) = owner_id);

drop policy if exists "Owners can create their snapshot" on public.atelie_snapshots;
create policy "Owners can create their snapshot"
  on public.atelie_snapshots for insert to authenticated
  with check ((select auth.uid()) = owner_id);

drop policy if exists "Owners can update their snapshot" on public.atelie_snapshots;
create policy "Owners can update their snapshot"
  on public.atelie_snapshots for update to authenticated
  using ((select auth.uid()) = owner_id)
  with check ((select auth.uid()) = owner_id);

revoke all on public.atelie_snapshots from public, anon, authenticated;
grant select, insert, update on public.atelie_snapshots to authenticated;

create table if not exists public.atelie_snapshot_backups (
  id bigint generated always as identity primary key,
  owner_id uuid not null references auth.users (id) on delete cascade,
  source text not null,
  data jsonb not null,
  created_at timestamptz not null default now()
);

alter table public.atelie_snapshot_backups enable row level security;

drop policy if exists "Owners can read their backups" on public.atelie_snapshot_backups;
create policy "Owners can read their backups"
  on public.atelie_snapshot_backups for select to authenticated
  using ((select auth.uid()) = owner_id);

drop policy if exists "Owners can create their backups" on public.atelie_snapshot_backups;
create policy "Owners can create their backups"
  on public.atelie_snapshot_backups for insert to authenticated
  with check ((select auth.uid()) = owner_id);

revoke all on public.atelie_snapshot_backups from public, anon, authenticated;
grant select, insert on public.atelie_snapshot_backups to authenticated;
revoke all on sequence public.atelie_snapshot_backups_id_seq from public, anon, authenticated;
grant usage, select on sequence public.atelie_snapshot_backups_id_seq to authenticated;
