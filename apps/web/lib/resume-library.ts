"use client";

import type { ResumeExtraction } from "@quick-apply/shared";
import { browserDraftResumeSchema } from "./storage";
import { emptyResume } from "./demo-data";

export interface ResumeEntry {
  id: string;
  name: string;
  createdAt: string;
  updatedAt: string;
  contentHash?: string;
}
export interface ResumeLibrary {
  activeResumeId: string | null;
  resumes: ResumeEntry[];
}
const DB_NAME = "applypilot.resumes";
const metadataKey = "library";
let opening: Promise<IDBDatabase> | undefined;

function database(): Promise<IDBDatabase> {
  if (!opening)
    opening = new Promise((resolve, reject) => {
      const request = indexedDB.open(DB_NAME, 1);
      request.onupgradeneeded = () => {
        request.result.createObjectStore("metadata");
        request.result.createObjectStore("profiles");
      };
      request.onsuccess = () => {
        const db = request.result;
        db.onversionchange = () => {
          db.close();
          opening = undefined;
        };
        resolve(db);
      };
      request.onerror = () => {
        opening = undefined;
        reject(request.error ?? new Error("Resume storage unavailable."));
      };
      request.onblocked = () => {
        opening = undefined;
        reject(new Error("Close other ApplyPilot tabs to update resume storage."));
      };
    });
  return opening;
}

function result<T>(request: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}
function completed(transaction: IDBTransaction): Promise<void> {
  return new Promise((resolve, reject) => {
    transaction.oncomplete = () => resolve();
    transaction.onabort = transaction.onerror = () =>
      reject(transaction.error ?? new Error("Resume could not be saved."));
  });
}
function validLibrary(value: unknown): ResumeLibrary {
  if (!value || typeof value !== "object") return { activeResumeId: null, resumes: [] };
  const lib = value as ResumeLibrary;
  if (
    !Array.isArray(lib.resumes) ||
    !lib.resumes.every(
      (r) =>
        r &&
        typeof r.id === "string" &&
        typeof r.name === "string" &&
        typeof r.createdAt === "string" &&
        typeof r.updatedAt === "string"
    )
  )
    throw new Error("Resume library metadata is invalid.");
  return {
    resumes: lib.resumes,
    activeResumeId: lib.resumes.some((r) => r.id === lib.activeResumeId)
      ? lib.activeResumeId
      : (lib.resumes[0]?.id ?? null)
  };
}

let initializing: Promise<ResumeLibrary> | undefined;
export async function loadResumeLibrary(fallbackProfile?: ResumeExtraction): Promise<ResumeLibrary> {
  if (initializing) return initializing;
  initializing = initializeLibrary(fallbackProfile);
  try {
    return await initializing;
  } finally {
    initializing = undefined;
  }
}

async function initializeLibrary(fallbackProfile?: ResumeExtraction): Promise<ResumeLibrary> {
  const db = await database();
  const stored = await result(db.transaction("metadata").objectStore("metadata").get(metadataKey));
  if (stored) return validLibrary(stored);
  // A legacy draft is migrated only once and never copied into each resume record.
  let legacy: unknown;
  try {
    const value = window.localStorage.getItem("applypilot.profile");
    legacy = value ? JSON.parse(value) : undefined;
  } catch {
    /* Invalid legacy data cannot be migrated. */
  }
  const parsed = browserDraftResumeSchema.safeParse(legacy);
  const profile = parsed.success ? parsed.data : fallbackProfile;
  if (profile) {
    const library = await addResume(profile, "Original resume");
    try {
      window.localStorage.removeItem("applypilot.profile");
    } catch {
      /* IndexedDB migration already succeeded. */
    }
    return library;
  }
  return { activeResumeId: null, resumes: [] };
}

export async function loadResumeProfile(id: string): Promise<ResumeExtraction> {
  const db = await database();
  const raw = await result(db.transaction("profiles").objectStore("profiles").get(id));
  const parsed = browserDraftResumeSchema.safeParse(raw);
  if (parsed.success) return parsed.data;
  throw new Error("This resume could not be read. Select another resume or upload it again.");
}

export async function exportResumeLibrary() {
  const library = await loadResumeLibrary();
  const entries = await Promise.all(
    library.resumes.map(async (entry) => ({ entry, profile: await loadResumeProfile(entry.id) }))
  );
  return { library, entries };
}

export async function replaceResumeLibrary(
  library: ResumeLibrary,
  entries: Array<{ entry: ResumeEntry; profile: ResumeExtraction }>
): Promise<void> {
  const db = await database();
  const tx = db.transaction(["metadata", "profiles"], "readwrite");
  const done = completed(tx);
  tx.objectStore("metadata").put(validLibrary(library), metadataKey);
  const profiles = tx.objectStore("profiles");
  profiles.clear();
  for (const { entry, profile } of entries) {
    profiles.put(browserDraftResumeSchema.parse(profile), entry.id);
  }
  await done;
}

async function mutate(
  change: (lib: ResumeLibrary, profiles: IDBObjectStore) => ResumeLibrary
): Promise<ResumeLibrary> {
  const db = await database();
  const tx = db.transaction(["metadata", "profiles"], "readwrite");
  const done = completed(tx);
  const metadata = tx.objectStore("metadata");
  let next: ResumeLibrary;
  try {
    const library = validLibrary(await result(metadata.get(metadataKey)));
    next = change(library, tx.objectStore("profiles"));
    metadata.put(next, metadataKey);
  } catch (error) {
    try {
      tx.abort();
    } catch {
      /* The request may already have aborted the transaction. */
    }
    await done.catch(() => undefined);
    throw error;
  }
  await done;
  return next;
}
function nameOf(name: string) {
  const value = name.trim().slice(0, 120);
  if (!value) throw new Error("Give the resume a name.");
  return value;
}
function requireEntry(lib: ResumeLibrary, id: string) {
  const entry = lib.resumes.find((r) => r.id === id);
  if (!entry) throw new Error("Resume no longer exists.");
  return entry;
}
export async function addResume(
  profile: ResumeExtraction,
  name: string,
  contentHash?: string
): Promise<ResumeLibrary> {
  const validated = browserDraftResumeSchema.parse(profile);
  return mutate((lib, profiles) => {
    const duplicate = contentHash
      ? lib.resumes.find((entry) => entry.contentHash === contentHash)
      : undefined;
    if (duplicate) return { ...lib, activeResumeId: duplicate.id };
    const id = crypto.randomUUID();
    const now = new Date().toISOString();
    profiles.put(validated, id);
    return {
      activeResumeId: id,
      resumes: [
        ...lib.resumes,
        { id, name: nameOf(name), createdAt: now, updatedAt: now, ...(contentHash ? { contentHash } : {}) }
      ]
    };
  });
}
export async function updateResume(id: string, profile: ResumeExtraction): Promise<ResumeLibrary> {
  const validated = browserDraftResumeSchema.parse(profile);
  return mutate((lib, profiles) => {
    requireEntry(lib, id);
    profiles.put(validated, id);
    return {
      ...lib,
      resumes: lib.resumes.map((r) => (r.id === id ? { ...r, updatedAt: new Date().toISOString() } : r))
    };
  });
}
export async function selectResume(id: string): Promise<ResumeLibrary> {
  return mutate((lib) => {
    requireEntry(lib, id);
    return { ...lib, activeResumeId: id };
  });
}
export async function renameResume(id: string, name: string): Promise<ResumeLibrary> {
  return mutate((lib) => {
    requireEntry(lib, id);
    return {
      ...lib,
      resumes: lib.resumes.map((r) =>
        r.id === id ? { ...r, name: nameOf(name), updatedAt: new Date().toISOString() } : r
      )
    };
  });
}
export async function deleteResume(id: string): Promise<ResumeLibrary> {
  return mutate((lib, profiles) => {
    requireEntry(lib, id);
    profiles.delete(id);
    const resumes = lib.resumes.filter((entry) => entry.id !== id);
    if (resumes.length === 0) {
      // Keep an editable, persistable draft after the final saved version is removed.
      const replacementId = crypto.randomUUID();
      const now = new Date().toISOString();
      profiles.put(emptyResume, replacementId);
      return {
        activeResumeId: replacementId,
        resumes: [{ id: replacementId, name: "Untitled resume", createdAt: now, updatedAt: now }]
      };
    }
    return { resumes, activeResumeId: lib.activeResumeId === id ? resumes[0]!.id : lib.activeResumeId };
  });
}
export async function clearResumeLibrary(): Promise<void> {
  const db = await database();
  const tx = db.transaction(["metadata", "profiles"], "readwrite");
  const done = completed(tx);
  tx.objectStore("metadata").clear();
  tx.objectStore("profiles").clear();
  await done;
  try {
    window.localStorage.removeItem("applypilot.profile");
  } catch {
    /* IndexedDB cleared successfully. */
  }
}

export async function hashResumeFile(file: Blob): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", await file.arrayBuffer());
  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, "0")).join("");
}
export async function findResumeByHash(hash: string): Promise<ResumeEntry | null> {
  const db = await database();
  const stored = await result(db.transaction("metadata").objectStore("metadata").get(metadataKey));
  return validLibrary(stored).resumes.find((entry) => entry.contentHash === hash) ?? null;
}
