export function resumeJsonSchema() {
  return {
    type: "object",
    additionalProperties: false,
    required: ["schemaVersion", "contact", "summary", "experiences", "educations", "projects", "skills", "certifications", "warnings"],
    properties: {
      schemaVersion: { type: "integer", enum: [1] },
      contact: {
        type: "object", additionalProperties: false,
        required: ["legalName", "preferredName", "email", "phone", "location", "linkedIn", "github", "portfolio"],
        properties: Object.fromEntries(["legalName", "preferredName", "email", "phone", "location", "linkedIn", "github", "portfolio"].map((key) => [key, { type: "string" }]))
      },
      summary: { type: "string" },
      experiences: { type: "array", items: objectItem(["id", "company", "title", "location", "startDate", "endDate", "current", "highlights"], { current: { type: "boolean" }, highlights: { type: "array", items: { type: "string" } } }) },
      educations: { type: "array", items: objectItem(["id", "school", "degree", "field", "startDate", "endDate", "gpa"]) },
      projects: { type: "array", items: objectItem(["id", "name", "description", "technologies"], { technologies: { type: "array", items: { type: "string" } } }) },
      skills: { type: "array", items: { type: "string" } },
      certifications: { type: "array", items: { type: "string" } },
      warnings: { type: "array", items: { type: "string" } }
    }
  };
}

function objectItem(required: string[], overrides: Record<string, unknown> = {}) {
  return {
    type: "object", additionalProperties: false, required,
    properties: Object.fromEntries(required.map((key) => [key, overrides[key] ?? { type: "string" }]))
  };
}
