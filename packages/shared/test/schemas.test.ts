import { describe, expect, it } from "vitest";
import { ResumeExtractionSchema, WorkAuthorizationSchema, PostedDateSchema } from "../src";

describe("shared schemas", () => {
  it("does not accept an invalid resume contact email", () => {
    const result = ResumeExtractionSchema.safeParse({
      schemaVersion: 1,
      contact: { email: "not-an-email" }
    });
    expect(result.success).toBe(false);
  });

  it("requires work authorization to be explicit", () => {
    const result = WorkAuthorizationSchema.safeParse({
      status: "opt",
      currentlyAuthorized: true,
      sponsorshipNow: false,
      sponsorshipFuture: true,
      confirmedAt: new Date().toISOString()
    });
    expect(result.success).toBe(true);
  });
});

it("validates source calendar dates without permitting rolled-over days", () => {
  expect(PostedDateSchema.safeParse("2024-02-29").success).toBe(true);
  for (const value of ["2025-02-29", "2026-02-30", "2026-13-01", "invalid", "2026-01-01T00:00:00Z"]) expect(PostedDateSchema.safeParse(value).success).toBe(false);
});
