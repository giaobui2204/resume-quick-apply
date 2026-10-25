import { describe, expect, it } from "vitest";
import { ApplicationAssistPackageSchema, canonicalAssistUrl } from "../src";
const value = {
  version: 1,
  applicationId: "one",
  job: {
    canonicalUrl: "https://boards.greenhouse.io/company/jobs/123",
    company: "Company",
    title: "Engineer"
  },
  resume: { id: "resume-one", name: "Engineering resume" },
  fields: [
    { key: "email", value: "ada@example.com", source: { kind: "resume", section: "contact", field: "email" } }
  ],
  reviewedAt: "2026-10-25T00:00:00Z",
  preparedAt: "2026-10-25T00:00:00Z"
};
describe("application assist handoff", () => {
  it("accepts a minimal reviewed snapshot and rejects duplicate or unsupported fields", () => {
    expect(ApplicationAssistPackageSchema.safeParse(value).success).toBe(true);
    for (const fields of [
      [],
      [value.fields[0], value.fields[0]],
      [{ ...value.fields[0], key: "sponsorship" }],
      [{ ...value.fields[0], value: "bad-email" }]
    ])
      expect(ApplicationAssistPackageSchema.safeParse({ ...value, fields }).success).toBe(false);
    expect(ApplicationAssistPackageSchema.safeParse({ ...value, originalResume: "base64" }).success).toBe(
      false
    );
    expect(ApplicationAssistPackageSchema.safeParse({ ...value, version: 2 }).success).toBe(false);
  });
  it("canonicalizes hosted aliases and apply suffixes without permitting credentials or arbitrary URLs", () => {
    expect(canonicalAssistUrl("https://boards.greenhouse.io/company/jobs/123?source=x#apply")).toBe(
      "https://job-boards.greenhouse.io/company/jobs/123"
    );
    expect(canonicalAssistUrl("https://jobs.lever.co/company/abc-123/apply")).toBe(
      "https://jobs.lever.co/company/abc-123"
    );
    for (const url of [
      "http://jobs.lever.co/company/abc",
      "https://jobs.lever.co.attacker.test/company/abc",
      "https://name@jobs.lever.co/company/abc",
      "https://jobs.ashbyhq.com/company/abc",
      "https://jobs.lever.co/company"
    ])
      expect(canonicalAssistUrl(url)).toBeNull();
  });
});
