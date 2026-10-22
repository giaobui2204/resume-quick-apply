import { type ResumeExtraction } from "@quick-apply/shared";
import { resumeJsonSchema } from "./resume-schema";
import { parseResumeExtraction } from "./parse-resume";

type OllamaChatResponse = {
  message?: { content?: string };
  error?: string;
};

export async function extractWithOllama(resumeText: string): Promise<ResumeExtraction> {
  const baseUrl = (process.env.OLLAMA_BASE_URL || "http://127.0.0.1:11434").replace(/\/$/, "");
  const model = process.env.OLLAMA_MODEL || "qwen3:4b";
  let response: Response;

  try {
    response = await fetch(`${baseUrl}/api/chat`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        model,
        stream: false,
        think: false,
        format: resumeJsonSchema(),
        options: { temperature: 0 },
        messages: [
          {
            role: "system",
            content: "You extract resume facts. Never infer or embellish. Missing fields must be empty strings or arrays. Preserve dates as written. Give every list item a short unique string id."
          },
          {
            role: "user",
            content: `Extract this resume into the required JSON schema:\n\n${resumeText}`
          }
        ]
      }),
      signal: AbortSignal.timeout(120_000)
    });
  } catch (error) {
    if (error instanceof Error && (error.name === "TimeoutError" || error.name === "AbortError")) {
      throw new Error("Ollama timed out while reading the resume.");
    }
    throw new Error("Ollama is not running. Start it with `ollama serve` and try again.");
  }

  const result = await response.json().catch(() => ({})) as OllamaChatResponse;
  if (!response.ok) {
    const missing = response.status === 404 || result.error?.toLowerCase().includes("not found");
    throw new Error(missing
      ? `Ollama model "${model}" is missing. Run \`ollama pull ${model}\`.`
      : result.error || `Ollama returned HTTP ${response.status}.`);
  }

  if (!result.message?.content) throw new Error("Ollama returned an empty response.");
  return parseResumeExtraction(JSON.parse(result.message.content));
}
