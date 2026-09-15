import { NextResponse } from "next/server";

export function errorResponse(error: unknown) {
  const message =
    error instanceof Error ? error.message : "JR 遇到了未知错误，请重试。";
  console.error("[jr]", error);
  return NextResponse.json({ error: message }, { status: 400 });
}
