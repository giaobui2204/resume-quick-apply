import type { SponsorshipAssessment, SponsorshipDimensionSchema } from "@quick-apply/shared";
import type { z } from "zod";

export function normalizeJobUrl(raw: string) {
  const url = new URL(raw);
  if (url.protocol !== "https:" || url.username || url.password || url.port)
    throw new Error("Use a public HTTPS job link.");
  let ats: "greenhouse" | "lever";
  if (
    [
      "boards.greenhouse.io",
      "job-boards.greenhouse.io",
      "boards.eu.greenhouse.io",
      "job-boards.eu.greenhouse.io"
    ].includes(url.hostname)
  ) {
    ats = "greenhouse";
    if (!/^\/[^/]+\/jobs\/\d+\/?$/.test(url.pathname))
      throw new Error("Paste an individual Greenhouse job link.");
  } else if (["jobs.lever.co", "jobs.eu.lever.co"].includes(url.hostname)) {
    ats = "lever";
    if (!/^\/[^/]+\/[a-z0-9-]+(?:\/apply)?\/?$/i.test(url.pathname))
      throw new Error("Paste an individual Lever job link.");
    url.pathname = url.pathname.replace(/\/apply\/?$/, "");
  } else throw new Error("Only Greenhouse and Lever are supported.");
  url.search = "";
  url.hash = "";
  url.pathname = url.pathname.replace(/\/$/, "");
  return { url, ats };
}

export function assessSponsorship(text: string): SponsorshipAssessment {
  const sentences = text.split(/(?<=[.!?])\s+|[\r\n]+/).filter(Boolean);
  const clauses = sentences.flatMap((sentence) =>
    sentence.split(/\s*;\s*|\s+(?:and|but|however|whereas)\s+/i).map((clause) => ({ clause, sentence }))
  );
  const current = /\b(?:now|currently|at present|at this time)\b/i;
  const future = /\b(?:future|eventually)\b/i;
  function dimension(
    category: RegExp,
    timing?: "current" | "future"
  ): z.infer<typeof SponsorshipDimensionSchema> {
    const relevant = clauses.filter(({ clause }) => category.test(clause));
    // Screening questions and applicant requirements do not describe employer support.
    const assertions = relevant
      .filter(({ sentence, clause }) => {
        if (
          /\?|\b(?:require|need)(?:s|d)?\s+(?:visa\s+)?sponsorship\b|\b(?:eligible|authorized) to work\b/i.test(
            sentence
          )
        )
          return false;
        // A time-specific promise says nothing about the opposite time period.
        if (timing === "current" && future.test(clause)) return false;
        if (timing === "future" && current.test(clause)) return false;
        return true;
      })
      .map(({ clause }) => clause);
    const negative = assertions.filter((clause) =>
      /\b(?:cannot|can't|unable to|do not|don't|does not|doesn't|will not|won't|not able to|no|without|not eligible|ineligible|not available|not supported|not offered)\b/i.test(
        clause
      )
    );
    const positive = assertions.filter(
      (clause) =>
        !negative.includes(clause) &&
        /\b(?:offer|provide|welcome|support|accept|sponsor)(?:s|ed)?\b/i.test(clause) &&
        !/\b(?:may|might|not|cannot|can't)\b/i.test(clause)
    );
    // Unrelated negation in an unsplit clause is insufficient evidence of denial.
    const ambiguous = negative.some((clause) =>
      /\b(?:no|without)\s+(?:prior\s+)?(?:experience|degree|relocation)\b/i.test(clause)
    );
    // Conflicting or merely descriptive mentions require manual review.
    if (negative.length && !positive.length && !ambiguous)
      return {
        label: "likely_not_supported",
        confidence: 0.8,
        evidence: negative.slice(0, 2),
        explanation: "The posting includes negative language for this category. Review the quoted evidence."
      };
    if (positive.length && !negative.length)
      return {
        label: "likely_supported",
        confidence: 0.75,
        evidence: positive.slice(0, 2),
        explanation: "The posting explicitly describes support for this category."
      };
    return {
      label: "unknown",
      confidence: 0,
      evidence: [...new Set(relevant.map(({ sentence }) => sentence))].slice(0, 2),
      explanation: "There is insufficient or conflicting evidence. Confirm with the employer."
    };
  }
  return {
    cpt: dimension(/\bcpt\b/i),
    opt: dimension(/(?<!stem[- ])\bopt\b/i),
    stemOpt: dimension(/\bstem[- ]opt\b/i),
    h1bNow: dimension(/\bh-?1b\b|\bvisa sponsorship\b|\bsponsor(?:ship)?\b/i, "current"),
    h1bFuture: dimension(/\bh-?1b\b|\bvisa sponsorship\b|\bsponsor(?:ship)?\b/i, "future"),
    analyzedAt: new Date().toISOString(),
    model: "evidence-rules-v2"
  };
}
