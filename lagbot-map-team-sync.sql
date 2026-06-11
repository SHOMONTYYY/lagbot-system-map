-- ════════════════════════════════════════════════════════════════════
-- Lagbot System Map — team sync setup (run ONCE per Supabase project)
--
-- How to use:
--   1. Create a FREE dedicated project at https://supabase.com
--      (don't reuse the Lagbot production project — its public key is
--       inside the mobile app, so outsiders could read this map there)
--   2. In the Supabase dashboard: SQL Editor → New query → paste ALL of
--      this file → Run.
--   3. In the dashboard: Project Settings → API → copy the "Project URL"
--      and the "anon public" key.
--   4. In the map: ☁ Sync → paste both → Save & connect.
--   5. Send your dev the map HTML file + the same URL and anon key.
--      They paste them into ☁ Sync once and everyone is live-connected.
-- ════════════════════════════════════════════════════════════════════

-- the single shared map document
create table if not exists public.sysmap (
  id         text primary key,
  doc        jsonb not null,
  updated_at timestamptz not null default now(),
  updated_by text,
  client_id  text
);

-- lock it down to row-level-security, then allow the anon key
-- (anyone holding this project's anon key = your team) to read & write
alter table public.sysmap enable row level security;

drop policy if exists "sysmap read"   on public.sysmap;
drop policy if exists "sysmap insert" on public.sysmap;
drop policy if exists "sysmap update" on public.sysmap;

create policy "sysmap read"   on public.sysmap for select to anon, authenticated using (true);
create policy "sysmap insert" on public.sysmap for insert to anon, authenticated with check (true);
create policy "sysmap update" on public.sysmap for update to anon, authenticated using (true);

-- turn on live updates so everyone's screen refreshes when someone saves
alter publication supabase_realtime add table public.sysmap;
