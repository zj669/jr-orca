# JR CLI

JR 是仓库本地的交付看板。安装后，项目中的 AI 工具可以从想法走到规划、执行、审查与完成，而不需要打开 Electron。

```sh
npm i -D jr
npx jr init
npx jr card create "改善首次配置体验" --description "明确成功标准并建立实现计划。"
npx jr status
```

`jr init` 在 Git 仓库根目录创建：

- `.jr/state.sqlite`：JR 的 SQLite 事实来源；
- `.mcp.json`、`.cursor/mcp.json` 与 `.codex/config.toml`：本地 MCP 配置；
- `.claude/skills/jr-lifecycle/`、`.cursor/skills/jr-lifecycle/` 与 `.codex/skills/jr-lifecycle/`：中文工作流技能。

Trellis 仅启发 JR 的安装体验和卡片生命周期。JR 不复制、不供应也不依赖 Trellis 的 AGPL 源码。

## Commands

```text
jr init
jr status [--json]
jr board [--json]
jr card create <标题> [--description <说明>] [--json]
jr mcp
```

`jr mcp` exposes `jr_card_create` and `jr_board_list` over stdio. The current slice creates and lists cards; controller-gated planning, worktree launch, and review routing follow the same five-column contract in subsequent slices.
