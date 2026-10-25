#!/usr/bin/env python3
"""Import privacy-minimized DOL employer filing aggregates into Supabase Postgres."""

from __future__ import annotations

import argparse
import hashlib
import json
import os
import re
import sqlite3
import statistics
import sys
import tempfile
import unicodedata
import urllib.request
import uuid
from datetime import date
from decimal import Decimal, InvalidOperation, ROUND_HALF_UP
from pathlib import Path
from urllib.parse import urlparse

from python_calamine import load_workbook

ROOT = Path(__file__).resolve().parents[1]
MANIFEST_PATH = ROOT / "scripts" / "dol-sponsorship-sources.json"
ALIASES_PATH = ROOT / "scripts" / "dol-employer-aliases.json"
MAX_SOURCE_BYTES = 600 * 1024 * 1024
COPY_BATCH_SIZE = 10_000


def normalize(value: object) -> str:
    decomposed = unicodedata.normalize("NFKD", str(value or "")).upper()
    return re.sub(r"[^A-Z0-9]+", " ", decomposed).strip()


def to_amount(value: object) -> int | None:
    if value is None or str(value).strip() == "":
        return None
    try:
        amount = Decimal(str(value).replace(",", "").replace("$", "").strip())
    except InvalidOperation:
        return None
    if not amount.is_finite() or amount < 0:
        return None
    return int((amount * 100).quantize(Decimal("1")))


def download(url: str, directory: Path) -> tuple[Path, str]:
    parsed = urlparse(url)
    if parsed.scheme != "https" or parsed.hostname != "www.dol.gov":
        raise ValueError(f"Refusing non-DOL source URL: {url}")
    target = directory / (Path(parsed.path).name or "disclosure.xlsx")
    request = urllib.request.Request(url, headers={"User-Agent": "ApplyPilot DOL data importer/1.0"})
    digest = hashlib.sha256()
    total = 0
    with urllib.request.urlopen(request, timeout=60) as response, target.open("wb") as output:
        if urlparse(response.geturl()).hostname != "www.dol.gov":
            raise ValueError("DOL redirected the source file to an unexpected host.")
        while chunk := response.read(1024 * 1024):
            total += len(chunk)
            if total > MAX_SOURCE_BYTES:
                raise ValueError(f"DOL source exceeded the {MAX_SOURCE_BYTES // (1024 * 1024)} MiB limit")
            digest.update(chunk)
            output.write(chunk)
    if total == 0:
        raise ValueError(f"DOL source was empty: {url}")
    return target, digest.hexdigest()


def setup_stage(path: Path) -> sqlite3.Connection:
    connection = sqlite3.connect(path)
    connection.execute("PRAGMA journal_mode = OFF")
    connection.execute("PRAGMA synchronous = OFF")
    connection.execute("PRAGMA temp_store = FILE")
    connection.executescript(
        """
        CREATE TABLE seen_cases (
          program TEXT NOT NULL,
          fiscal_year INTEGER NOT NULL,
          case_number TEXT NOT NULL,
          PRIMARY KEY (program, fiscal_year, case_number)
        );
        CREATE TABLE filing_aggregates (
          program TEXT NOT NULL,
          fiscal_year INTEGER NOT NULL,
          legal_name TEXT NOT NULL,
          legal_name_norm TEXT NOT NULL,
          title TEXT NOT NULL,
          title_norm TEXT NOT NULL,
          case_status TEXT NOT NULL,
          case_count INTEGER NOT NULL DEFAULT 0,
          PRIMARY KEY (program, fiscal_year, legal_name_norm, title_norm, case_status)
        );
        CREATE TABLE wage_records (
          fiscal_year INTEGER NOT NULL,
          legal_name_norm TEXT NOT NULL,
          title_norm TEXT NOT NULL,
          wage_unit TEXT NOT NULL,
          wage_from_cents INTEGER NOT NULL,
          wage_to_cents INTEGER,
          case_number TEXT NOT NULL,
          PRIMARY KEY (fiscal_year, case_number)
        );
        CREATE TABLE wage_aggregates (
          fiscal_year INTEGER NOT NULL,
          legal_name_norm TEXT NOT NULL,
          title_norm TEXT NOT NULL,
          wage_unit TEXT NOT NULL,
          sample_count INTEGER NOT NULL,
          min_from_cents INTEGER NOT NULL,
          median_from_cents INTEGER NOT NULL,
          max_to_cents INTEGER,
          PRIMARY KEY (fiscal_year, legal_name_norm, title_norm, wage_unit)
        );
        """
    )
    return connection


def parse_workbook(connection: sqlite3.Connection, path: Path, source: dict[str, object]) -> dict[str, int]:
    workbook = load_workbook(str(path))
    if not workbook.sheet_names:
        raise ValueError(f"Workbook has no sheets: {path.name}")
    sheet = workbook.get_sheet_by_name(workbook.sheet_names[0])
    rows = sheet.iter_rows()
    headers = [str(value or "").strip() for value in next(rows)]
    required = ["CASE_NUMBER", "CASE_STATUS", "JOB_TITLE"]
    employer_field = "EMPLOYER_NAME" if source["program"] == "lca" else "EMP_BUSINESS_NAME"
    required.append(employer_field)
    if source["program"] == "lca":
        required.extend(["VISA_CLASS", "WAGE_RATE_OF_PAY_FROM", "WAGE_RATE_OF_PAY_TO", "WAGE_UNIT_OF_PAY"])
    missing = [name for name in required if name not in headers]
    if missing:
        raise ValueError(f"{path.name} is missing expected columns: {', '.join(missing)}")
    columns = {name: headers.index(name) for name in required}
    source_rows = 0
    included_cases = 0
    cursor = connection.cursor()
    for row in rows:
        source_rows += 1
        if source["program"] == "lca" and normalize(row[columns["VISA_CLASS"]]).replace(" ", "") != "H1B":
            continue
        case_number = str(row[columns["CASE_NUMBER"]] or "").strip()
        legal_name = str(row[columns[employer_field]] or "").strip()
        if not case_number or not legal_name:
            continue
        cursor.execute(
            "INSERT OR IGNORE INTO seen_cases(program, fiscal_year, case_number) VALUES (?, ?, ?)",
            (source["program"], source["fiscalYear"], case_number),
        )
        if cursor.rowcount == 0:
            continue
        included_cases += 1
        title = str(row[columns["JOB_TITLE"]] or "").strip()
        legal_norm = normalize(legal_name)
        title_norm = normalize(title)
        case_status = str(row[columns["CASE_STATUS"]] or "Unknown").strip() or "Unknown"
        cursor.execute(
            """INSERT INTO filing_aggregates
            (program, fiscal_year, legal_name, legal_name_norm, title, title_norm, case_status, case_count)
            VALUES (?, ?, ?, ?, ?, ?, ?, 1)
            ON CONFLICT(program, fiscal_year, legal_name_norm, title_norm, case_status)
            DO UPDATE SET case_count = case_count + 1""",
            (source["program"], source["fiscalYear"], legal_name, legal_norm, title, title_norm, case_status),
        )
        if source["program"] == "lca" and case_status.casefold() == "certified" and title_norm:
            wage_from = to_amount(row[columns["WAGE_RATE_OF_PAY_FROM"]])
            if wage_from is not None:
                wage_to = to_amount(row[columns["WAGE_RATE_OF_PAY_TO"]])
                wage_unit = str(row[columns["WAGE_UNIT_OF_PAY"]] or "Unknown").strip() or "Unknown"
                cursor.execute(
                    """INSERT OR IGNORE INTO wage_records
                    (fiscal_year, legal_name_norm, title_norm, wage_unit, wage_from_cents, wage_to_cents, case_number)
                    VALUES (?, ?, ?, ?, ?, ?, ?)""",
                    (source["fiscalYear"], legal_norm, title_norm, wage_unit, wage_from, wage_to, case_number),
                )
        if source_rows % COPY_BATCH_SIZE == 0:
            connection.commit()
    connection.commit()
    workbook.close()
    return {"sourceRows": source_rows, "includedCases": included_cases}


def aggregate_wages(connection: sqlite3.Connection) -> None:
    cursor = connection.execute(
        """SELECT fiscal_year, legal_name_norm, title_norm, wage_unit, wage_from_cents, wage_to_cents
        FROM wage_records
        ORDER BY fiscal_year, legal_name_norm, title_norm, wage_unit, wage_from_cents"""
    )
    current_key: tuple[object, ...] | None = None
    wage_from_values: list[int] = []
    wage_to_values: list[int] = []

    def save_group(key: tuple[object, ...] | None) -> None:
        if key is None or not wage_from_values:
            return
        connection.execute(
            """INSERT INTO wage_aggregates
            (fiscal_year, legal_name_norm, title_norm, wage_unit, sample_count, min_from_cents, median_from_cents, max_to_cents)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?)""",
            (
                *key,
                len(wage_from_values),
                min(wage_from_values),
                int(Decimal(str(statistics.median(wage_from_values))).quantize(Decimal("1"), rounding=ROUND_HALF_UP)),
                max(wage_to_values) if wage_to_values else None,
            ),
        )

    for fiscal_year, legal_norm, title_norm, unit, wage_from, wage_to in cursor:
        key = (fiscal_year, legal_norm, title_norm, unit)
        if key != current_key:
            save_group(current_key)
            current_key = key
            wage_from_values = []
            wage_to_values = []
        wage_from_values.append(wage_from)
        if wage_to is not None:
            wage_to_values.append(wage_to)
    save_group(current_key)
    connection.commit()


def copy_rows(cursor, table: str, columns: str, rows) -> int:
    copied = 0
    with cursor.copy(f"COPY public.{table} ({columns}) FROM STDIN") as copy:
        for row in rows:
            copy.write_row(row)
            copied += 1
    return copied


def import_database(connection: sqlite3.Connection, sources: list[dict[str, object]], alias_data: list[dict[str, str]], version: str) -> None:
    db_url = os.environ.get("SUPABASE_DB_URL")
    if not db_url:
        raise RuntimeError("Set SUPABASE_DB_URL for ingestion; it is never used by the web app.")
    import psycopg

    release_id = str(uuid.uuid4())
    db_host = urlparse(db_url).hostname
    sslmode = "disable" if db_host in {"127.0.0.1", "localhost"} else "require"
    with psycopg.connect(db_url, sslmode=sslmode) as pg:
        with pg.cursor() as cursor:
            cursor.execute("SELECT status FROM public.sponsorship_data_releases WHERE version = %s", (version,))
            existing = cursor.fetchone()
            if existing and existing[0] == "published":
                print(f"Release {version} is already published; no changes made.")
                return
            if existing:
                cursor.execute("DELETE FROM public.sponsorship_data_releases WHERE version = %s", (version,))
            cursor.execute(
                "INSERT INTO public.sponsorship_data_releases(id, version, status) VALUES (%s, %s, 'staging')",
                (release_id, version),
            )
        pg.commit()
        try:
            with pg.cursor() as cursor:
                employer_rows = connection.execute(
                    "SELECT legal_name_norm, min(legal_name) FROM filing_aggregates GROUP BY legal_name_norm ORDER BY legal_name_norm"
                )
                copy_rows(
                    cursor,
                    "sponsorship_employers",
                    "release_id, legal_name_norm, legal_name",
                    ((release_id, legal_norm, legal_name) for legal_norm, legal_name in employer_rows),
                )

                for alias in alias_data:
                    alias_name = alias["alias"].strip()
                    legal_name = alias["legalName"].strip()
                    alias_norm = normalize(alias_name)
                    legal_norm = normalize(legal_name)
                    exists = connection.execute(
                        "SELECT 1 FROM filing_aggregates WHERE legal_name_norm = ? LIMIT 1", (legal_norm,)
                    ).fetchone()
                    if not exists:
                        raise ValueError(f"Curated alias target is not present in this DOL release: {legal_name}")
                    cursor.execute(
                        """INSERT INTO public.sponsorship_employer_aliases
                        (release_id, alias_name, alias_norm, legal_name_norm) VALUES (%s, %s, %s, %s)""",
                        (release_id, alias_name, alias_norm, legal_norm),
                    )

                aggregate_rows = connection.execute(
                    """SELECT program, fiscal_year, legal_name_norm, title, title_norm, case_status, case_count
                    FROM filing_aggregates ORDER BY program, fiscal_year, legal_name_norm, title_norm, case_status"""
                )
                copied_aggregates = copy_rows(
                    cursor,
                    "sponsorship_filing_aggregates",
                    "release_id, program, fiscal_year, legal_name_norm, title, title_norm, case_status, case_count",
                    ((release_id, *row) for row in aggregate_rows),
                )
                expected_aggregates = connection.execute("SELECT COUNT(*) FROM filing_aggregates").fetchone()[0]
                if copied_aggregates != expected_aggregates:
                    raise RuntimeError("Filing aggregate copy count did not match the staging index.")

                wage_rows = connection.execute(
                    """SELECT fiscal_year, legal_name_norm, title_norm, wage_unit, sample_count,
                    min_from_cents, median_from_cents, max_to_cents FROM wage_aggregates
                    ORDER BY fiscal_year, legal_name_norm, title_norm, wage_unit"""
                )
                copy_rows(
                    cursor,
                    "sponsorship_lca_wage_aggregates",
                    "release_id, fiscal_year, legal_name_norm, title_norm, wage_unit, sample_count, min_from, median_from, max_to",
                    ((release_id, *row[:5], cents_to_dollars(row[5]), cents_to_dollars(row[6]), cents_to_dollars(row[7])) for row in wage_rows),
                )

                copy_rows(
                    cursor,
                    "sponsorship_data_sources",
                    "release_id, program, fiscal_year, quarter, data_through, source_url, sha256, source_row_count, included_case_count, partial",
                    (
                        (
                            release_id,
                            source["program"],
                            source["fiscalYear"],
                            source["quarter"],
                            source["dataThrough"],
                            source["url"],
                            source["sha256"],
                            source["sourceRows"],
                            source["includedCases"],
                            source["partial"],
                        )
                        for source in sources
                    ),
                )
            pg.commit()

            source_count = len(sources)
            with pg.cursor() as cursor:
                cursor.execute("SELECT COUNT(*) FROM public.sponsorship_data_sources WHERE release_id = %s", (release_id,))
                if cursor.fetchone()[0] != source_count:
                    raise RuntimeError("Source manifest row count did not match the imported files.")
                cursor.execute(
                    "UPDATE public.sponsorship_data_releases SET status = 'archived', published_at = NULL WHERE status = 'published'"
                )
                cursor.execute(
                    "UPDATE public.sponsorship_data_releases SET status = 'published', published_at = now() WHERE id = %s",
                    (release_id,),
                )
                cursor.execute(
                    """DELETE FROM public.sponsorship_data_releases
                    WHERE status = 'archived' AND id NOT IN (
                      SELECT id FROM public.sponsorship_data_releases
                      WHERE status = 'archived' ORDER BY imported_at DESC LIMIT 1
                    )"""
                )
            pg.commit()
            print(f"Published {version}: {copied_aggregates:,} filing aggregates.")
        except Exception:
            pg.rollback()
            with pg.cursor() as cursor:
                cursor.execute(
                    "UPDATE public.sponsorship_data_releases SET status = 'failed', published_at = NULL WHERE id = %s",
                    (release_id,),
                )
            pg.commit()
            raise


def cents_to_dollars(value: int | None) -> Decimal | None:
    if value is None:
        return None
    return Decimal(value) / Decimal(100)


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--dry-run", action="store_true", help="Download, parse, and validate without writing to Postgres")
    parser.add_argument("--manifest", type=Path, default=MANIFEST_PATH)
    parser.add_argument("--aliases", type=Path, default=ALIASES_PATH)
    args = parser.parse_args()

    manifest = json.loads(args.manifest.read_text())
    alias_data = json.loads(args.aliases.read_text())
    if not isinstance(manifest.get("files"), list) or not manifest["files"]:
        raise ValueError("Source manifest must contain DOL files.")
    expected_program_years = {(program, fiscal_year) for program in ("lca", "perm") for fiscal_year in (2024, 2025, 2026)}
    actual_program_years = {(item.get("program"), item.get("fiscalYear")) for item in manifest["files"]}
    if actual_program_years != expected_program_years or len(manifest["files"]) != 7:
        raise ValueError("Manifest must contain the latest LCA and PERM disclosure snapshot for each FY2024–2026 program/year.")
    if not args.dry_run and not os.environ.get("SUPABASE_DB_URL"):
        raise RuntimeError("Set SUPABASE_DB_URL for ingestion; it is never used by the web app.")
    checksums: list[str] = []
    source_results: list[dict[str, object]] = []

    with tempfile.TemporaryDirectory(prefix="applypilot-dol-") as temporary:
        workdir = Path(temporary)
        staging = setup_stage(workdir / "sponsorship-stage.sqlite")
        try:
            for source in manifest["files"]:
                source["dataThrough"] = date.fromisoformat(source["dataThrough"]).isoformat()
                if urlparse(source["url"]).hostname != "www.dol.gov":
                    raise ValueError("All inputs must come directly from dol.gov.")
                path, checksum = download(source["url"], workdir)
                source.update(parse_workbook(staging, path, source))
                if not source["sourceRows"] or not source["includedCases"]:
                    raise RuntimeError(f"DOL source produced no usable {source['program']} FY{source['fiscalYear']} rows.")
                source["sha256"] = checksum
                source_results.append(source)
                checksums.append(checksum)
                print(
                    f"{source['program'].upper()} FY{source['fiscalYear']} {source['quarter']}: "
                    f"{source['sourceRows']:,} rows, {source['includedCases']:,} unique cases, {path.stat().st_size // (1024 * 1024)} MiB",
                    flush=True,
                )
                path.unlink()

            aggregate_wages(staging)
            aggregate_count = staging.execute("SELECT COUNT(*) FROM filing_aggregates").fetchone()[0]
            employer_count = staging.execute("SELECT COUNT(DISTINCT legal_name_norm) FROM filing_aggregates").fetchone()[0]
            wage_count = staging.execute("SELECT COUNT(*) FROM wage_aggregates").fetchone()[0]
            print(
                f"Validated {aggregate_count:,} aggregates across {employer_count:,} legal names; "
                f"{wage_count:,} LCA wage groups.",
                flush=True,
            )
            if not aggregate_count or not employer_count:
                raise RuntimeError("DOL ingestion produced an empty aggregate index.")

            version_hash = hashlib.sha256(("".join(checksums) + args.aliases.read_text()).encode()).hexdigest()[:16]
            version = f"dol-oflc-fy2024-2026-{version_hash}"
            if args.dry_run:
                print(f"Dry run complete; candidate release version: {version}")
            else:
                import_database(staging, source_results, alias_data, version)
        finally:
            staging.close()
    return 0


if __name__ == "__main__":
    try:
        raise SystemExit(main())
    except Exception as error:
        print(f"DOL sponsorship import failed: {error}", file=sys.stderr)
        raise SystemExit(1)
