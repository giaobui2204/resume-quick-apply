"use client";
import { useState } from "react";
import {
  ApplicationAssistPackageSchema,
  assistFieldLabels,
  canonicalAssistUrl,
  type Application,
  type ApplicationAssistPackage,
  type AssistField,
  type AssistFieldKey,
  type ResumeExtraction
} from "@quick-apply/shared";

type Draft = { key: AssistFieldKey; value: string; included: boolean; source: AssistField["source"] };
export function ApplicationAssistReview({
  application,
  profile,
  resumeId,
  resumeName,
  onConfirm,
  onCancel
}: {
  application: Application;
  profile: ResumeExtraction;
  resumeId: string;
  resumeName: string;
  onConfirm: (value: ApplicationAssistPackage) => void;
  onCancel: () => void;
}) {
  const [experienceId, setExperienceId] = useState("");
  const [educationId, setEducationId] = useState("");
  const [confirmed, setConfirmed] = useState(false);
  const [error, setError] = useState("");
  const [drafts, setDrafts] = useState<Draft[]>(() => {
    const contact = ["legalName", "email", "phone", "linkedIn", "location"] as const;
    return [
      ...contact.map((key) => ({
        key,
        value: profile.contact[key],
        included: false,
        source: { kind: "resume" as const, section: "contact" as const, field: key }
      })),
      ...(["givenName", "familyName"] as const).map((key) => ({
        key,
        value: "",
        included: false,
        source: { kind: "user" as const, section: "contact" as const, field: key }
      })),
      {
        key: "skills",
        value: profile.skills.join(", "),
        included: false,
        source: { kind: "resume", section: "skills", field: "skills" }
      }
    ];
  });
  function choose(section: "experience" | "education", id: string) {
    const mappings: { key: AssistFieldKey; value: string; field: string }[] = [];
    if (section === "experience") {
      setExperienceId(id);
      const record = profile.experiences.find((item) => item.id === id);
      if (record)
        mappings.push(
          { key: "currentCompany", value: record.company, field: "company" },
          { key: "currentJobTitle", value: record.title, field: "title" }
        );
    } else {
      setEducationId(id);
      const record = profile.educations.find((item) => item.id === id);
      if (record)
        mappings.push(
          { key: "school", value: record.school, field: "school" },
          { key: "degree", value: record.degree, field: "degree" },
          { key: "fieldOfStudy", value: record.field, field: "field" }
        );
    }
    setConfirmed(false);
    setDrafts((items) => [
      ...items.filter((item) => item.source.section !== section),
      ...mappings.map((item) => ({
        key: item.key,
        value: item.value,
        included: false,
        source: {
          kind: "resume" as const,
          section,
          recordId: id,
          label:
            section === "experience"
              ? profile.experiences
                  .filter((record) => record.id === id)
                  .map((record) => `${record.title} at ${record.company}`)
                  .join("")
              : profile.educations
                  .filter((record) => record.id === id)
                  .map((record) => `${record.school} · ${record.degree}`)
                  .join(""),
          field: item.field
        }
      }))
    ]);
  }
  return (
    <section className="panel assist-review" aria-label="Review application package">
      <p className="eyebrow">REVIEW BEFORE HANDOFF</p>
      <h3>
        {application.job.company} · {application.job.title}
      </h3>
      <p>
        Resume: <strong>{resumeName}</strong>. Choose the facts to share with the extension. These values
        become a saved snapshot; later resume edits do not change it.
      </p>
      <div className="notice">
        Attach your original resume manually on the employer’s form. Uploads, sensitive/legal answers, essays
        and repeated sections stay manual. You will click the employer’s final Submit button yourself.
      </div>
      <div className="form-grid">
        <label className="field">
          <span>Experience record (optional)</span>
          <select value={experienceId} onChange={(event) => choose("experience", event.target.value)}>
            <option value="">Do not include experience</option>
            {profile.experiences.map((item) => (
              <option key={item.id} value={item.id}>
                {item.title} · {item.company}
              </option>
            ))}
          </select>
        </label>
        <label className="field">
          <span>Education record (optional)</span>
          <select value={educationId} onChange={(event) => choose("education", event.target.value)}>
            <option value="">Do not include education</option>
            {profile.educations.map((item) => (
              <option key={item.id} value={item.id}>
                {item.school} · {item.degree}
              </option>
            ))}
          </select>
        </label>
      </div>
      <p className="muted">
        Given and family names are entered explicitly. If you choose a past experience, change the proposed
        current-company/title values or deselect them.
      </p>
      <p role="status">
        {drafts.filter((item) => item.included).length} fields selected for this package. Check each fact you
        want included.
      </p>
      <div className="assist-field-list">
        {drafts.map((item) => (
          <div className="assist-field" key={item.key}>
            <label className="check">
              <input
                type="checkbox"
                aria-label={`Include ${assistFieldLabels[item.key]}`}
                checked={item.included}
                onChange={(event) => {
                  setConfirmed(false);
                  setDrafts((items) =>
                    items.map((draft) =>
                      draft.key === item.key ? { ...draft, included: event.target.checked } : draft
                    )
                  );
                }}
              />
              Include in package
            </label>
            <label className="field">
              <span>{assistFieldLabels[item.key]}</span>
              <input
                aria-label={assistFieldLabels[item.key]}
                value={item.value}
                onChange={(event) => {
                  setConfirmed(false);
                  setDrafts((items) =>
                    items.map((draft) =>
                      draft.key === item.key
                        ? {
                            ...draft,
                            value: event.target.value,
                            included: draft.included,
                            source: { ...draft.source, kind: "user" }
                          }
                        : draft
                    )
                  );
                }}
              />
              <small>
                {item.source.kind === "user"
                  ? "Edited by you"
                  : (item.source.label ??
                    (item.source.section === "skills" ? "Resume skills" : "Resume contact details"))}{" "}
                · {item.source.field}
              </small>
            </label>
          </div>
        ))}
      </div>
      {error && (
        <p className="notice warning" role="alert">
          {error}
        </p>
      )}
      <label className="check">
        <input type="checkbox" checked={confirmed} onChange={(event) => setConfirmed(event.target.checked)} />
        I reviewed the selected values and the target job. I will review the employer’s form and submit it
        manually.
      </label>
      <div className="assist-actions">
        <button className="secondary" onClick={onCancel}>
          Cancel review
        </button>
        <button
          className="primary"
          disabled={!confirmed}
          onClick={() => {
            const now = new Date().toISOString();
            const parsed = ApplicationAssistPackageSchema.safeParse({
              version: 1,
              applicationId: application.id,
              job: {
                canonicalUrl:
                  canonicalAssistUrl(application.job.canonicalUrl) ?? application.job.canonicalUrl,
                company: application.job.company,
                title: application.job.title
              },
              resume: { id: resumeId, name: resumeName },
              fields: drafts.filter((item) => item.included).map(({ included: _, ...item }) => item),
              reviewedAt: now,
              preparedAt: now
            });
            if (!parsed.success) {
              setError(parsed.error.issues.map((issue) => issue.message).join(" · "));
              return;
            }
            onConfirm(parsed.data);
          }}
        >
          Confirm and download package
        </button>
      </div>
      <p className="muted">
        The JSON file contains only selected facts and job/resume identifiers. Keep it private; import it in
        the ApplyPilot extension. No application is sent by downloading it.
      </p>
    </section>
  );
}
export function downloadAssistPackage(value: ApplicationAssistPackage) {
  const url = URL.createObjectURL(new Blob([JSON.stringify(value, null, 2)], { type: "application/json" }));
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = `applypilot-${value.applicationId}.json`;
  anchor.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
