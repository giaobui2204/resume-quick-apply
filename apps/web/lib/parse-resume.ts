import { ContactSchema, ResumeExtractionSchema } from "@quick-apply/shared";
import { z } from "zod";

function normalizeUrl(value: unknown) {
  if (typeof value !== "string") return value;
  const trimmed = value.trim();
  // Resumes commonly omit the scheme. Add only that syntax, never invent a host.
  if (/^(?:[a-z0-9-]+\.)+[a-z]{2,}(?:[/?#]|$)/i.test(trimmed)) return `https://${trimmed}`;
  return trimmed;
}

const extractionSchema = ResumeExtractionSchema.extend({
  contact: ContactSchema.extend({
    linkedIn: z.preprocess(normalizeUrl, ContactSchema.shape.linkedIn),
    github: z.preprocess(normalizeUrl, ContactSchema.shape.github),
    portfolio: z.preprocess(normalizeUrl, ContactSchema.shape.portfolio)
  })
});

export function parseResumeExtraction(value: unknown) {
  const result = extractionSchema.safeParse(value);
  if (!result.success)
    throw new Error(
      "The AI returned incomplete or invalid resume fields. Try again or enter your profile manually."
    );
  return result.data;
}
