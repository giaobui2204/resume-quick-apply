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

export function fillField(match: Pick<FieldMatch, "element" | "value" | "protected">) {
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

export type AssistMatch = Omit<FieldMatch, "key"> & {
  id: string;
  key: import("@quick-apply/shared").AssistFieldKey | null;
  required: boolean;
  reason: string;
  source?: string;
};

export function discoverAssistFields(fields: import("@quick-apply/shared").AssistField[]): AssistMatch[] {
  const supplied = new Map(fields.map((field) => [field.key, field]));
  const elements = [
    ...document.querySelectorAll<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>(
      "input, textarea, select"
    )
  ].filter((element) => {
    if (element instanceof HTMLInputElement && ["hidden", "submit", "button", "reset"].includes(element.type))
      return false;
    for (let parent: HTMLElement | null = element; parent; parent = parent.parentElement) {
      if (
        parent.hidden ||
        parent.hasAttribute("inert") ||
        getComputedStyle(parent).display === "none" ||
        getComputedStyle(parent).visibility === "hidden"
      )
        return false;
    }
    return true;
  });
  const matches = elements.map((element, index): AssistMatch => {
    const label = fieldLabel(element);
    const context = element.closest("fieldset")?.querySelector("legend")?.textContent ?? "";
    const protectedField =
      protectedPattern.test(`${label} ${context}`) ||
      /\b(?:reference|referee|emergency contact)\b/i.test(context);
    const normalized = label
      .toLowerCase()
      .replace(/[_-]+/g, " ")
      .replace(/\s*\*\s*$/, "")
      .replace(/\s+/g, " ")
      .trim();
    const aliases: [import("@quick-apply/shared").AssistFieldKey, RegExp][] = [
      ["givenName", /^(?:first|given) name$/],
      ["familyName", /^(?:(?:last|family) name|surname)$/],
      ["legalName", /^(?:(?:full|legal|candidate) )?name$/],
      ["email", /^e ?mail(?: address)?$/],
      ["phone", /^(?:phone|mobile|telephone|tel)(?: number)?$/],
      ["linkedIn", /^linked ?in(?: (?:url|profile|profile url))?$/],
      ["location", /^(?:current )?location$/],
      ["currentCompany", /^current (?:company|employer)$/],
      ["currentJobTitle", /^current (?:job )?title$/],
      ["school", /^(?:school|university|school \/ university|school name|university name)$/],
      ["degree", /^degree$/],
      ["fieldOfStudy", /^(?:field of study|major)$/],
      ["skills", /^skills$/]
    ];
    let key = aliases.find(([, pattern]) => pattern.test(normalized))?.[0] ?? null;
    const autocomplete = element.autocomplete?.trim().split(/\s+/).at(-1);
    if (autocomplete === "given-name" && /^(?:name|first name|given name|unlabeled field)$/.test(normalized))
      key = "givenName";
    if (autocomplete === "family-name" && /^(?:name|last name|family name|unlabeled field)$/.test(normalized))
      key = "familyName";
    const field = key ? supplied.get(key) : undefined;
    const eligible = isEligibleControl(element);
    const reason = protectedField
      ? "Protected answer · complete manually"
      : !eligible
        ? "Unsupported or unavailable control · complete manually"
        : element.value
          ? "Existing answer preserved"
          : !field
            ? "No reviewed value · complete manually"
            : element instanceof HTMLSelectElement &&
                ![...element.options].some((option) => option.value === field.value && !option.disabled)
              ? "No exact option · complete manually"
              : "Ready to review";
    return {
      id: `field-${index}`,
      element,
      label,
      key: protectedField ? null : key,
      value: reason === "Ready to review" ? field!.value : null,
      protected: protectedField,
      required: element.required || element.getAttribute("aria-required") === "true",
      reason,
      source: field
        ? `${field.source.kind === "user" ? "Edited by you" : (field.source.label ?? `Resume ${field.source.section}`)} · ${field.source.field}`
        : undefined
    };
  });
  const counts = new Map<string, number>();
  for (const match of matches) if (match.key) counts.set(match.key, (counts.get(match.key) ?? 0) + 1);
  return matches.map((match) =>
    match.key && (counts.get(match.key) ?? 0) > 1
      ? { ...match, value: null, reason: "Repeated field · complete manually" }
      : match
  );
}
