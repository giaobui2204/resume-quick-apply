export type ExtensionProfile = {
  legalName: string;
  email: string;
  phone: string;
  linkedIn: string;
  location: string;
  verifiedAt: string;
};

export type FieldMatch = {
  element: HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement;
  label: string;
  key: keyof ExtensionProfile | null;
  value: string | null;
  protected: boolean;
};

const protectedPattern = /\b(?:gender|race|ethnic|disability|veteran|criminal|salary|signature|attest)\b/i;

export function discoverFields(profile: ExtensionProfile): FieldMatch[] {
  const elements = [...document.querySelectorAll<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>("input:not([type=hidden]):not([type=submit]), textarea, select")];
  return elements.map((element) => {
    const label = fieldLabel(element);
    const protectedField = protectedPattern.test(label);
    const key = protectedField ? null : mapKey(label, element);
    return { element, label, key, value: key ? profile[key] : null, protected: protectedField };
  });
}

function fieldLabel(element: HTMLElement) {
  const id = element.id;
  const explicit = id
    ? [...document.querySelectorAll<HTMLLabelElement>("label[for]")].find((label) => label.htmlFor === id)?.textContent
    : "";
  const wrapping = element.closest("label")?.innerText;
  const aria = element.getAttribute("aria-label");
  const placeholder = element.getAttribute("placeholder");
  const name = element.getAttribute("name");
  return [explicit, wrapping, aria, placeholder, name].find((value) => value?.trim())?.trim() ?? "Unlabeled field";
}

function mapKey(label: string, element: HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement): keyof ExtensionProfile | null {
  const value = `${label} ${element.getAttribute("autocomplete") ?? ""}`.toLowerCase();
  if (/\b(?:full|legal|candidate)?\s*name\b|autocomplete.*name/.test(value) && !/\bcompany\b/.test(value)) return "legalName";
  if (/\be-?mail\b/.test(value)) return "email";
  if (/\b(?:phone|mobile|telephone|tel)\b/.test(value)) return "phone";
  if (/\blinked\s*in\b/.test(value)) return "linkedIn";
  if (/\b(?:current\s+)?(?:city|location)\b/.test(value)) return "location";
  return null;
}

export function fillField(match: FieldMatch) {
  if (!match.value || match.protected || match.element.value) return false;
  const prototype = match.element instanceof HTMLInputElement ? HTMLInputElement.prototype :
    match.element instanceof HTMLTextAreaElement ? HTMLTextAreaElement.prototype : HTMLSelectElement.prototype;
  const setter = Object.getOwnPropertyDescriptor(prototype, "value")?.set;
  setter?.call(match.element, match.value);
  match.element.dispatchEvent(new Event("input", { bubbles: true }));
  match.element.dispatchEvent(new Event("change", { bubbles: true }));
  match.element.dataset.applypilotFilled = "true";
  return true;
}
