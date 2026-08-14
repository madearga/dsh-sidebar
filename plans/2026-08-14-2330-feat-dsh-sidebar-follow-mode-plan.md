---
title: dsh-sidebar Follow Mode - Plan
type: feat
date: 2026-08-14
topic: dsh-sidebar-follow-mode
artifact_contract: ce-unified-plan/v1
artifact_readiness: requirements-only
product_contract_source: ce-brainstorm
execution: code
---

# dsh-sidebar Follow Mode - Plan

## Goal Capsule

- **Objective:** Build `dsh-sidebar` — a hard fork of `dsh-better-sidebar` v0.11.0, rebranded for github.com/madearga/dsh-sidebar — whose first release adds Follow Mode: the sidebar mirrors the DSH agent's work in real time (auto-open edited file, live diff) plus turn checkpoints (per-turn diff snapshots for sequential review).
- **Product authority:** The follow/observability layer (mirror + checkpoints) is active scope. Post-v1 layers (per-line tool-call blame, agent-driven tabs, ambient activity feed) are not active scope. Distribution beyond personal dogfooding is not active scope.
- **Open blockers:** none.

## Product Contract

### Summary

`dsh-sidebar` is a clean, rebranded hard fork of `dsh-better-sidebar` (MIT), published to github.com/madearga/dsh-sidebar, with Follow Mode as its differentiating feature: a toggle that makes editor and diff tabs track the agent's live work, plus a checkpoint strip of per-turn diffs for after-the-fact review. First user is the owner, dogfooded daily against the chat-scrollback status quo.

### Problem Frame

Today, understanding what a running DSH agent is doing means reading chat scrollback: tool-call cards, file paths, command output. The information is serial and verbose; the operator reconstructs state ("which file is it touching now?") from text. dsh-better-sidebar already owns the right surfaces (editor tabs, diff tabs, terminal) but they are static — they wait for the user to act, files don't refresh when the agent writes them (documented upstream limitation: "no file watcher"), and nothing connects those panels to the agent's event stream. The cost: mistakes surface only when the user stops to read scrollback, often after a turn completes, instead of while they happen.

### Key Decisions

- **Hard fork with rebrand, no upstream sync** (session-settled: user-directed — chosen over companion plugin / upstream PR: full control of branding and direction, accept self-maintained compatibility with DSH rc releases).
- **V1 scope = live mirror (follow toggle) + turn checkpoints** (session-settled: user-directed — chosen over ambient-trace or checkpoints-only: directly replaces scrollback reading; the other follow-mode layers come later).
- **Dogfood-first audience** — single user (the owner) before any community release. Governs R7 polish bar and success criteria.
- **Rebrand removes all upstream branding from package identity and UI; the MIT LICENSE keeps the original copyright notice** — legal requirement of MIT redistribution, not a branding choice.

### Requirements

**Follow Mode — live mirror**

- R1. A Follow toggle in the sidebar, per session, that turns live mirroring on and off.
- R2. While Follow is on, a file being modified by the agent opens in the editor tab automatically, and an already-open file's content refreshes to the on-disk state.
- R3. While Follow is on, a live diff view shows the in-flight changes to the currently followed file against its last committed or checkpointed state.
- R4. While Follow is on, the sidebar never steals focus while the user is interacting with it (typing, tab-dragging, or within a short idle window after user interaction).
- R5. The file tree and open viewers refresh automatically when files change on disk (watcher), replacing the current manual refresh.

**Turn checkpoints**

- R6. Each completed agent turn produces a checkpoint entry showing the cumulative diff of that turn, clickable to open the diff and jump to changed files.

**Fork hygiene**

- R7. All upstream branding (package name, plugin id, README, install script hostnames, UI strings/credits) is replaced with `dsh-sidebar` identity; no references to the upstream project remain in user-facing surfaces, and the build/typecheck/test suite passes after the rename.
- R8. The MIT LICENSE file retains the original copyright notice alongside the fork's.

### Key Flows

- F1. Watch-follow flow
  - **Trigger:** Follow toggle is on; agent writes a file.
  - **Steps:** watcher reports change → file tree refreshes → if file not open, editor opens it; if open, content refreshes → live diff updates.
  - **Outcome:** the sidebar shows the agent's current edit target without user action.
  - **Covers R2, R3, R5.**
- F2. Focus-guard flow
  - **Trigger:** Same as F1, but the user is typing or has interacted with the sidebar within the idle window.
  - **Steps:** mirror update is deferred; a pending-changes indicator accumulates; the update applies when the user goes idle.
  - **Outcome:** the agent never disrupts an active user interaction.
  - **Covers R4.**
- F3. Turn checkpoint flow
  - **Trigger:** Agent turn completes.
  - **Steps:** cumulative turn diff captured → checkpoint entry prepended to the checkpoint strip → user clicks entry → diff opens, changed files listed, click-through to file.
  - **Outcome:** per-turn review without reading scrollback.
  - **Covers R6.**

### Acceptance Examples

- AE1. **Covers R2, R3.** Given Follow is on and `src/app.ts` unopened, when the agent edits `src/app.ts`, then the file opens in the editor within a short debounce and its diff tab shows the new changes.
- AE2. **Covers R4.** Given Follow is on and the user is typing in the terminal tab, when the agent edits a different file, then the sidebar does not switch tabs until the user stops interacting.
- AE3. **Covers R6.** Given the agent completed a turn that touched two files, when the user opens the checkpoint strip, then one entry exists showing both files' combined diff.
- AE4. **Covers R5.** Given Follow is off and the agent creates a new file, when the file tree next renders, then the new file appears without a manual refresh.

### Success Criteria

- In daily dogfood use, chat scrollback becomes a secondary channel: the operator answers "what is it doing / what did it just do?" from the sidebar.
- Wrong-direction agent work is noticed during the turn (from the live diff), not after reading scrollback.

### Scope Boundaries

**Deferred for later (follow-mode roadmap, not v1):**

- Per-line blame mapping a change to the specific tool call that made it
- Agent-driven tabs (`sidebar_*` tools letting the model open tabs itself)
- Ambient activity feed tab and passive editor badges

**Outside this plan:**

- Community/registry distribution, install tooling, docs site
- Any upstream sync or contribution path
- Upstream feature gaps unrelated to follow mode (git push/pull, ports panel, search)

### Dependencies / Assumptions

- Assumption: DSH session events (tool calls, turn boundaries) are observable host-side by a plugin — the harness records every run in an append-only session log. Exact subscription mechanism is a planning question.
- Assumption: the fork tracks DSH `0.1.0-rc.6` peer dependencies; compatibility across future rc breaks is the owner's responsibility (accepted under hard fork).
- Source: fork base is the installed `dsh-better-sidebar` v0.11.0 source tree (MIT), rebranded per R7-R8.

### Outstanding Questions

- Resolve Before Planning: none.
- Deferred to Planning: host-side change-detection mechanism (fs watcher vs polling); how turn boundaries are detected from the session event stream; debounce/idle-window values for R4; checkpoint retention and storage location.
