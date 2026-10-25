import { loadVerifiedProfile, saveVerifiedProfile, type ExtensionProfile } from "./profile-storage";

const keys: (keyof Omit<ExtensionProfile, "verifiedAt">)[] = [
  "legalName",
  "email",
  "phone",
  "linkedIn",
  "location"
];

async function init() {
  const profile = await loadVerifiedProfile();
  if (profile)
    for (const key of keys) {
      const input = document.querySelector<HTMLInputElement>(`#${key}`);
      if (input) input.value = profile[key];
    }
  if (profile) show(`Saved profile loaded · ${formatTime(profile.verifiedAt)}`);

  document.querySelector("#profile-form")?.addEventListener("submit", async (event) => {
    event.preventDefault();
    const next = Object.fromEntries(
      keys.map((key) => [key, document.querySelector<HTMLInputElement>(`#${key}`)?.value.trim() ?? ""])
    ) as Omit<ExtensionProfile, "verifiedAt">;
    if (!next.legalName || !next.email) return show("Legal name and email are required.", true);
    const saveButton = document.querySelector<HTMLButtonElement>("#save");
    if (saveButton) saveButton.disabled = true;
    try {
      const saved = { ...next, verifiedAt: new Date().toISOString() };
      await saveVerifiedProfile(saved);
      show(`Verified profile saved · ${formatTime(saved.verifiedAt)}`);
    } catch (error) {
      show(error instanceof Error ? error.message : "Profile could not be saved.", true);
    } finally {
      if (saveButton) saveButton.disabled = false;
    }
  });

  for (const key of keys) {
    document.querySelector(`#${key}`)?.addEventListener("input", () => show("Unsaved changes", true));
  }
}

function show(message: string, error = false) {
  const status = document.querySelector<HTMLElement>("#status");
  if (status) {
    status.textContent = message;
    status.style.color = error ? "#a44931" : "#39704d";
  }
}

function formatTime(value: string) {
  return new Intl.DateTimeFormat(undefined, { dateStyle: "medium", timeStyle: "short" }).format(
    new Date(value)
  );
}

void init().catch((error) =>
  show(error instanceof Error ? error.message : "Saved profile could not be loaded.", true)
);
