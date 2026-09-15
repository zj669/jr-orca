import { NextResponse } from "next/server";

import { errorResponse } from "@/lib/jr/http";
import { getBoard } from "@/lib/jr/store";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export function GET() {
  try {
    return NextResponse.json(getBoard());
  } catch (error) {
    return errorResponse(error);
  }
}
