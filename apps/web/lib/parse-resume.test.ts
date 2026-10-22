import { describe, expect, it } from "vitest";
import { emptyResume } from "./demo-data";
import { parseResumeExtraction } from "./parse-resume";

describe("resume extraction boundary", () => {
  it("accepts scheme-less resume links without changing their facts", () => {
    const profile = parseResumeExtraction({ ...emptyResume, contact: { ...emptyResume.contact, linkedIn: "linkedin.com/in/test", github: " github.com/test " } });
    expect(profile.contact.linkedIn).toBe("https://linkedin.com/in/test");
    expect(profile.contact.github).toBe("https://github.com/test");
    expect(profile.contact.portfolio).toBe("");
  });
  it("rejects invalid fields without leaking their values in errors", () => {
    expect(() => parseResumeExtraction({ ...emptyResume, contact: { ...emptyResume.contact, email: "private-invalid-value" } })).toThrow("invalid resume fields");
    try { parseResumeExtraction({ ...emptyResume, contact: { ...emptyResume.contact, linkedIn: "private-invalid-value" } }); }
    catch (error) { expect(String(error)).not.toContain("private-invalid-value"); }
  });
});
