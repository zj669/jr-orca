import { NextResponse } from "next/server";

import { errorResponse } from "@/lib/jr/http";
import { createCard } from "@/lib/jr/store";

export const runtime = "nodejs";

function readString(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

export async function POST(request: Request) {
  try {
    const input: unknown = await request.json();
    const record =
      typeof input === "object" && input !== null
        ? (input as Record<string, unknown>)
        : {};
    const title = readString(record.title);
    const description = readString(record.description);

    if (title.length < 3 || title.length > 120) {
      return NextResponse.json(
        { error: "标题需要在 3 到 120 个字符之间。" },
        { status: 422 },
      );
    }
    if (description.length < 8 || description.length > 1200) {
      return NextResponse.json(
        { error: "任务说明需要在 8 到 1200 个字符之间。" },
        { status: 422 },
      );
    }

    return NextResponse.json({ card: createCard({ title, description }) }, { status: 201 });
  } catch (error) {
    return errorResponse(error);
  }
}
