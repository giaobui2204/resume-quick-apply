"use client";

import type { ResumeLibrary } from "@/lib/resume-library";

export function ResumeLibraryPanel({
  referencedResumeIds,
  library,
  busy,
  onAdd,
  onSelect,
  onRename,
  onDelete
}: {
  referencedResumeIds: Set<string>;
  library: ResumeLibrary;
  busy: boolean;
  onAdd: () => void;
  onSelect: (id: string) => void;
  onRename: (id: string, name: string) => void;
  onDelete: (id: string) => void;
}) {
  return (
    <div className="resume-library panel">
      <div className="panel-heading">
        <div>
          <p className="eyebrow">YOUR RESUME LIBRARY</p>
          <h3>
            {library.resumes.length} saved resume{library.resumes.length === 1 ? "" : "s"}
          </h3>
        </div>
        <button className="secondary" disabled={busy} onClick={onAdd}>
          New blank resume
        </button>
      </div>
      <p className="muted">
        Choose a version to edit. Uploading creates a new resume; your existing versions stay saved in this
        browser.
      </p>
      {library.resumes.map((item) => (
        <div className="resume-row" key={item.id}>
          <button
            className={`resume-select ${item.id === library.activeResumeId ? "selected" : ""}`}
            disabled={busy}
            onClick={() => onSelect(item.id)}
          >
            <strong>{item.name}</strong>
            <small>
              {item.id === library.activeResumeId ? "ACTIVE · " : ""}Updated{" "}
              {new Date(item.updatedAt).toLocaleDateString()}
            </small>
          </button>
          <button
            className="text-button"
            disabled={busy}
            onClick={() => {
              const name = window.prompt("Resume name", item.name);
              if (name?.trim()) onRename(item.id, name.trim());
            }}
          >
            Rename
          </button>
          <button
            className="text-button delete-link"
            title={
              referencedResumeIds.has(item.id)
                ? "Remove applications using this resume before deleting it."
                : undefined
            }
            disabled={busy || referencedResumeIds.has(item.id)}
            onClick={() => {
              if (window.confirm(`Delete “${item.name}”? This cannot be undone.`)) onDelete(item.id);
            }}
          >
            Delete
          </button>
          {referencedResumeIds.has(item.id) && <small className="muted">Used in application history</small>}
        </div>
      ))}
      {busy && (
        <p role="status" className="muted">
          Updating resume library…
        </p>
      )}
    </div>
  );
}
