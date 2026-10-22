import { z } from "zod";

export const VerificationSchema = z.object({
  verified: z.boolean().default(false),
  source: z.enum(["resume", "user", "saved_answer"]),
  sourceText: z.string().optional()
});

export const ContactSchema = z.object({
  legalName: z.string().default(""),
  preferredName: z.string().default(""),
  email: z.string().email().or(z.literal("")).default(""),
  phone: z.string().default(""),
  location: z.string().default(""),
  linkedIn: z.string().url().or(z.literal("")).default(""),
  github: z.string().url().or(z.literal("")).default(""),
  portfolio: z.string().url().or(z.literal("")).default("")
});

export const ExperienceSchema = z.object({
  id: z.string(),
  company: z.string(),
  title: z.string(),
  location: z.string().default(""),
  startDate: z.string().default(""),
  endDate: z.string().default(""),
  current: z.boolean().default(false),
  highlights: z.array(z.string()).default([])
});

export const EducationSchema = z.object({
  id: z.string(),
  school: z.string(),
  degree: z.string().default(""),
  field: z.string().default(""),
  startDate: z.string().default(""),
  endDate: z.string().default(""),
  gpa: z.string().default("")
});

export const ResumeExtractionSchema = z.object({
  schemaVersion: z.literal(1),
  contact: ContactSchema,
  summary: z.string().default(""),
  experiences: z.array(ExperienceSchema).default([]),
  educations: z.array(EducationSchema).default([]),
  projects: z.array(z.object({
    id: z.string(),
    name: z.string(),
    description: z.string().default(""),
    technologies: z.array(z.string()).default([])
  })).default([]),
  skills: z.array(z.string()).default([]),
  certifications: z.array(z.string()).default([]),
  warnings: z.array(z.string()).default([])
});

export const WorkAuthorizationSchema = z.object({
  status: z.enum(["cpt", "opt", "stem_opt", "h1b", "other", "undisclosed"]),
  authorizationStart: z.string().default(""),
  authorizationEnd: z.string().default(""),
  currentlyAuthorized: z.boolean(),
  sponsorshipNow: z.boolean(),
  sponsorshipFuture: z.boolean(),
  confirmedAt: z.string().datetime().nullable()
});

export const SponsorshipLabelSchema = z.enum([
  "likely_supported",
  "likely_not_supported",
  "unknown"
]);

export const SponsorshipDimensionSchema = z.object({
  label: SponsorshipLabelSchema,
  confidence: z.number().min(0).max(1),
  evidence: z.array(z.string()).default([]),
  explanation: z.string()
});

export const SponsorshipAssessmentSchema = z.object({
  cpt: SponsorshipDimensionSchema,
  opt: SponsorshipDimensionSchema,
  stemOpt: SponsorshipDimensionSchema,
  h1bNow: SponsorshipDimensionSchema,
  h1bFuture: SponsorshipDimensionSchema,
  analyzedAt: z.string().datetime(),
  model: z.string()
});

export const AtsSchema = z.enum(["greenhouse", "lever"]);

export const JobClassificationSchema = z.object({
  experience: z.enum(["intern", "entry", "mid", "senior", "lead", "management", "unknown"]),
  workMode: z.enum(["remote", "hybrid", "onsite", "unknown"]),
  employment: z.enum(["full_time", "part_time", "contract", "internship", "unknown"]),
  evidence: z.object({ experience: z.array(z.string()), workMode: z.array(z.string()), employment: z.array(z.string()) })
});
export type JobClassification = z.infer<typeof JobClassificationSchema>;

// Source calendar date, independent of collection time or an assumed timezone.
export const PostedDateSchema = z.string().regex(/^\d{4}-\d{2}-\d{2}$/).refine((value) => {
  const timestamp = Date.parse(`${value}T00:00:00Z`);
  return Number.isFinite(timestamp) && new Date(timestamp).toISOString().slice(0, 10) === value;
}, "Invalid calendar date");

export const JobSnapshotSchema = z.object({
  id: z.string(),
  ats: AtsSchema.nullable(),
  provider: z.enum(["greenhouse", "lever", "remotive"]).optional(),
  sourceUrl: z.string().url().optional(),
  attribution: z.object({ label: z.string(), url: z.string().url() }).optional(),
  externalId: z.string(),
  canonicalUrl: z.string().url(),
  applyUrl: z.string().url(),
  company: z.string(),
  title: z.string(),
  location: z.string().default(""),
  description: z.string(),
  capturedAt: z.string().datetime(),
  postedDate: PostedDateSchema.optional(),
  sponsorship: SponsorshipAssessmentSchema.optional(),
  classification: JobClassificationSchema.optional()
});

export const ApplicationStatusSchema = z.enum([
  "queued", "analyzing", "ready", "filling", "review_required",
  "submitting", "submitted", "submission_unknown", "blocked",
  "failed", "skipped", "expired"
]);

export const BlockedReasonSchema = z.enum([
  "captcha", "unsupported_component", "authentication_required",
  "site_changed", "file_upload_failed", "job_mismatch",
  "network_error", "unknown_submission"
]);

export const ApplicationFieldSchema = z.object({
  id: z.string(),
  label: z.string(),
  normalizedKey: z.string(),
  inputType: z.string(),
  required: z.boolean(),
  proposedValue: z.union([z.string(), z.boolean(), z.array(z.string())]).nullable(),
  source: z.enum(["profile", "saved_answer", "alias", "unresolved"]),
  confidence: z.number().min(0).max(1),
  needsReview: z.boolean()
});

export const ApplicationSchema = z.object({
  id: z.string(),
  job: JobSnapshotSchema,
  status: ApplicationStatusSchema,
  queuePosition: z.number().int().nonnegative(),
  resumeId: z.string().nullable().optional(),
  resumeName: z.string().optional(),
  blockedReason: BlockedReasonSchema.nullable(),
  fields: z.array(ApplicationFieldSchema).default([]),
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime()
});

export type ResumeExtraction = z.infer<typeof ResumeExtractionSchema>;
export type WorkAuthorization = z.infer<typeof WorkAuthorizationSchema>;
export type SponsorshipAssessment = z.infer<typeof SponsorshipAssessmentSchema>;
export type JobSnapshot = z.infer<typeof JobSnapshotSchema>;
export type Application = z.infer<typeof ApplicationSchema>;
export type ApplicationField = z.infer<typeof ApplicationFieldSchema>;
