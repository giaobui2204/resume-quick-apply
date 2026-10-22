"use client";

export type View = "overview" | "resume" | "profile" | "jobs" | "applications" | "settings";
export const flow: [View, string][] = [["resume", "Resume"], ["profile", "Review profile"], ["jobs", "Discover jobs"], ["applications", "Applications"]];

export function StepNavigation({ view, navigate, jobCount }: { view: View; navigate: (view: View) => void; jobCount: number }) {
  const index = flow.findIndex(([step]) => step === view);

  const next = flow[index + 1];
  const previous = flow[index - 1];
  return <div className="step-navigation">
    <button className="secondary" onClick={() => navigate(previous?.[0] ?? "overview")}>← {previous?.[1] ?? "Overview"}</button>
    <div>{next ? <button className="primary" onClick={() => navigate(next[0])}>Next: {next[1]} <span>→</span></button> : <button className="primary" onClick={() => navigate("jobs")}>Find more jobs <span>→</span></button>}{view === "jobs" && <small>{jobCount ? `${jobCount} application${jobCount === 1 ? "" : "s"} in your queue` : "Add jobs to your queue when you find a match."}</small>}</div>
  </div>;
}
