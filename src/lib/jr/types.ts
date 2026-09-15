export const CARD_STATUSES = [
  "backlog",
  "developing",
  "ready_review",
  "merged",
] as const;

export type CardStatus = (typeof CARD_STATUSES)[number];

export type TrellisArtifact = {
  id: string;
  cardId: string;
  path: string;
  content: string;
  updatedAt: string;
};

export type RunEvent = {
  id: string;
  cardId: string;
  event: string;
  detail: string;
  createdAt: string;
};

export type JrCard = {
  id: string;
  title: string;
  description: string;
  status: CardStatus;
  taskKey: string;
  branch: string | null;
  baseBranch: string | null;
  worktreePath: string | null;
  executionProvider: "git-worktree" | "orca-cli" | null;
  createdAt: string;
  updatedAt: string;
  artifacts: TrellisArtifact[];
  events: RunEvent[];
};

export type BoardData = {
  cards: JrCard[];
  workspace: {
    dbPath: string;
    worktreeNote: string;
  };
};
