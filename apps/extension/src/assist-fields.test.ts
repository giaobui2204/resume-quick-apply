import { beforeEach, describe, expect, it } from "vitest";
import type { AssistField } from "@quick-apply/shared";
import { discoverAssistFields, fillField } from "./field-mapper";
const fields: AssistField[] = [
  { key: "givenName", value: "Ada", source: { kind: "user", section: "contact", field: "givenName" } },
  { key: "email", value: "ada@example.com", source: { kind: "resume", section: "contact", field: "email" } },
  {
    key: "school",
    value: "Example University",
    source: { kind: "resume", section: "education", recordId: "one", field: "school" }
  },
  { key: "skills", value: "TypeScript", source: { kind: "resume", section: "skills", field: "skills" } }
];
beforeEach(() => {
  document.body.innerHTML = "";
});
describe("reviewed package form mapping", () => {
  it("fills explicit names without splitting and reports manual requirements", () => {
    document.body.innerHTML =
      '<label>First name<input required></label><label>Email<input value="existing@example.com"></label><label>Resume<input type="file" required></label><label>Sponsorship<input></label><label>Skills<textarea></textarea></label>';
    const matches = discoverAssistFields(fields);
    expect(matches[0]).toMatchObject({ key: "givenName", value: "Ada", required: true });
    expect(matches[1]).toMatchObject({ value: null, reason: "Existing answer preserved" });
    expect(matches[2]).toMatchObject({ value: null, required: true });
    expect(matches[3]).toMatchObject({ value: null, protected: true });
    expect(matches.filter((match) => match.value).filter(fillField)).toHaveLength(2);
  });
  it("leaves repeated or reference-context fields untouched and rescans after DOM changes", () => {
    document.body.innerHTML =
      "<label>School<input></label><label>School<input></label><fieldset><legend>Reference contact</legend><label>Email<input></label></fieldset>";
    expect(discoverAssistFields(fields).every((match) => match.value === null)).toBe(true);
    document.body.innerHTML = "<label>School<input></label>";
    expect(discoverAssistFields(fields)[0]?.value).toBe("Example University");
  });
  it("protects changed, disabled and non-exact select values at fill time", () => {
    document.body.innerHTML =
      '<label>Skills<input></label><label>School<select><option value="">Choose</option><option value="id-1">Example University</option></select></label>';
    const matches = discoverAssistFields(fields);
    matches[0]!.element.value = "User typed";
    expect(fillField(matches[0]!)).toBe(false);
    expect(matches[1]?.value).toBeNull();
  });
});
