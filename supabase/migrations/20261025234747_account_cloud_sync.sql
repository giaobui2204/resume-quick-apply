-- Cloud workspace support. The browser may keep a local workspace as a guest,
-- but authenticated records are owned by auth.uid() and never contain raw files.

-- Resume rows represent extracted profiles, not uploaded file blobs. Keep the
-- existing column names for compatibility, while allowing manual resumes.
alter table public.resume_documents
  alter column storage_path drop not null,
  alter column mime_type drop not null,
  alter column byte_size set default 0,
  alter column sha256 drop not null;
alter table public.resume_documents drop constraint resume_documents_mime_type_check;
alter table public.resume_documents add constraint resume_documents_mime_type_check
  check (mime_type is null or mime_type in (
    'application/pdf', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
  ));
alter table public.resume_documents drop constraint resume_documents_byte_size_check;
alter table public.resume_documents add constraint resume_documents_byte_size_check
  check (byte_size between 0 and 10485760);
alter table public.resume_documents add column display_name text not null default 'Resume';
alter table public.resume_documents add column updated_at timestamptz not null default now();

-- Keep ATS identity separate from the feed that surfaced a job. Feed jobs may
-- have no supported ATS, while imported postings can identify one directly.
alter table public.jobs alter column ats drop not null;
alter table public.jobs drop constraint jobs_ats_check;
alter table public.jobs add constraint jobs_ats_check
  check (ats is null or ats in ('greenhouse', 'lever', 'ashby'));
alter table public.jobs add column provider text;
alter table public.jobs add column source_url text;
alter table public.jobs add column attribution jsonb;
alter table public.jobs add column posted_date date;
alter table public.jobs add column classification jsonb;
alter table public.jobs add constraint jobs_provider_check
  check (provider is null or provider in ('greenhouse', 'lever', 'ashby', 'remotive', 'himalayas', 'remoteok'));
alter table public.applications add column opened_at timestamptz;
alter table public.applications add column outcome_source text
  check (outcome_source is null or outcome_source = 'self_report');

-- Keep hash deduplication database-enforced across simultaneous device imports.
-- The prior index also included hash-less manual resumes, which do not need it.
drop index if exists public.resume_documents_live_hash;
create unique index resume_documents_live_hash
  on public.resume_documents(user_id, sha256)
  where sha256 is not null and deleted_at is null;

-- Work authorization sync requires a separate opt-in. Absence of a row means
-- that sensitive answers remain on the current device.
create table public.user_sync_preferences (
  user_id uuid primary key references auth.users(id) on delete cascade,
  sync_work_authorization boolean not null default false,
  updated_at timestamptz not null default now()
);
alter table public.user_sync_preferences enable row level security;
create policy "users read own sync preferences" on public.user_sync_preferences
  for select to authenticated using ((select auth.uid()) = user_id);
create policy "users insert own sync preferences" on public.user_sync_preferences
  for insert to authenticated with check ((select auth.uid()) = user_id);
create policy "users update own sync preferences" on public.user_sync_preferences
  for update to authenticated using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);
create policy "users delete own sync preferences" on public.user_sync_preferences
  for delete to authenticated using ((select auth.uid()) = user_id);

-- Enforce tenant ownership across foreign-key relationships. RLS on the child
-- row alone does not prove a referenced row belongs to the same user.
create function public.check_application_job_owner() returns trigger
language plpgsql set search_path = '' as $$
begin
  if not exists (
    select 1 from public.jobs j where j.id = new.job_id and j.user_id = new.user_id
  ) then
    raise exception 'Job must belong to the application owner';
  end if;
  return new;
end;
$$;
create trigger application_job_owner before insert or update of job_id, user_id
on public.applications for each row execute function public.check_application_job_owner();

-- Foreign keys prove that a resume exists, but ownership must match the app.
create or replace function public.check_application_resume_owner() returns trigger
language plpgsql set search_path = '' as $$
begin
  if new.resume_id is not null and not exists (
    select 1 from public.resume_documents r where r.id = new.resume_id and r.user_id = new.user_id
  ) then
    raise exception 'Resume must belong to the application owner';
  end if;
  return new;
end;
$$;
drop trigger if exists application_resume_owner on public.applications;
create trigger application_resume_owner before insert or update of resume_id, user_id
on public.applications for each row execute function public.check_application_resume_owner();

create function public.check_application_event_owner() returns trigger
language plpgsql set search_path = '' as $$
begin
  if not exists (
    select 1 from public.applications a
    where a.id = new.application_id and a.user_id = new.user_id
  ) then
    raise exception 'Application event must belong to the event owner';
  end if;
  return new;
end;
$$;
create trigger application_event_owner before insert or update of application_id, user_id
on public.application_events for each row execute function public.check_application_event_owner();

-- Keep owner checks tied to the verified JWT subject and let Postgres evaluate
-- auth.uid() once per statement rather than once per candidate row.
drop policy "own profiles" on public.candidate_profiles;
create policy "own profiles" on public.candidate_profiles for all to authenticated
  using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
drop policy "own resumes" on public.resume_documents;
create policy "own resumes" on public.resume_documents for all to authenticated
  using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
drop policy "own authorization" on public.work_authorizations;
create policy "own authorization" on public.work_authorizations for all to authenticated
  using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
drop policy "own answers" on public.answer_library;
create policy "own answers" on public.answer_library for all to authenticated
  using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
drop policy "own jobs" on public.jobs;
create policy "own jobs" on public.jobs for all to authenticated
  using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
drop policy "own devices" on public.extension_devices;
create policy "own devices" on public.extension_devices for all to authenticated
  using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
drop policy "own applications" on public.applications;
create policy "own applications" on public.applications for all to authenticated
  using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
drop policy "own application fields" on public.application_fields;
create policy "own application fields" on public.application_fields for all to authenticated
  using (exists (
    select 1 from public.applications a where a.id = application_id and a.user_id = (select auth.uid())
  ))
  with check (exists (
    select 1 from public.applications a where a.id = application_id and a.user_id = (select auth.uid())
  ));
drop policy "own application events" on public.application_events;
create policy "own application events" on public.application_events for all to authenticated
  using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);

-- Supabase is changing which public tables are automatically exposed by the
-- Data API. Grant only authenticated users access; RLS still limits every row.
revoke all on public.candidate_profiles, public.resume_documents, public.work_authorizations,
  public.answer_library, public.jobs, public.extension_devices, public.applications,
  public.application_fields, public.application_events, public.user_sync_preferences
  from anon, public;
revoke all on sequence public.application_events_id_seq from anon, public;
grant select, insert, update, delete on public.candidate_profiles, public.resume_documents,
  public.work_authorizations, public.answer_library, public.jobs, public.extension_devices,
  public.applications, public.application_fields, public.application_events,
  public.user_sync_preferences to authenticated;
grant usage, select on sequence public.application_events_id_seq to authenticated;
