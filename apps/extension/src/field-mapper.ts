import type { ExtensionProfile } from "./profile-storage";

export type FieldMatch = {
  element: HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement;
  label: string;
  key: keyof ExtensionProfile | null;
  value: string | null;
  protected: boolean;
};

const protectedPattern =
  /\b(?:gender|sex|race|ethnicity|ethnic|disabilit\w*|veteran\w*|criminal|salary|signature|attest\w*|certif\w*|consent|citizenship|authorization|sponsorship)\b/i;

export function discoverFields(profile: ExtensionProfile): FieldMatch[] {
  const elements = [
    ...document.querySelectorAll<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>(
      "input, textarea, select"
    )
  ].filter(isEligibleControl);
  return elements.map((element) => {
    const label = fieldLabel(element);
    const protectedField = protectedPattern.test(label);
    const key = protectedField ? null : mapKey(label, element);
    return { element, label, key, value: key ? profile[key] : null, protected: protectedField };
  });
}

function fieldLabel(element: HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement) {
  const associated = labelText(element.labels?.[0]);
  const aria = element.getAttribute("aria-label");
  const labelledBy = element
    .getAttribute("aria-labelledby")
    ?.split(/\s+/)
    .map((id) => document.getElementById(id)?.textContent ?? "")
    .join(" ");
  const placeholder = element.getAttribute("placeholder");
  const name = element.getAttribute("name");
  return (
    [associated, aria, labelledBy, placeholder, name].find((value) => value?.trim())?.trim() ??
    "Unlabeled field"
  );
}

function labelText(label: HTMLLabelElement | null | undefined) {
  if (!label) return "";
  const text = label.cloneNode(true) as HTMLLabelElement;
  text.querySelectorAll("input, textarea, select, button").forEach((control) => control.remove());
  return text.textContent;
}

function mapKey(
  label: string,
  element: HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement
): keyof ExtensionProfile | null {
  const value = label
    .toLowerCase()
    .replace(/[_-]+/g, " ")
    .replace(/\s*\*\s*$/, "")
    .replace(/\s+/g, " ")
    .trim();
  const autocomplete = element.getAttribute("autocomplete")?.trim().split(/\s+/).at(-1);
  // A verified full name cannot be split into given/family names safely.
  if (autocomplete === "given-name" || autocomplete === "family-name") return null;
  if (/^(?:(?:full|legal|candidate) )?name$/.test(value)) return "legalName";
  if (/^(?:e ?mail)(?: address)?$/.test(value)) return "email";
  if (/^(?:phone|mobile|telephone|tel)(?: number)?$/.test(value)) return "phone";
  if (/^linked ?in(?: (?:url|profile|profile url))?$/.test(value)) return "linkedIn";
  if (/^(?:current )?location$/.test(value)) return "location";
  // Autocomplete is useful only when there is no label contradicting it.
  if (value === "unlabeled field") {
    if (autocomplete === "name") return "legalName";
    if (autocomplete === "email") return "email";
    if (autocomplete === "tel") return "phone";
  }
  return null;
}

function isEligibleControl(element: HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement) {
  if (element.disabled || ("readOnly" in element && element.readOnly)) return false;
  if (
    element instanceof HTMLInputElement &&
    !["text", "email", "tel", "url", "search"].includes(element.type)
  )
    return false;
  for (let ancestor: HTMLElement | null = element; ancestor; ancestor = ancestor.parentElement) {
    if (ancestor.hidden || ancestor.hasAttribute("inert")) return false;
    const style = getComputedStyle(ancestor);
    if (style.display === "none" || style.visibility === "hidden" || style.visibility === "collapse")
      return false;
  }
  return true;
}

export function fillField(match: FieldMatch) {
  if (!match.value || match.protected || match.element.value || !isEligibleControl(match.element))
    return false;
  if (
    match.element instanceof HTMLSelectElement &&
    ![...match.element.options].some((option) => option.value === match.value && !option.disabled)
  )
    return false;
  const prototype =
    match.element instanceof HTMLInputElement
      ? HTMLInputElement.prototype
      : match.element instanceof HTMLTextAreaElement
        ? HTMLTextAreaElement.prototype
        : HTMLSelectElement.prototype;
  const setter = Object.getOwnPropertyDescriptor(prototype, "value")?.set;
  if (!setter) return false;
  setter.call(match.element, match.value);
  if (match.element.value !== match.value) return false;
  match.element.dispatchEvent(new Event("input", { bubbles: true }));
  match.element.dispatchEvent(new Event("change", { bubbles: true }));
  if (match.element.value !== match.value) return false;
  match.element.dataset.applypilotFilled = "true";
  return true;
}
