import { beforeEach, describe, expect, it, vi } from "vitest";
import { loadVerifiedProfile, saveVerifiedProfile, type ExtensionProfile } from "./profile-storage";

const profile: ExtensionProfile = {
  legalName: "Ada Lovelace",
  email: "ada@example.com",
  phone: "555-0100",
  linkedIn: "https://linkedin.com/in/ada",
  location: "San Francisco, CA",
  verifiedAt: "2026-07-31T12:00:00.000Z"
};

describe("extension profile persistence", () => {
  let local: Record<string, unknown>;
  let sync: Record<string, unknown>;

  beforeEach(() => {
    local = {};
    sync = {};
    vi.stubGlobal("chrome", {
      storage: {
        local: area(local),
        sync: area(sync)
      }
    });
  });

  it("round-trips a profile through sync and local storage", async () => {
    await saveVerifiedProfile(profile);
    await expect(loadVerifiedProfile()).resolves.toEqual(profile);
    expect(local.verifiedProfile).toEqual(profile);
    expect(sync.verifiedProfile).toEqual(profile);
  });

  it("migrates a profile saved by the previous local-only build", async () => {
    local.verifiedProfile = profile;
    await expect(loadVerifiedProfile()).resolves.toEqual(profile);
    expect(sync.verifiedProfile).toEqual(profile);
  });

  function area(store: Record<string, unknown>) {
    return {
      get: vi.fn(async (key: string) => ({ [key]: store[key] })),
      set: vi.fn(async (values: Record<string, unknown>) => {
        Object.assign(store, values);
      })
    };
  }
});
