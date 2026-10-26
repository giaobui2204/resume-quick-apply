import { ApplicationAssistPackageSchema, type ApplicationAssistPackage } from "@quick-apply/shared";
const key = "applicationAssistPackage";
export async function loadAssistPackage(): Promise<ApplicationAssistPackage | null> {
  const value = (await chrome.storage.local.get(key))[key];
  const parsed = ApplicationAssistPackageSchema.safeParse(value);
  return parsed.success ? parsed.data : null;
}
export async function saveAssistPackage(raw: unknown): Promise<ApplicationAssistPackage> {
  const value = ApplicationAssistPackageSchema.parse(raw);
  await chrome.storage.local.set({ [key]: value });
  return value;
}
export async function clearAssistPackage() {
  await chrome.storage.local.remove(key);
}
