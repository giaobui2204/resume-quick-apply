import { afterEach, describe, expect, it, vi } from "vitest";
import { extractWithOllama } from "./ollama";

const validProfile = {
  schemaVersion: 1,
  contact: {
    legalName: "Ada Lovelace",
    preferredName: "Ada",
    email: "ada@example.com",
    phone: "",
    location: "",
    linkedIn: "",
    github: "",
    portfolio: ""
  },
  summary: "",
  experiences: [],
  educations: [],
  projects: [],
  skills: ["Mathematics"],
  certifications: [],
  warnings: []
};

describe("Ollama resume provider", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    delete process.env.OLLAMA_MODEL;
  });

  it("validates a structured Ollama response", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        new Response(
          JSON.stringify({
            message: { content: JSON.stringify(validProfile) }
          }),
          { status: 200 }
        )
      )
    );

    await expect(extractWithOllama("Ada Lovelace resume text long enough")).resolves.toEqual(validProfile);
  });

  it("provides the pull command for a missing model", async () => {
    process.env.OLLAMA_MODEL = "missing-model";
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        new Response(
          JSON.stringify({
            error: "model not found"
          }),
          { status: 404 }
        )
      )
    );

    await expect(extractWithOllama("Resume text")).rejects.toThrow("ollama pull missing-model");
  });
});
