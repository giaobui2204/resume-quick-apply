import { z } from "zod";

export const AssistFieldKeySchema = z.enum([
  "legalName",
  "givenName",
  "familyName",
  "email",
  "phone",
  "linkedIn",
  "location",
  "currentCompany",
  "currentJobTitle",
  "school",
  "degree",
  "fieldOfStudy",
  "skills"
]);
export type AssistFieldKey = z.infer<typeof AssistFieldKeySchema>;

export function canonicalAssistUrl(raw: string): string | null {
  try {
    const url = new URL(raw);
    if (url.protocol !== "https:" || url.username || url.password || url.port) return null;
    if (
      [
        "boards.greenhouse.io",
        "job-boards.greenhouse.io",
        "boards.eu.greenhouse.io",
        "job-boards.eu.greenhouse.io"
      ].includes(url.hostname)
    ) {
      if (!/^\/[^/]+\/jobs\/\d+\/?$/.test(url.pathname)) return null;
      // Greenhouse's legacy and current hosted domains identify the same posting.
      url.hostname = url.hostname.replace(/^boards\./, "job-boards.");
    } else if (["jobs.lever.co", "jobs.eu.lever.co"].includes(url.hostname)) {
      if (!/^\/[^/]+\/[a-z0-9-]+(?:\/apply)?\/?$/i.test(url.pathname)) return null;
      url.pathname = url.pathname.replace(/\/apply\/?$/, "");
    } else return null;
    url.pathname = url.pathname.replace(/\/$/, "");
    url.search = "";
    url.hash = "";
    return url.toString();
  } catch {
    return null;
  }
}

export const AssistFieldSchema = z
  .object({
    key: AssistFieldKeySchema,
    value: z.string().trim().min(1).max(2000),
    source: z
      .object({
        kind: z.enum(["resume", "user"]),
        section: z.enum(["contact", "experience", "education", "skills"]),
        recordId: z.string().max(200).optional(),
        label: z.string().max(300).optional(),
        field: z.string().min(1).max(100)
      })
      .strict()
  })
  .strict()
  .superRefine((field, context) => {
    if (field.key === "email" && !z.string().email().safeParse(field.value).success)
      context.addIssue({ code: z.ZodIssueCode.custom, message: "Enter a valid email." });
    if (field.key === "linkedIn") {
      try {
        const url = new URL(field.value);
        if (url.protocol !== "https:" || url.username || url.password) throw new Error();
      } catch {
        context.addIssue({ code: z.ZodIssueCode.custom, message: "Use a valid HTTPS profile URL." });
      }
    }
  });
export type AssistField = z.infer<typeof AssistFieldSchema>;
export const ApplicationAssistPackageSchema = z
  .object({
    version: z.literal(1),
    applicationId: z.string().min(1).max(200),
    job: z
      .object({
        canonicalUrl: z
          .string()
          .url()
          .refine(
            (value) => canonicalAssistUrl(value) !== null,
            "Only Greenhouse and Lever hosted jobs support autofill."
          ),
        company: z.string().min(1).max(200),
        title: z.string().min(1).max(500)
      })
      .strict(),
    resume: z.object({ id: z.string().min(1).max(200), name: z.string().min(1).max(200) }).strict(),
    fields: z.array(AssistFieldSchema).min(1).max(13),
    reviewedAt: z.string().datetime(),
    preparedAt: z.string().datetime()
  })
  .strict()
  .superRefine((value, context) => {
    if (new Set(value.fields.map((field) => field.key)).size !== value.fields.length)
      context.addIssue({ code: z.ZodIssueCode.custom, message: "Each field may appear only once." });
  });
export type ApplicationAssistPackage = z.infer<typeof ApplicationAssistPackageSchema>;
export const assistFieldLabels: Record<AssistFieldKey, string> = {
  legalName: "Legal name",
  givenName: "Given name",
  familyName: "Family name",
  email: "Email",
  phone: "Phone",
  linkedIn: "LinkedIn URL",
  location: "Current location",
  currentCompany: "Current company",
  currentJobTitle: "Current job title",
  school: "School / University",
  degree: "Degree",
  fieldOfStudy: "Field of study",
  skills: "Skills"
};
