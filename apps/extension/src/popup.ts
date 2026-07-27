type ExtensionProfile = {
  legalName: string;
  email: string;
  phone: string;
  linkedIn: string;
  location: string;
  verifiedAt: string | null;
};

const keys: (keyof Omit<ExtensionProfile, "verifiedAt">)[] = ["legalName", "email", "phone", "linkedIn", "location"];

async function init() {
  const stored = await chrome.storage.local.get("verifiedProfile");
  const profile = stored.verifiedProfile as ExtensionProfile | undefined;
  if (profile) for (const key of keys) {
    const input = document.querySelector<HTMLInputElement>(`#${key}`);
    if (input) input.value = profile[key];
  }

  document.querySelector("#save")?.addEventListener("click", async () => {
    const next = Object.fromEntries(keys.map((key) => [key, document.querySelector<HTMLInputElement>(`#${key}`)?.value.trim() ?? ""])) as Omit<ExtensionProfile, "verifiedAt">;
    if (!next.legalName || !next.email) return show("Legal name and email are required.", true);
    await chrome.storage.local.set({ verifiedProfile: { ...next, verifiedAt: new Date().toISOString() } });
    show("Verified profile saved.");
  });
}

function show(message: string, error = false) {
  const status = document.querySelector<HTMLElement>("#status");
  if (status) { status.textContent = message; status.style.color = error ? "#a44931" : "#39704d"; }
}

void init();
