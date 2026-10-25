create extension if not exists pg_trgm with schema extensions;

create table public.sponsorship_data_releases (
  id uuid primary key default gen_random_uuid(),
  version text not null unique,
  status text not null check (status in ('staging', 'published', 'archived', 'failed')),
  imported_at timestamptz not null default now(),
  published_at timestamptz,
  created_at timestamptz not null default now(),
  check ((status = 'published') = (published_at is not null))
);
create unique index sponsorship_one_published_release
  on public.sponsorship_data_releases(status) where status = 'published';

create table public.sponsorship_data_sources (
  id bigint generated always as identity primary key,
  release_id uuid not null references public.sponsorship_data_releases(id) on delete cascade,
  program text not null check (program in ('lca', 'perm')),
  fiscal_year smallint not null check (fiscal_year between 2009 and 2100),
  quarter text not null check (quarter in ('Q1', 'Q2', 'Q3', 'Q4')),
  data_through date not null,
  source_url text not null check (source_url like 'https://www.dol.gov/%'),
  sha256 text not null check (sha256 ~ '^[a-f0-9]{64}$'),
  source_row_count integer not null check (source_row_count >= 0),
  included_case_count integer not null check (included_case_count >= 0),
  partial boolean not null default false,
  unique (release_id, program, fiscal_year, source_url)
);

create table public.sponsorship_employers (
  release_id uuid not null references public.sponsorship_data_releases(id) on delete cascade,
  legal_name text not null,
  legal_name_norm text not null,
  primary key (release_id, legal_name_norm)
);
create index sponsorship_employer_name_trgm
  on public.sponsorship_employers using gin (legal_name_norm extensions.gin_trgm_ops);

create table public.sponsorship_employer_aliases (
  release_id uuid not null references public.sponsorship_data_releases(id) on delete cascade,
  alias_name text not null,
  alias_norm text not null,
  legal_name_norm text not null,
  primary key (release_id, alias_norm, legal_name_norm),
  foreign key (release_id, legal_name_norm)
    references public.sponsorship_employers(release_id, legal_name_norm) on delete cascade
);
create index sponsorship_alias_lookup on public.sponsorship_employer_aliases(release_id, alias_norm);

create table public.sponsorship_filing_aggregates (
  release_id uuid not null,
  program text not null check (program in ('lca', 'perm')),
  fiscal_year smallint not null check (fiscal_year between 2009 and 2100),
  legal_name_norm text not null,
  title text not null default '',
  title_norm text not null default '',
  case_status text not null,
  case_count integer not null check (case_count > 0),
  primary key (release_id, program, fiscal_year, legal_name_norm, title_norm, case_status),
  foreign key (release_id, legal_name_norm)
    references public.sponsorship_employers(release_id, legal_name_norm) on delete cascade
);
create index sponsorship_filing_employer_lookup
  on public.sponsorship_filing_aggregates(release_id, legal_name_norm, fiscal_year, program);
create index sponsorship_filing_title_lookup
  on public.sponsorship_filing_aggregates(release_id, legal_name_norm, title_norm, fiscal_year, program);

create table public.sponsorship_lca_wage_aggregates (
  release_id uuid not null,
  fiscal_year smallint not null check (fiscal_year between 2009 and 2100),
  legal_name_norm text not null,
  title_norm text not null,
  wage_unit text not null,
  sample_count integer not null check (sample_count > 0),
  min_from numeric(14, 2),
  median_from numeric(14, 2),
  max_to numeric(14, 2),
  primary key (release_id, fiscal_year, legal_name_norm, title_norm, wage_unit),
  foreign key (release_id, legal_name_norm)
    references public.sponsorship_employers(release_id, legal_name_norm) on delete cascade
);
create index sponsorship_wage_title_lookup
  on public.sponsorship_lca_wage_aggregates(release_id, legal_name_norm, title_norm, fiscal_year);

create or replace function public.normalize_sponsorship_name(p_value text)
returns text
language sql
immutable
set search_path = ''
as $$
  select trim(regexp_replace(upper(normalize(coalesce(p_value, ''), NFKD)), '[^A-Z0-9]+', ' ', 'g'));
$$;

alter table public.sponsorship_data_releases enable row level security;
alter table public.sponsorship_data_sources enable row level security;
alter table public.sponsorship_employers enable row level security;
alter table public.sponsorship_employer_aliases enable row level security;
alter table public.sponsorship_filing_aggregates enable row level security;
alter table public.sponsorship_lca_wage_aggregates enable row level security;

create policy "public reads published sponsorship releases" on public.sponsorship_data_releases
  for select to anon, authenticated using (status = 'published');
create policy "public reads published sponsorship sources" on public.sponsorship_data_sources
  for select to anon, authenticated using (
    exists (select 1 from public.sponsorship_data_releases r where r.id = release_id and r.status = 'published')
  );
create policy "public reads published sponsorship employers" on public.sponsorship_employers
  for select to anon, authenticated using (
    exists (select 1 from public.sponsorship_data_releases r where r.id = release_id and r.status = 'published')
  );
create policy "public reads published sponsorship aliases" on public.sponsorship_employer_aliases
  for select to anon, authenticated using (
    exists (select 1 from public.sponsorship_data_releases r where r.id = release_id and r.status = 'published')
  );
create policy "public reads published sponsorship filings" on public.sponsorship_filing_aggregates
  for select to anon, authenticated using (
    exists (select 1 from public.sponsorship_data_releases r where r.id = release_id and r.status = 'published')
  );
create policy "public reads published sponsorship wages" on public.sponsorship_lca_wage_aggregates
  for select to anon, authenticated using (
    exists (select 1 from public.sponsorship_data_releases r where r.id = release_id and r.status = 'published')
  );

create or replace function public.get_sponsorship_history(p_queries jsonb, p_fiscal_years smallint[])
returns jsonb
language plpgsql
stable
security invoker
set search_path = ''
as $$
declare
  v_release public.sponsorship_data_releases%rowtype;
  v_result jsonb;
  v_results jsonb := '[]'::jsonb;
  v_query jsonb;
  v_company text;
  v_title text;
  v_company_norm text;
  v_title_norm text;
  v_selected text;
  v_match text;
  v_verified jsonb;
  v_candidates jsonb;
  v_candidate_count integer;
  v_year jsonb;
  v_program text;
  v_programs jsonb;
  v_program_years jsonb;
  v_years jsonb;
  v_employer_count bigint;
  v_title_count bigint;
  v_employer_status jsonb;
  v_title_status jsonb;
  v_wages jsonb;
  v_has_title boolean;
begin
  if p_queries is null or jsonb_typeof(p_queries) <> 'array' or jsonb_array_length(p_queries) > 25 then
    raise exception 'Provide between 1 and 25 job lookups';
  end if;
  if p_fiscal_years is null or cardinality(p_fiscal_years) = 0 or exists (
    select 1 from unnest(p_fiscal_years) fy where fy < 2024 or fy > 2100
  ) then
    raise exception 'Unsupported fiscal year selection';
  end if;

  select * into v_release from public.sponsorship_data_releases
  where status = 'published' order by published_at desc limit 1;
  if not found then return null; end if;
  if exists (
    select 1
    from unnest(p_fiscal_years) as requested_year(fiscal_year)
    cross join (values ('lca'::text), ('perm'::text)) requested_program(program)
    where not exists (
      select 1 from public.sponsorship_data_sources s
      where s.release_id = v_release.id and s.fiscal_year = requested_year.fiscal_year
        and s.program = requested_program.program
    )
  ) then return null; end if;

  for v_query in select value from jsonb_array_elements(p_queries) as q(value)
  loop
    v_candidates := null;
    v_company := coalesce(v_query->>'company', '');
    v_title := coalesce(v_query->>'title', '');
    v_company_norm := coalesce(v_query->>'companyNorm', '');
    v_title_norm := coalesce(v_query->>'titleNorm', '');
    v_selected := nullif(coalesce(v_query->>'legalEmployerNorm', ''), '');
    v_match := 'none';

    select coalesce(jsonb_agg(jsonb_build_object('legalName', legal_name, 'match', match_type)
      order by legal_name), '[]'::jsonb)
      into v_verified
    from (
      select legal_name,
        case when bool_or(match_type = 'exact') then 'exact' else 'curated_alias' end as match_type
      from (
        select e.legal_name, 'exact'::text as match_type
        from public.sponsorship_employers e
        where e.release_id = v_release.id and e.legal_name_norm = v_company_norm
        union all
        select e.legal_name, 'curated_alias'::text
        from public.sponsorship_employer_aliases a
        join public.sponsorship_employers e
          on e.release_id = a.release_id and e.legal_name_norm = a.legal_name_norm
        where a.release_id = v_release.id and a.alias_norm = v_company_norm
      ) matches
      group by legal_name
    ) verified;

    select count(*) into v_candidate_count from jsonb_array_elements(v_verified);
    if v_selected is not null then
      if exists (
        select 1 from jsonb_array_elements(v_verified) as x(value) where public.normalize_sponsorship_name(x.value->>'legalName') = v_selected
      ) then
        v_match := case when exists (
          select 1 from jsonb_array_elements(v_verified) as x(value) where public.normalize_sponsorship_name(x.value->>'legalName') = v_selected and x.value->>'match' = 'exact'
        ) then 'exact' else 'user_selected' end;
      else
        select e.legal_name_norm into v_selected from public.sponsorship_employers e
        where e.release_id = v_release.id and e.legal_name_norm = v_selected
          and (
            extensions.similarity(e.legal_name_norm, v_company_norm) >= 0.20
            or e.legal_name_norm like '%' || v_company_norm || '%'
          )
        limit 1;
        if not found then v_selected := null; else v_match := 'user_selected'; end if;
      end if;
    elsif v_candidate_count = 1 then
      select public.normalize_sponsorship_name(x.value->>'legalName'), x.value->>'match'
        into v_selected, v_match from jsonb_array_elements(v_verified) as x(value) limit 1;
    elsif v_candidate_count > 1 then
      v_candidates := v_verified;
    else
      select coalesce(jsonb_agg(jsonb_build_object('legalName', legal_name, 'match', 'possible_candidate')
        order by extensions.similarity(legal_name_norm, v_company_norm) desc), '[]'::jsonb)
        into v_candidates
      from (
        select e.legal_name, e.legal_name_norm
        from public.sponsorship_employers e
        where e.release_id = v_release.id and length(v_company_norm) >= 3
          and (extensions.similarity(e.legal_name_norm, v_company_norm) >= 0.20 or e.legal_name_norm like '%' || v_company_norm || '%')
        order by extensions.similarity(e.legal_name_norm, v_company_norm) desc, e.legal_name
        limit 5
      ) matches;
      if jsonb_array_length(v_candidates) = 1 then
        v_candidate_count := 1;
      else
        v_candidate_count := jsonb_array_length(v_candidates);
      end if;
      if v_candidate_count = 1 then
        v_candidates := v_candidates;
        v_selected := null;
      end if;
    end if;

    if v_selected is null then
      v_result := jsonb_strip_nulls(jsonb_build_object(
        'id', v_query->>'id', 'company', v_company, 'title', v_title,
        'status', case when coalesce(jsonb_array_length(v_candidates), 0) > 0 or v_candidate_count > 1 then 'possible_matches' else 'no_match' end,
        'possibleEmployers', coalesce(v_candidates, '[]'::jsonb),
        'programs', jsonb_build_object(
          'lca', jsonb_build_object('years', '[]'::jsonb),
          'perm', jsonb_build_object('years', '[]'::jsonb)
        )
      ));
      v_results := v_results || jsonb_build_array(v_result);
      v_candidates := null;
      continue;
    end if;

    v_has_title := false;
    v_years := '[]'::jsonb;
    for v_year in select to_jsonb(fy) from unnest(p_fiscal_years) fy
    loop
      v_programs := '{}'::jsonb;
      foreach v_program in array array['lca', 'perm']
      loop
        select coalesce(sum(a.case_count), 0) into v_employer_count
        from public.sponsorship_filing_aggregates a
        where a.release_id = v_release.id and a.program = v_program
          and a.fiscal_year = (v_year #>> '{}')::smallint and a.legal_name_norm = v_selected;

        select coalesce(sum(a.case_count), 0) into v_title_count
        from public.sponsorship_filing_aggregates a
        where a.release_id = v_release.id and a.program = v_program
          and a.fiscal_year = (v_year #>> '{}')::smallint and a.legal_name_norm = v_selected
          and a.title_norm = v_title_norm and v_title_norm <> '';
        if v_title_count > 0 then v_has_title := true; end if;

        select coalesce(jsonb_agg(jsonb_build_object('status', status, 'count', count) order by status), '[]'::jsonb)
          into v_employer_status from (
            select a.case_status as status, sum(a.case_count)::bigint as count
            from public.sponsorship_filing_aggregates a
            where a.release_id = v_release.id and a.program = v_program
              and a.fiscal_year = (v_year #>> '{}')::smallint and a.legal_name_norm = v_selected
            group by a.case_status
          ) counts;
        select coalesce(jsonb_agg(jsonb_build_object('status', status, 'count', count) order by status), '[]'::jsonb)
          into v_title_status from (
            select a.case_status as status, sum(a.case_count)::bigint as count
            from public.sponsorship_filing_aggregates a
            where a.release_id = v_release.id and a.program = v_program
              and a.fiscal_year = (v_year #>> '{}')::smallint and a.legal_name_norm = v_selected
              and a.title_norm = v_title_norm and v_title_norm <> ''
            group by a.case_status
          ) counts;

        if v_program = 'lca' then
          select coalesce(jsonb_agg(jsonb_build_object(
            'unit', wage_unit, 'sampleCount', sample_count, 'minFrom', min_from,
            'medianFrom', median_from, 'maxTo', max_to
          ) order by wage_unit), '[]'::jsonb) into v_wages
          from public.sponsorship_lca_wage_aggregates w
          where w.release_id = v_release.id and w.fiscal_year = (v_year #>> '{}')::smallint
            and w.legal_name_norm = v_selected and w.title_norm = v_title_norm;
          v_programs := v_programs || jsonb_build_object('lca', jsonb_build_object(
            'employerCaseCount', v_employer_count, 'employerStatusCounts', v_employer_status,
            'exactTitleCount', v_title_count, 'exactTitleStatusCounts', v_title_status,
            'wageStatsByUnit', v_wages
          ));
        else
          v_programs := v_programs || jsonb_build_object('perm', jsonb_build_object(
            'employerCaseCount', v_employer_count, 'employerStatusCounts', v_employer_status,
            'exactTitleCount', v_title_count, 'exactTitleStatusCounts', v_title_status
          ));
        end if;
      end loop;
      v_years := v_years || jsonb_build_array(jsonb_build_object('fiscalYear', (v_year #>> '{}')::smallint, 'programs', v_programs));
    end loop;

    v_programs := '{}'::jsonb;
    foreach v_program in array array['lca', 'perm']
    loop
      select coalesce(jsonb_agg(jsonb_build_object(
        'fiscalYear', (year.value->>'fiscalYear')::smallint,
        'employerCaseCount', (year.value->'programs'->v_program->>'employerCaseCount')::bigint,
        'employerStatusCounts', year.value->'programs'->v_program->'employerStatusCounts',
        'exactTitleCount', (year.value->'programs'->v_program->>'exactTitleCount')::bigint,
        'exactTitleStatusCounts', year.value->'programs'->v_program->'exactTitleStatusCounts'
      ) || case when v_program = 'lca' then jsonb_build_object(
        'wageStatsByUnit', coalesce(year.value->'programs'->v_program->'wageStatsByUnit', '[]'::jsonb)
      ) else '{}'::jsonb end order by (year.value->>'fiscalYear')::smallint), '[]'::jsonb)
      into v_program_years from jsonb_array_elements(v_years) year(value);
      v_programs := v_programs || jsonb_build_object(v_program, jsonb_build_object('years', v_program_years));
    end loop;

    v_result := jsonb_strip_nulls(jsonb_build_object(
      'id', v_query->>'id', 'company', v_company, 'title', v_title,
      'status', case when v_has_title then 'available' else 'available_company_only' end,
      'matchedEmployer', jsonb_build_object('legalName', (select legal_name from public.sponsorship_employers where release_id=v_release.id and legal_name_norm=v_selected), 'match', v_match),
      'programs', v_programs,
      'possibleEmployers', '[]'::jsonb
    ));
    v_results := v_results || jsonb_build_array(v_result);
  end loop;

  return jsonb_build_object(
    'release', jsonb_build_object(
      'id', v_release.id, 'version', v_release.version, 'publishedAt', v_release.published_at,
      'sources', coalesce((select jsonb_agg(jsonb_build_object(
        'program', s.program, 'fiscalYear', s.fiscal_year, 'quarter', s.quarter,
        'dataThrough', s.data_through, 'sourceUrl', s.source_url, 'checksum', s.sha256, 'partial', s.partial
      ) order by s.fiscal_year, s.program, s.source_url)
      from public.sponsorship_data_sources s where s.release_id = v_release.id and s.fiscal_year = any(p_fiscal_years)), '[]'::jsonb)
    ),
    'results', v_results
  );
end;
$$;

revoke all on function public.get_sponsorship_history(jsonb, smallint[]) from public;
grant execute on function public.get_sponsorship_history(jsonb, smallint[]) to anon, authenticated;

-- The function and anonymous roles only need published, aggregated public DOL records.
grant select on public.sponsorship_data_releases, public.sponsorship_data_sources,
  public.sponsorship_employers, public.sponsorship_employer_aliases,
  public.sponsorship_filing_aggregates, public.sponsorship_lca_wage_aggregates to anon, authenticated;
