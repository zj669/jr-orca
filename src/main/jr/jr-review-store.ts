import type SyncDatabase from '../sqlite/sync-database'
import type {
  JrCard,
  JrControllerActor,
  JrDeliveryRecord,
  JrReviewSnapshot,
  JrShipRequest
} from '../../shared/jr/jr-types'
import { requireJrCardState } from './jr-card-transition-guards'
import { jrTaskArtifactPath } from './jr-trellis-artifact-templates'
import { jrNow, recordJrEvent, setJrCardStatus, upsertJrArtifact } from './jr-card-records'
import { persistJrBlocked } from './jr-blocked-state'
import { optionalJrDatabaseString, requireJrDatabaseRow } from './jr-database-records'

const REVIEW_COLUMNS = [
  { name: 'review_json', definition: 'TEXT' },
  { name: 'delivery_json', definition: 'TEXT' }
] as const

export class JrReviewStore {
  constructor(private readonly db: SyncDatabase) {
    this.ensureSchema()
  }

  requestReview(card: JrCard, snapshot: JrReviewSnapshot, actor: JrControllerActor): void {
    requireJrCardState(card, 'executing', '请求验证')
    if (!card.execution.worktree) {
      throw new Error('JR 验证需要已创建的 Orca worktree。')
    }
    if (snapshot.worktreeId !== card.execution.worktree.id) {
      throw new Error('JR 验证快照与卡片 worktree 不匹配。')
    }
    this.persistSnapshot(card.id, snapshot)
    setJrCardStatus(this.db, card.id, 'verifying')
    upsertJrArtifact(
      this.db,
      card.id,
      jrTaskArtifactPath(card.id, 'review.md'),
      reviewMarkdown(snapshot),
      actor
    )
    recordJrEvent(
      this.db,
      card.id,
      '已进入验证',
      `${snapshot.changedFiles} 个文件 · ahead ${snapshot.commitsAhead} · uncommitted ${snapshot.uncommittedFiles}`,
      actor
    )
  }

  passVerification(card: JrCard, actor: JrControllerActor): void {
    requireJrCardState(card, 'verifying', '通过验证')
    const snapshot = requireSnapshot(card)
    if (snapshot.workspaceKind === 'folder') {
      setJrCardStatus(this.db, card.id, 'pending_merge_approval')
      recordJrEvent(
        this.db,
        card.id,
        '等待合并审批',
        '文件夹工作区已通过验证。没有 git 主工作树时仍可交付。',
        actor
      )
      return
    }
    if (snapshot.compareStatus !== 'ready') {
      throw new Error('Orca 分支对比尚未就绪，不能通过验证。')
    }
    if (snapshot.conflicted) {
      throw new Error('工作树仍有冲突，请返回执行中处理。')
    }
    if (snapshot.uncommittedFiles > 0) {
      throw new Error('还有未提交变更，请返回执行中处理。')
    }
    if (snapshot.changedFiles < 1 && snapshot.commitsAhead < 1) {
      throw new Error('没有可交付的提交或文件变更。')
    }
    setJrCardStatus(this.db, card.id, 'pending_merge_approval')
    recordJrEvent(
      this.db,
      card.id,
      '等待合并审批',
      'Controller 已通过 Orca Review。只有明确批准才能交付。',
      actor
    )
  }

  returnToExecution(card: JrCard, actor: JrControllerActor): void {
    if (card.status !== 'verifying' && card.status !== 'pending_merge_approval') {
      throw new Error('卡片必须处于 验证中 或 待批准合并 才能返回执行。')
    }
    setJrCardStatus(this.db, card.id, 'executing')
    recordJrEvent(this.db, card.id, '已退回执行', 'Controller 要求继续在 worktree 中修改。', actor)
  }

  prepareShip(card: JrCard, actor: JrControllerActor): JrShipRequest {
    requireJrCardState(card, 'pending_merge_approval', '批准合并')
    const snapshot = requireSnapshot(card)
    const worktree = card.execution.worktree
    const repositoryId = card.execution.repositoryId
    const baseRef = card.execution.baseRef
    if (!worktree || !repositoryId || !baseRef) {
      throw new Error('JR 交付需要已记录的 worktree 和基础分支。')
    }
    setJrCardStatus(this.db, card.id, 'shipping')
    recordJrEvent(
      this.db,
      card.id,
      '交付已获批准',
      'Controller 已批准合并；正在通过 Orca 推送并合并。',
      actor
    )
    return {
      cardId: card.id,
      title: card.title,
      worktree,
      repositoryId,
      baseRef,
      review: snapshot
    }
  }

  recordMerged(card: JrCard, delivery: JrDeliveryRecord, actor: JrControllerActor): void {
    requireJrCardState(card, 'shipping', '记录合并')
    this.db
      .prepare('UPDATE jr_cards SET delivery_json = ?, updated_at = ? WHERE id = ?')
      .run(JSON.stringify(delivery), jrNow(), card.id)
    setJrCardStatus(this.db, card.id, 'merged')
    upsertJrArtifact(
      this.db,
      card.id,
      jrTaskArtifactPath(card.id, 'journal.md'),
      `# ${card.title} — finish\n\nMerged into ${delivery.mergedInto} via ${delivery.method}.\n`,
      actor
    )
    recordJrEvent(
      this.db,
      card.id,
      '已合并',
      delivery.method === 'hosted-pr'
        ? `Hosted PR ${delivery.prNumber} 已合并到 ${delivery.mergedInto}。`
        : delivery.method === 'folder-workspace'
          ? `文件夹工作区已交付到 ${delivery.mergedInto}。`
          : `已在基础 worktree 合并到 ${delivery.mergedInto}。`,
      actor
    )
  }

  block(card: JrCard, reason: string, actor: JrControllerActor): boolean {
    if (
      card.status !== 'verifying' &&
      card.status !== 'pending_merge_approval' &&
      card.status !== 'shipping'
    ) {
      return false
    }
    const detail = reason.trim()
    if (!detail) {
      throw new Error('请先为卡片设置 受阻原因。')
    }
    persistJrBlocked(this.db, card, detail, actor, '交付受阻')
    return true
  }

  private persistSnapshot(cardId: string, snapshot: JrReviewSnapshot): void {
    this.db
      .prepare('UPDATE jr_cards SET review_json = ?, updated_at = ? WHERE id = ?')
      .run(JSON.stringify(snapshot), jrNow(), cardId)
  }

  private ensureSchema(): void {
    const columns = new Set(
      this.db
        .prepare('PRAGMA table_info(jr_cards)')
        .all()
        .map(
          (row) =>
            optionalJrDatabaseString(requireJrDatabaseRow(row, 'JR schema is invalid.'), 'name') ??
            ''
        )
    )
    for (const column of REVIEW_COLUMNS) {
      if (!columns.has(column.name)) {
        this.db.exec(`ALTER TABLE jr_cards ADD COLUMN ${column.name} ${column.definition}`)
      }
    }
  }
}

function requireSnapshot(card: JrCard): JrReviewSnapshot {
  if (!card.review) {
    throw new Error('JR 验证快照不存在。')
  }
  return card.review
}

function reviewMarkdown(snapshot: JrReviewSnapshot): string {
  return `# Review snapshot

- Worktree: \`${snapshot.worktreeId}\`
- Branch: \`${snapshot.branch}\`
- Base: \`${snapshot.baseRef}\`
- Compare: ${snapshot.compareStatus}
- Files: ${snapshot.changedFiles}
- Ahead/behind: ${snapshot.commitsAhead}/${snapshot.commitsBehind}
- Uncommitted: ${snapshot.uncommittedFiles}
- Conflicted: ${snapshot.conflicted ? 'yes' : 'no'}
- Head: \`${snapshot.headOid ?? 'unknown'}\`
`
}
