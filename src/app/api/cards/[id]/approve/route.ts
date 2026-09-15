import { NextResponse } from "next/server";

import { errorResponse } from "@/lib/jr/http";
import { getCard, markMerged } from "@/lib/jr/store";
import { approveAndMerge } from "@/lib/jr/worktree";

export const runtime = "nodejs";

export async function POST(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await params;
    const card = getCard(id);
    if (!card) {
      return NextResponse.json({ error: "未找到这张 JR 卡片。" }, { status: 404 });
    }
    if (card.status !== "ready_review") {
      return NextResponse.json(
        { error: "只有“待审批”卡片可以合并。" },
        { status: 409 },
      );
    }

    const mergeCommit = await approveAndMerge(card);
    const mergedCard = markMerged(id, mergeCommit);
    return NextResponse.json({ card: mergedCard, mergeCommit });
  } catch (error) {
    return errorResponse(error);
  }
}
