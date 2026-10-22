import { afterEach, describe, expect, it, vi } from "vitest";
import { emptyResume } from "./demo-data";
import { browserDraftResumeSchema, readLocal, storedJobsSchema, writeLocal } from "./storage";

afterEach(() => vi.unstubAllGlobals());

function stored(value: string) {
  vi.stubGlobal("window", { localStorage: { getItem: () => value } });
}

describe("browser persistence", () => {
  it("recovers from malformed JSON and incompatible stored shapes", () => {
    for (const value of [
      "{",
      "null",
      "{}",
      '{"contact":null}',
      '{"schemaVersion":1,"contact":{"legalName":42}}'
    ]) {
      stored(value);
      expect(readLocal("profile", emptyResume, browserDraftResumeSchema)).toBe(emptyResume);
    }
    stored('[{"id":"incomplete-job"}]');
    expect(readLocal("jobs", [], storedJobsSchema)).toEqual([]);
  });

  it("keeps incomplete contact drafts after reload and restores schema defaults", () => {
    stored(
      JSON.stringify({
        schemaVersion: 1,
        contact: { email: "unfinished@", linkedIn: "linkedin.com/in/draft" }
      })
    );
    const result = readLocal("profile", emptyResume, browserDraftResumeSchema);
    expect(result.contact.email).toBe("unfinished@");
    expect(result.contact.linkedIn).toBe("linkedin.com/in/draft");
    expect(result.skills).toEqual([]);
    expect(result.contact.legalName).toBe("");
  });

  it("recovers when browser storage access is unavailable", () => {
    vi.stubGlobal("window", {
      localStorage: {
        getItem() {
          throw new Error("Access denied");
        }
      }
    });
    expect(readLocal("profile", emptyResume, browserDraftResumeSchema)).toBe(emptyResume);
  });

  it("reports denied or quota-exceeded writes without throwing", () => {
    vi.stubGlobal("window", {
      localStorage: {
        setItem() {
          throw new Error("Quota exceeded");
        }
      }
    });
    expect(writeLocal("profile", emptyResume)).toBe(false);
    const setItem = vi.fn();
    vi.stubGlobal("window", { localStorage: { setItem } });
    expect(writeLocal("profile", emptyResume)).toBe(true);
    expect(setItem).toHaveBeenCalledWith("profile", JSON.stringify(emptyResume));
  });
});
