import { expect, it } from "vitest";
import type { JobSnapshot } from "@quick-apply/shared";
import { mergeJobs } from "./job-workspace";

it("updates refreshed job facts without duplicating or replacing stable workspace identity", () => {
  const original: JobSnapshot = { id: "saved", ats: "lever", externalId: "123", canonicalUrl: "https://jobs.lever.co/acme/123", applyUrl: "https://jobs.lever.co/acme/123", company: "Acme", title: "Old title", location: "Remote", description: "Old facts", capturedAt: "2026-10-21T00:00:00Z" };
  const refreshed = { ...original, id: "new-id", title: "New title", description: "New facts" };
  expect(mergeJobs([original], [refreshed, refreshed])).toEqual([{ ...refreshed, id: "saved" }]);
  expect(original.title).toBe("Old title");
});
