# dsh-sidebar

A VSCode-like workbench for [DeepSeek Harness (DSH)](https://deepseek.com/harness) web: file explorer, editor, terminal, git panel, embedded browser, and — the flagship — **Follow Mode** that mirrors what the agent is doing in real time.

## Features

- **Follow Mode** — a live mirror of agent file activity: watch edits land, group them into turn checkpoints, auto-open the file being touched.
- **File explorer** — lazy directory tree rooted at the session cwd, `@file` references, copy path.
- **Editor & preview** — CodeMirror 6 editing, inline preview for images / markdown / HTML / PDF / Office.
- **Terminal** — xterm + node-pty real shell, reconnect with transcript replay.
- **Git panel** — diff, history, stage / commit / revert.
- **Browser** — sandboxed embedded tabs, temporarily unlockable.
- **Background tasks & subagents** — session topology, live output peek, force-kill.
- **Bottom panel + split panes** — draggable tabs, independent second workbench.
- **Service API** — `ctx.dshSidebar` lets other plugins register sidebar tabs and file viewers.
- **Session isolation** — layout / tabs / panel state persisted per session.

## Install

```sh
cd ~/.dsh/profiles/web
npx -y --package @deepseek-ai/dsh dsh plugin --profile web add dsh-sidebar
```

Then hard-refresh the browser (Cmd/Ctrl+Shift+R). Client changes hot-reload; host-half changes need a `dsh web` restart.

## Follow Mode

The **Follow** tab streams file changes in the session working directory over `/sidebar/watch` (SSE). It lists recently touched files, groups bursts into checkpoints, and — with **Auto-open** on — opens the latest change in the editor as it happens. No more reading scrollback to know what the agent is doing.

## Development

```sh
pnpm install
pnpm typecheck   # tsc --noEmit
pnpm build       # tsdown → lib/
pnpm test        # vitest
```

## License

MIT — original copyright retained per the fork; see [LICENSE](./LICENSE).
