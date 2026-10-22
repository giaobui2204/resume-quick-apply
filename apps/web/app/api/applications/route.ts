import { ApplicationSchema } from "@quick-apply/shared";
import { NextResponse } from "next/server";

export async function POST(request: Request) {
  const body = await request.json().catch(() => null);
  const parsed = ApplicationSchema.safeParse(body);
  if (!parsed.success)
    return NextResponse.json(
      { error: "Invalid application payload", issues: parsed.error.flatten() },
      { status: 400 }
    );
  return NextResponse.json({ application: parsed.data }, { status: 201 });
}
