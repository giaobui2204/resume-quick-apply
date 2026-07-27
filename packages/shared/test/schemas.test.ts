import { describe, expect, it } from "vitest";
import { ResumeExtractionSchema, WorkAuthorizationSchema } from "../src";

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
