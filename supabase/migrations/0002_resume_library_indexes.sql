-- Forward migration for the hosted adapter. The current preview uses IndexedDB.
-- Live copies of an identical upload share one extraction per user; soft-deleted
-- copies do not prevent a user from uploading that file again.
create unique index resume_documents_live_hash
  on public.resume_documents(user_id, sha256) where deleted_at is null;
create index resume_documents_user_list
  on public.resume_documents(user_id, created_at desc, id desc)
  where deleted_at is null;
create index applications_user_status_created
  on public.applications(user_id, status, created_at desc);
create index applications_job_id on public.applications(job_id);
create index applications_resume_id on public.applications(resume_id) where resume_id is not null;
create index application_fields_application_id on public.application_fields(application_id);
create index application_events_application_created on public.application_events(application_id, created_at desc);

-- A resume FK alone does not enforce tenant ownership. Keep the existing FK's
-- ON DELETE SET NULL semantics and reject cross-user references on writes.
create function public.check_application_resume_owner() returns trigger
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
create trigger application_resume_owner before insert or update of resume_id, user_id
on public.applications for each row execute function public.check_application_resume_owner();
