export type ExtensionProfile = {
  legalName: string;
  email: string;
  phone: string;
  linkedIn: string;
  location: string;
  verifiedAt: string;
};

const storageKey = "verifiedProfile";

export async function loadVerifiedProfile(): Promise<ExtensionProfile | null> {
  const synced = await chrome.storage.sync.get(storageKey);
  if (isProfile(synced[storageKey])) return synced[storageKey];

  // Migrate profiles saved by earlier extension builds.
  const local = await chrome.storage.local.get(storageKey);
  if (isProfile(local[storageKey])) {
    await chrome.storage.sync.set({ [storageKey]: local[storageKey] });
    return local[storageKey];
  }
  return null;
}

export async function saveVerifiedProfile(profile: ExtensionProfile): Promise<void> {
  // Sync survives extension reloads/reinstalls when Chrome Sync is enabled.
  // Local is retained as an offline fallback for browsers without Sync.
  await Promise.all([
    chrome.storage.sync.set({ [storageKey]: profile }),
    chrome.storage.local.set({ [storageKey]: profile })
  ]);

  const saved = await chrome.storage.sync.get(storageKey);
  if (!isProfile(saved[storageKey]) || saved[storageKey].verifiedAt !== profile.verifiedAt) {
    throw new Error("Chrome did not confirm the saved profile.");
  }
}

function isProfile(value: unknown): value is ExtensionProfile {
  if (!value || typeof value !== "object") return false;
  const profile = value as Partial<ExtensionProfile>;
  return typeof profile.legalName === "string"
    && typeof profile.email === "string"
    && typeof profile.phone === "string"
    && typeof profile.linkedIn === "string"
    && typeof profile.location === "string"
    && typeof profile.verifiedAt === "string";
}
