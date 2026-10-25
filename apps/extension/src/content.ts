import { canonicalAssistUrl } from "@quick-apply/shared";
import { discoverAssistFields, fillField } from "./field-mapper";
import { loadAssistPackage } from "./assist-storage";

// Inspection and filling run only on explicit extension UI messages. No profile
// preview or export package is inserted into the employer page's DOM.
chrome.runtime.onMessage.addListener((message: unknown, sender, sendResponse) => {
  if (sender.id !== chrome.runtime.id || !message || typeof message !== "object") return false;
  const request = message as { type?: string; selected?: unknown };
  if (!["assist.inspect", "assist.fill"].includes(request.type ?? "")) return false;
  void (async () => {
    const value = await loadAssistPackage();
    if (!value) throw new Error("Import a reviewed application package first.");
    const target = canonicalAssistUrl(location.href);
    if (!target || target !== canonicalAssistUrl(value.job.canonicalUrl))
      throw new Error("Job mismatch. Open the exact job in your reviewed package.");
    if (document.querySelector('[class*="captcha" i], iframe[src*="captcha" i], [data-sitekey]'))
      throw new Error("CAPTCHA detected. Continue manually; no fields were filled.");
    const matches = discoverAssistFields(value.fields);
    if (request.type === "assist.fill") {
      if (
        !Array.isArray(request.selected) ||
        request.selected.length > 100 ||
        !request.selected.every((item) => typeof item === "string")
      )
        throw new Error("Select the fields you reviewed.");
      const selected = new Set(request.selected);
      // The popup returns keys and the exact proposed values it showed. Re-scan
      // and compare them so a changed DOM cannot redirect a previous selection.
      let filled = 0;
      let failed = 0;
      const written: {
        element: HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement;
        value: string;
      }[] = [];
      for (const match of matches) {
        if (!match.key || !match.value || !selected.has(`${match.key}:${match.value}`)) continue;
        if (fillField(match)) {
          filled++;
          written.push({ element: match.element, value: match.value });
        } else failed++;
      }
      await new Promise((resolve) => setTimeout(resolve, 75));
      for (const entry of written)
        if (!entry.element.isConnected || entry.element.value !== entry.value) {
          filled--;
          failed++;
        }
      const skipped = selected.size - filled - failed;
      sendResponse({
        ok: true,
        result: { filled, skipped, failed },
        fields: serializable(
          discoverAssistFields(value.fields).map((match) =>
            written.some(
              (entry) =>
                entry.element === match.element &&
                entry.element.isConnected &&
                entry.element.value === entry.value
            )
              ? { ...match, value: null, reason: "Filled by ApplyPilot · review this answer" }
              : match
          )
        )
      });
      return;
    }
    sendResponse({ ok: true, fields: serializable(matches) });
  })().catch((error) =>
    sendResponse({
      ok: false,
      error: error instanceof Error ? error.message : "Could not inspect the application form."
    })
  );
  return true;
});
function serializable(matches: ReturnType<typeof discoverAssistFields>) {
  return matches.map(({ element: _, ...match }) => match);
}
