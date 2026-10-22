"use client";

import { ApplicationSchema, ContactSchema, JobSnapshotSchema, ResumeExtractionSchema, WorkAuthorizationSchema } from "@quick-apply/shared";
import { z } from "zod";

// Editing persists incomplete strings; strict email/URL validation belongs at use time.
export const browserDraftResumeSchema = ResumeExtractionSchema.extend({
  contact: ContactSchema.extend({
    email: z.string().default(""),
    linkedIn: z.string().default(""),
    github: z.string().default(""),
    portfolio: z.string().default("")
  })
});
export const storedAuthorizationSchema = WorkAuthorizationSchema;
export const storedJobsSchema = z.array(JobSnapshotSchema);
export const storedApplicationsSchema = z.array(ApplicationSchema);

type StoredValueValidator<T> = {
  safeParse(value: unknown): { success: true; data: T } | { success: false };
};

export function readLocal<T>(key: string, fallback: T, validator?: StoredValueValidator<T>): T {
  if (typeof window === "undefined") return fallback;
  try {
    const value = window.localStorage.getItem(key);
    if (!value) return fallback;
    const parsed: unknown = JSON.parse(value);
    if (!validator) return parsed as T;
    const result = validator.safeParse(parsed);
    return result.success ? result.data : fallback;
  } catch {
    return fallback;
  }
}

export function writeLocal<T>(key: string, value: T): boolean {
  try {
    if (typeof window === "undefined") return false;
    window.localStorage.setItem(key, JSON.stringify(value));
    return true;
  } catch {
    return false;
  }
}
