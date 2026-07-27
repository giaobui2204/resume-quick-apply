import { beforeEach, describe, expect, it } from "vitest";
import { discoverFields } from "./field-mapper";

const profile = {
  legalName: "Ada Lovelace",
  email: "ada@example.com",
  phone: "555-0100",
  linkedIn: "https://linkedin.com/in/ada",
  location: "San Francisco, CA",
  verifiedAt: new Date().toISOString()
};

describe("field mapping", () => {
  beforeEach(() => { document.body.innerHTML = ""; });

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
});
