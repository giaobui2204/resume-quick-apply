import { beforeEach, describe, expect, it } from "vitest";
import { discoverFields, fillField } from "./field-mapper";

const profile = {
  legalName: "Ada Lovelace",
  email: "ada@example.com",
  phone: "555-0100",
  linkedIn: "https://linkedin.com/in/ada",
  location: "San Francisco, CA",
  verifiedAt: new Date().toISOString()
};

describe("field mapping", () => {
  beforeEach(() => {
    document.body.innerHTML = "";
  });

  it("maps standard contact fields", () => {
    document.body.innerHTML = '<label for="email">Email address</label><input id="email">';
    expect(discoverFields(profile)[0]?.key).toBe("email");
  });

  it("protects demographic fields", () => {
    document.body.innerHTML = '<label for="gender">Gender</label><select id="gender"></select>';
    const match = discoverFields(profile)[0];
    expect(match?.protected).toBe(true);
    expect(match?.value).toBeNull();
  });

  it.each([
    "First name",
    "Last name",
    "School name",
    "Reference name",
    "Preferred name",
    "LinkedIn profile name",
    "I certify my full name",
    "Ethnicity",
    "Disabilities",
    "Current city"
  ])("leaves ambiguous or protected '%s' unanswered", (label) => {
    document.body.innerHTML = `<label for="field">${label}</label><input id="field">`;
    expect(discoverFields(profile)[0]?.value).toBeNull();
  });

  it("does not split a verified name even with a generic label", () => {
    document.body.innerHTML = '<label>Name<input autocomplete="given-name"></label>';
    expect(discoverFields(profile)[0]?.value).toBeNull();
  });

  it("ignores unsupported and unavailable controls", () => {
    document.body.innerHTML = `
      ${["file", "password", "radio", "checkbox", "button", "hidden", "submit"].map((type) => `<input type="${type}" name="email">`).join("")}
      <input name="email" disabled><input name="email" readonly>
      <div hidden><input name="email"></div>
      <div style="display:none"><input name="email"></div>
      <input name="email" style="visibility:hidden">`;
    expect(discoverFields(profile)).toEqual([]);
  });

  it("fills verified exact contact fields and preserves existing answers", () => {
    document.body.innerHTML =
      '<label>Full name<input></label><label>Email address<input value="existing@example.com"></label><span id="phone-label">Phone number</span><input aria-labelledby="phone-label">';
    const matches = discoverFields(profile);
    expect(matches.map(fillField)).toEqual([true, false, true]);
    expect(matches.map((match) => match.element.value)).toEqual([
      profile.legalName,
      "existing@example.com",
      profile.phone
    ]);
  });

  it("requires an available exact select option and accurately counts fills", () => {
    document.body.innerHTML =
      '<label>Location<select><option value=""></option><option value="NY">New York</option></select></label>';
    const [match] = discoverFields(profile);
    expect(match).toBeDefined();
    expect(fillField(match!)).toBe(false);
    expect(match!.element.dataset.applypilotFilled).toBeUndefined();
    match!.element.innerHTML += `<option value="${profile.location}">${profile.location}</option>`;
    expect(fillField(match!)).toBe(true);
  });

  it("rechecks eligibility and detects a host rejecting a value", () => {
    document.body.innerHTML = "<label>Email<input></label>";
    const [match] = discoverFields(profile);
    (match!.element as HTMLInputElement).readOnly = true;
    expect(fillField(match!)).toBe(false);
    (match!.element as HTMLInputElement).readOnly = false;
    match!.element.addEventListener("input", () => {
      match!.element.value = "";
    });
    expect(fillField(match!)).toBe(false);
    expect(match!.element.dataset.applypilotFilled).toBeUndefined();
  });
});
