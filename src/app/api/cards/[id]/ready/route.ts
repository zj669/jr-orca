import { NextResponse } from "next/server";

import { errorResponse } from "@/lib/jr/http";
import { getCard, markReadyForReview } from "@/lib/jr/store";
import { materializeTrellisProjection } from "@/lib/jr/worktree";

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
    if (card.status !== "developing") {
      return NextResponse.json(
        { error: "只有“开发中”卡片可以提交审批。" },
        { status: 409 },
      );
    }

    const readyCard = markReadyForReview(id);
    if (!readyCard) {
      throw new Error("更新卡片状态时失败。");
    }
    await materializeTrellisProjection(readyCard);
    return NextResponse.json({ card: readyCard });
  } catch (error) {
    return errorResponse(error);
  }
}
