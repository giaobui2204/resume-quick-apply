import { type ApplicationAssistPackage } from "@quick-apply/shared";
import { clearAssistPackage, loadAssistPackage, saveAssistPackage } from "./assist-storage";

type Preview = {
  id: string;
  key: string | null;
  label: string;
  value: string | null;
  required: boolean;
  reason: string;
  source?: string;
};
let packageValue: ApplicationAssistPackage | null = null;
let busy = false;
const preview = document.querySelector<HTMLDivElement>("#field-preview")!;
const fillButton = document.querySelector<HTMLButtonElement>("#fill")!;
function status(message: string, error = false) {
  const target = document.querySelector<HTMLElement>("#status")!;
  target.textContent = message;
  target.className = error ? "error" : "";
}
function renderPackage() {
  const target = document.querySelector<HTMLElement>("#package-summary")!;
  target.replaceChildren();
  if (!packageValue) {
    target.textContent =
      "No reviewed application package imported. Download one from Applications in the web app.";
    return;
  }
  const heading = document.createElement("strong");
  heading.textContent = `${packageValue.job.company} · ${packageValue.job.title}`;
  const text = document.createElement("p");
  text.textContent = `Resume: ${packageValue.resume.name} · ${packageValue.fields.length} reviewed values. Snapshot reviewed ${new Date(packageValue.reviewedAt).toLocaleString()}.`;
  const link = document.createElement("a");
  link.href = packageValue.job.canonicalUrl;
  link.target = "_blank";
  link.rel = "noreferrer";
  link.textContent = "Open this exact job ↗";
  target.append(heading, text, link);
}
function renderFields(fields: Preview[]) {
  preview.replaceChildren();
  fillButton.disabled = true;
  if (!fields.length) {
    preview.textContent =
      "No supported form controls detected. Open the application form and rescan; embedded or multi-step forms may need manual completion.";
    return;
  }
  for (const field of fields) {
    const row = document.createElement("div");
    row.className = "preview-row";
    const label = document.createElement("label");
    const checkbox = document.createElement("input");
    checkbox.type = "checkbox";
    checkbox.disabled = !field.value;
    checkbox.checked = false;
    if (field.key && field.value) checkbox.value = `${field.key}:${field.value}`;
    checkbox.addEventListener("change", () => {
      fillButton.disabled = !preview.querySelector("input:checked");
    });
    const name = document.createElement("strong");
    name.textContent = `${field.label}${field.required ? " · required" : ""}`;
    label.append(checkbox, name);
    row.append(label);
    const value = document.createElement("p");
    value.textContent = field.value ?? field.reason;
    row.append(value);
    if (field.source) {
      const source = document.createElement("small");
      source.textContent = `${field.source} · Exact mapping`;
      row.append(source);
    }
    preview.append(row);
  }
}
async function communicate(type: "assist.inspect" | "assist.fill") {
  if (busy) return;
  busy = true;
  fillButton.disabled = true;
  const inspect = document.querySelector<HTMLButtonElement>("#inspect")!;
  inspect.disabled = true;
  try {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    if (!tab?.id) throw new Error("Open the employer application tab first.");
    const selected = [...preview.querySelectorAll<HTMLInputElement>("input:checked")].map(
      (element) => element.value
    );
    const response = await chrome.tabs.sendMessage(tab.id, { type, selected });
    if (!response?.ok) throw new Error(response?.error ?? "Could not inspect this form.");
    renderFields(response.fields);
    status(
      response.result
        ? `${response.result.filled} filled · ${response.result.skipped} skipped · ${response.result.failed} failed. Review every answer, attach your resume, and submit manually on the employer’s form.`
        : "Review values below and select only the fields you want filled. Existing and protected answers stay untouched."
    );
  } catch (error) {
    preview.replaceChildren();
    status(
      error instanceof Error
        ? error.message
        : "Open a supported Greenhouse or Lever application tab and rescan.",
      true
    );
  } finally {
    busy = false;
    inspect.disabled = false;
  }
}
document.querySelector("#import")!.addEventListener("change", (event) => {
  void (async () => {
    if (busy) return;
    const input = event.target as HTMLInputElement;
    const file = input.files?.[0];
    input.value = "";
    if (!file) return;
    if (file.size > 100_000) throw new Error("Application packages must be smaller than 100 KB.");
    const imported = await saveAssistPackage(JSON.parse(await file.text()));
    packageValue = imported;
    preview.replaceChildren();
    fillButton.disabled = true;
    renderPackage();
    status("Package imported locally. Open its exact application and click Review form fields.");
  })().catch((error) => status(error instanceof Error ? error.message : "Invalid package.", true));
});
document.querySelector("#inspect")!.addEventListener("click", () => void communicate("assist.inspect"));
fillButton.addEventListener("click", () => void communicate("assist.fill"));
document.querySelector("#clear")!.addEventListener("click", () => {
  if (busy) return;
  void clearAssistPackage()
    .then(() => {
      packageValue = null;
      renderPackage();
      preview.replaceChildren();
      fillButton.disabled = true;
      status("Imported package deleted from this browser. Delete the downloaded JSON file separately.");
    })
    .catch(() => status("Could not delete the package. Try again.", true));
});
void loadAssistPackage()
  .then((value) => {
    packageValue = value;
    renderPackage();
  })
  .catch(() => status("Local extension storage is unavailable.", true));
