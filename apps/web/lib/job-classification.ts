import type { JobClassification } from "@quick-apply/shared";

// Missing or ambiguous signals remain unknown; generic titles do not imply a level.
export function classifyJob(title: string, location: string, workplace?: unknown, commitment?: unknown): JobClassification {
  const experienceRules: [JobClassification["experience"], RegExp][] = [
    ["intern", /\bintern(?:ship)?\b/i],
    ["entry", /\b(?:junior|jr\.?|new grad(?:uate)?|recent grad(?:uate)?|early[ -]career|entry[ -]level)\b/i],
    // Product/account/program managers can be individual contributors; a bare
    // "manager" title is not evidence of people leadership.
    ["management", /\b(?:director|head of|vice president|engineering manager|software development manager|people manager|team manager|manager\s*[,–—-]?\s*(?:of\s+)?engineering)\b/i],
    ["lead", /\b(?:staff|principal|lead)\b/i],
    ["senior", /\b(?:senior|sr\.?)\b/i],
    ["mid", /\b(?:mid[ -]level|intermediate)\b/i]
  ];
  const levels = experienceRules.filter(([, rule]) => rule.test(title)).map(([level]) => level);
  const experience = levels.includes("intern") ? "intern" : levels.includes("entry") && levels.some((level) => ["senior", "lead", "management"].includes(level)) ? "unknown" : levels[0] ?? "unknown";
  const explicitWork = typeof workplace === "string" ? workplace : "";
  const titleWork = title.match(/(?:\(|\[|[-–—,]\s*)(remote|hybrid|on[ -]?site)(?:\)|\]|\s*$)/i)?.[1] ?? "";
  const workText = explicitWork || `${location} ${titleWork}`;
  const workRules: [JobClassification["workMode"], RegExp][] = [["hybrid", /\bhybrid\b/i], ["remote", /\bremote\b/i], ["onsite", /\bon[ -]?site\b/i]];
  const workSignals = workRules.filter(([, rule]) => rule.test(workText));
  const workMode = /\b(?:not|no|non)[ -]+remote\b/i.test(workText) ? "unknown" : workSignals.length === 1 ? workSignals[0]![0] : "unknown";
  const titleEmployment = title.match(/\b(?:intern(?:ship)?|part[ -]time|full[ -]time|contractor)\b/i)?.[0]
    ?? title.match(/(?:\(|\[|[-–—,]\s*)(contract)(?:\)|\]|\s*$)/i)?.[1] ?? "";
  const employmentText = typeof commitment === "string" && commitment ? commitment : titleEmployment;
  const employmentRules: [JobClassification["employment"], RegExp][] = [["internship", /\bintern(?:ship)?\b/i], ["part_time", /\bpart[ -]time\b/i], ["contract", /\bcontract(?:or)?\b/i], ["full_time", /\bfull[ -]time\b/i]];
  const employmentSignals = employmentRules.filter(([, rule]) => rule.test(employmentText));
  const employment = employmentSignals.length === 1 ? employmentSignals[0]![0] : "unknown";
  return { experience, workMode, employment, evidence: {
    experience: experience === "unknown" ? [] : [`Title: ${title}`],
    workMode: workMode === "unknown" ? [] : [explicitWork ? `Employer workplace: ${explicitWork}` : `Title/location: ${title} · ${location}`],
    employment: employment === "unknown" ? [] : [typeof commitment === "string" && commitment ? `Employer commitment: ${commitment}` : `Title: ${title}`]
  } };
}
