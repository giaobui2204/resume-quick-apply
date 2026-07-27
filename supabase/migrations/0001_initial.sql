create extension if not exists "pgcrypto";

create type public.application_status as enum (
  'queued', 'analyzing', 'ready', 'filling', 'review_required',
  'submitting', 'submitted', 'submission_unknown', 'blocked',
  'failed', 'skipped', 'expired'
);

create table public.candidate_profiles (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null unique references auth.users(id) on delete cascade,
  contact jsonb not null default '{}'::jsonb,
  summary text not null default '',
  profile_version integer not null default 1,
  confirmed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.resume_documents (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  storage_path text not null,
  file_name text not null,
  mime_type text not null check (mime_type in ('application/pdf', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document')),
  byte_size bigint not null check (byte_size between 1 and 10485760),
  sha256 text not null,
  status text not null default 'uploaded',
  active boolean not null default false,
  extraction jsonb,
  schema_version integer not null default 1,
  model_version text,
  created_at timestamptz not null default now(),
  deleted_at timestamptz
);
create unique index one_active_resume_per_user on public.resume_documents(user_id) where active and deleted_at is null;

create table public.work_authorizations (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null unique references auth.users(id) on delete cascade,
  status text not null check (status in ('cpt', 'opt', 'stem_opt', 'h1b', 'other', 'undisclosed')),
  authorization_start date,
  authorization_end date,
  currently_authorized boolean not null,
  sponsorship_now boolean not null,
  sponsorship_future boolean not null,
  confirmed_at timestamptz,
  updated_at timestamptz not null default now()
);

create table public.answer_library (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  normalized_key text not null,
  original_question text not null,
  answer_type text not null,
  answer jsonb not null,
  sensitive boolean not null default false,
  legal_attestation boolean not null default false,
  confirmed_at timestamptz not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(user_id, normalized_key)
);

create table public.jobs (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  ats text not null check (ats in ('greenhouse', 'lever')),
  external_id text not null,
  canonical_url text not null,
  apply_url text not null,
  company text not null,
  title text not null,
  location text not null default '',
  description text not null,
  content_hash text not null,
  captured_at timestamptz not null default now(),
  sponsorship_assessment jsonb,
  unique(user_id, canonical_url)
);

create table public.extension_devices (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  token_hash text not null unique,
  label text not null default 'Chrome',
  expires_at timestamptz not null,
  last_seen_at timestamptz,
  revoked_at timestamptz,
  created_at timestamptz not null default now()
);

create table public.applications (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  job_id uuid not null references public.jobs(id) on delete cascade,
  resume_id uuid references public.resume_documents(id) on delete set null,
  status public.application_status not null default 'queued',
  queue_position integer not null check (queue_position between 0 and 24),
  blocked_reason text,
  lease_device_id uuid references public.extension_devices(id) on delete set null,
  lease_expires_at timestamptz,
  retry_count integer not null default 0 check (retry_count between 0 and 2),
  confirmed_at timestamptz,
  submitted_at timestamptz,
  confirmation_reference text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(user_id, job_id)
);

create table public.application_fields (
  id uuid primary key default gen_random_uuid(),
  application_id uuid not null references public.applications(id) on delete cascade,
  label text not null,
  normalized_key text not null,
  input_type text not null,
  required boolean not null default false,
  proposed_value jsonb,
  value_source text not null check (value_source in ('profile', 'saved_answer', 'alias', 'unresolved')),
  confidence numeric not null check (confidence between 0 and 1),
  needs_review boolean not null default true,
  created_at timestamptz not null default now()
);

create table public.application_events (
  id bigint generated always as identity primary key,
  application_id uuid not null references public.applications(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  event_type text not null,
  sanitized_metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

alter table public.candidate_profiles enable row level security;
alter table public.resume_documents enable row level security;
alter table public.work_authorizations enable row level security;
alter table public.answer_library enable row level security;
alter table public.jobs enable row level security;
alter table public.extension_devices enable row level security;
alter table public.applications enable row level security;
alter table public.application_fields enable row level security;
alter table public.application_events enable row level security;

create policy "own profiles" on public.candidate_profiles for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy "own resumes" on public.resume_documents for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy "own authorization" on public.work_authorizations for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy "own answers" on public.answer_library for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy "own jobs" on public.jobs for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy "own devices" on public.extension_devices for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy "own applications" on public.applications for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy "own application fields" on public.application_fields for all using (
  exists (select 1 from public.applications a where a.id = application_id and a.user_id = auth.uid())
) with check (
  exists (select 1 from public.applications a where a.id = application_id and a.user_id = auth.uid())
);
create policy "own application events" on public.application_events for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
