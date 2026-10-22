import type { JobSnapshot } from "@quick-apply/shared";

export function mergeJobs(existing: JobSnapshot[], incoming: JobSnapshot[]): JobSnapshot[] {
  const jobs = new Map(existing.map((job) => [job.canonicalUrl, job]));
  for (const job of incoming) {
    const previous = jobs.get(job.canonicalUrl);
    jobs.set(job.canonicalUrl, { ...job, id: previous?.id ?? job.id });
  }
  return [...jobs.values()];
}
