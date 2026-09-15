import { NextResponse } from "next/server";

import { errorResponse } from "@/lib/jr/http";
import { activateCard, getCard } from "@/lib/jr/store";
import {
  createNativeWorktree,
  materializeTrellisProjection,
  removeWorktree,
} from "@/lib/jr/worktree";

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
    if (card.status !== "backlog") {
      return NextResponse.json(
        { error: "只有“待执行”卡片可以创建 worktree。" },
        { status: 409 },
      );
    }

    const worktree = await createNativeWorktree(card);
    try {
      const activeCard = activateCard(id, worktree);
      if (!activeCard) {
        throw new Error("worktree 已创建，但 JR 卡片已不存在。");
      }
      await materializeTrellisProjection(activeCard);
      return NextResponse.json({ card: activeCard });
    } catch (error) {
      await removeWorktree(worktree.worktreePath, worktree.branch).catch(() => undefined);
      throw error;
    }
  } catch (error) {
    return errorResponse(error);
  }
}
