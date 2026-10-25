import { describe, expect, it } from "vitest";
import { assessSponsorship, normalizeJobUrl } from "./job-intelligence";

describe("job intake", () => {
  it("rejects lookalike domains and non-posting links", () => {
    for (const url of [
      "https://greenhouse.io.evil.test/acme/jobs/123",
      "http://boards.greenhouse.io/acme/jobs/123",
      "https://jobs.lever.co/acme",
      "https://boards.greenhouse.io/acme"
    ]) {
      expect(() => normalizeJobUrl(url)).toThrow();
    }
  });
  it("deduplicates tracking URLs and Lever application links", () => {
    expect(normalizeJobUrl("https://jobs.lever.co/acme/abc-123/apply?ref=test#form").url.toString()).toBe(
      "https://jobs.lever.co/acme/abc-123"
    );
    expect(normalizeJobUrl("https://job-boards.greenhouse.io/acme/jobs/123/?ref=test").ats).toBe(
      "greenhouse"
    );
  });
});

describe("sponsorship evidence", () => {
  it("does not infer CPT or STEM OPT from OPT support", () => {
    const result = assessSponsorship("We welcome OPT candidates.");
    expect(result.opt.label).toBe("likely_supported");
    expect(result.cpt.label).toBe("unknown");
    expect(result.stemOpt.label).toBe("unknown");
    expect(result.h1bFuture.label).toBe("unknown");
  });
  it("does not treat a bare mention or negation as support", () => {
    expect(assessSponsorship("Please disclose your OPT status.").opt.label).toBe("unknown");
    expect(assessSponsorship("OPT candidates are not eligible.").opt.label).toBe("likely_not_supported");
    expect(assessSponsorship("We cannot provide visa sponsorship.").h1bFuture.label).toBe(
      "likely_not_supported"
    );
    expect(assessSponsorship("We cannot provide visa sponsorship.").opt.label).toBe("unknown");
    expect(assessSponsorship("We will not sponsor H-1B visas.").h1bFuture.label).toBe("likely_not_supported");
  });
  it("keeps conflicting evidence unknown", () => {
    expect(
      assessSponsorship("We provide visa sponsorship. We cannot provide visa sponsorship for this role.")
        .h1bFuture.label
    ).toBe("unknown");
  });
  it("does not mistake screening questions or applicant requirements for support", () => {
    for (const text of [
      "Will you require visa sponsorship?",
      "You must be eligible to work on OPT.",
      "Applicants must not require visa sponsorship."
    ]) {
      const result = assessSponsorship(text);
      expect(result.h1bFuture.label).toBe("unknown");
      expect(result.opt.label).toBe("unknown");
    }
  });
  it("evaluates separate lines independently", () => {
    const result = assessSponsorship("We welcome OPT candidates\nWe cannot provide visa sponsorship");
    expect(result.opt.label).toBe("likely_supported");
    expect(result.h1bFuture.label).toBe("likely_not_supported");
  });
  it("keeps unrelated negation and category-specific clauses separate", () => {
    const result = assessSponsorship(
      "No prior experience is necessary and we welcome OPT candidates. We cannot support CPT but we support STEM OPT."
    );
    expect(result.opt.label).toBe("likely_supported");
    expect(result.cpt.label).toBe("likely_not_supported");
    expect(result.stemOpt.label).toBe("likely_supported");
    expect(assessSponsorship("No experience is necessary for OPT candidates.").opt.label).toBe("unknown");
  });
  it("does not extend time-specific H-1B promises to other time periods", () => {
    const nowOnly = assessSponsorship("We sponsor H-1B visas currently.");
    expect(nowOnly.h1bNow.label).toBe("likely_supported");
    expect(nowOnly.h1bFuture.label).toBe("unknown");
    const futureOnly = assessSponsorship("We provide visa sponsorship in the future.");
    expect(futureOnly.h1bNow.label).toBe("unknown");
    expect(futureOnly.h1bFuture.label).toBe("likely_supported");
    const mixed = assessSponsorship("We sponsor H-1B now but we cannot provide future visa sponsorship.");
    expect(mixed.h1bNow.label).toBe("likely_supported");
    expect(mixed.h1bFuture.label).toBe("likely_not_supported");
  });
});
