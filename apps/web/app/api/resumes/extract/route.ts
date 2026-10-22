import OpenAI from "openai";
import { NextResponse } from "next/server";
import { extractWithOllama } from "@/lib/ollama";
import { extractResumeText } from "@/lib/resume-text";
import { resumeJsonSchema } from "@/lib/resume-schema";
import { parseResumeExtraction } from "@/lib/parse-resume";

export const runtime = "nodejs";

export async function POST(request: Request) {
  const form = await request.formData();
  const file = form.get("resume");
  if (!(file instanceof File)) return NextResponse.json({ error: "Choose a resume file." }, { status: 400 });
  if (file.size > 10 * 1024 * 1024) return NextResponse.json({ error: "Resume must be 10 MB or smaller." }, { status: 400 });
  const allowed = ["application/pdf", "application/vnd.openxmlformats-officedocument.wordprocessingml.document"];
  if (!allowed.includes(file.type)) return NextResponse.json({ error: "Only PDF and DOCX resumes are supported." }, { status: 415 });
  try {
    const provider = (process.env.AI_PROVIDER || "ollama").toLowerCase();
    if (provider === "ollama") {
      const text = await extractResumeText(file);
      return NextResponse.json({ profile: await extractWithOllama(text), provider });
    }
    if (provider === "openai") {
      return NextResponse.json({ profile: await extractWithOpenAI(file), provider });
    }
    return NextResponse.json({ error: `Unsupported AI_PROVIDER "${provider}". Use "ollama" or "openai".` }, { status: 503 });
  } catch (error) {
    console.error("resume_extraction_failed", error instanceof Error ? error.name : "unknown");
    return NextResponse.json({
      error: error instanceof Error ? error.message : "The resume could not be extracted."
    }, { status: 502 });
  }
}

async function extractWithOpenAI(file: File) {
  if (!process.env.OPENAI_API_KEY) throw new Error("OPENAI_API_KEY is required when AI_PROVIDER=openai.");
  const client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
  const uploaded = await client.files.create({ file, purpose: "user_data" });
  const response = await client.responses.create({
    model: process.env.OPENAI_MODEL || "gpt-5.6-terra",
    input: [{
      role: "user",
      content: [
        { type: "input_file", file_id: uploaded.id },
        { type: "input_text", text: "Extract only facts explicitly present in this resume. Never infer missing information. Use empty strings and arrays for missing fields. Assign a short unique string id to every list item." }
      ]
    }],
    text: {
      format: {
        type: "json_schema",
        name: "resume_extraction",
        strict: true,
        schema: resumeJsonSchema()
      }
    }
  });
  return parseResumeExtraction(JSON.parse(response.output_text));
}
