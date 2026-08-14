/**
 * Follow Mode view: a built-in tab that mirrors what the running agent is
 * doing. A host-side watcher (`/sidebar/watch` SSE) reports file changes in
 * the session cwd; this view lists the most recently touched files, groups
 * bursts into "turn" checkpoints (a quiet-period heuristic — ponytail: real
 * turn boundaries come from the DSH session event log later), and — when
 * auto-open is on — opens the latest change in the editor tab so the
 * sidebar replaces scrollback reading.
 *
 * The view is deliberately self-contained: it talks to the host SSE route
 * and the plugin's own `ctx.dshSidebar.openTab` service, not to the
 * explorer/editor internal state. That keeps Follow Mode a clean,
 * removable layer and dogfoods the same service external plugins use.
 */
import { useEffect, useRef, useState } from 'react'
import type { Context } from '../context-types.ts'
import type { SessionScope } from './api.ts'
import type { SidebarStore } from './state.ts'

/** One recently changed file. */
interface RecentFile {
  /** Path as the watcher reported it (relative to the session cwd). */
  path: string
  /** Last-seen timestamp (ms). */
  ts: number
}

/** One quiet-window checkpoint (a heuristic "turn"). */
interface Checkpoint {
  id: string
  ts: number
  files: string[]
}

/** Silence gap (ms) that starts a new checkpoint. ponytail: real turn boundary later. */
const CHECKPOINT_QUIET_MS = 2000
/** Cap the recent-files list so it doesn't grow unbounded. */
const RECENT_CAP = 50
/** Ignore noisy paths that the agent's own tooling churns constantly. */
const IGNORE_RE = /(^|\/)\.git\/|^node_modules\//

/** Build the SSE URL for a session scope. */
function watchUrl(scope: SessionScope): string {
  const params = new URLSearchParams({ sessionId: scope.sessionId })
  if (scope.cwd !== undefined && scope.cwd !== '') params.set('cwd', scope.cwd)
  return `/sidebar/watch?${params.toString()}`
}

/** Follow tab props (mirrors the builtin tab component signature). */
interface FollowViewProps {
  ctx: Context
  store: SidebarStore
  scope: SessionScope
}

export function FollowView({ ctx, store, scope }: FollowViewProps): React.ReactNode {
  const [recent, setRecent] = useState<RecentFile[]>([])
  const [checkpoints, setCheckpoints] = useState<Checkpoint[]>([])
  const [live, setLive] = useState(true)
  // Auto-open defaults to the side-card pref; a per-session toggle overrides
  // it and persists in localStorage so the choice survives reloads.
  const [autoOpen, setAutoOpen] = useState<boolean>(() => {
    const pref = store.getPrefs().followAutoOpen
    const key = `dsh-sidebar:follow:autoOpen:${scope.sessionId}`
    const stored = localStorage.getItem(key)
    return stored === null ? pref : stored === '1'
  })
  const lastEventTs = useRef<number>(0)

  // SSE subscription: one EventSource per mount, closed on unmount.
  useEffect(() => {
    if (!live) return
    let es: EventSource | undefined
    try {
      es = new EventSource(watchUrl(scope))
    } catch {
      return
    }
    es.onmessage = (event) => {
      let payload: { paths?: string[]; ts?: number; error?: string }
      try {
        payload = JSON.parse(event.data)
      } catch {
        return
      }
      if (payload.error !== undefined) {
        es?.close()
        return
      }
      const paths = (payload.paths ?? []).filter((p) => p.length > 0 && !IGNORE_RE.test(p))
      if (paths.length === 0) return
      const ts = payload.ts ?? Date.now()
      // Refresh the recent-files list (dedup by path, newest first).
      setRecent((prev) => {
        const next = new Map(prev.map((f) => [f.path, f]))
        for (const path of paths) next.set(path, { path, ts })
        return [...next.values()].sort((a, b) => b.ts - a.ts).slice(0, RECENT_CAP)
      })
      // Group into checkpoints: a silence longer than the quiet window
      // starts a new one.
      setCheckpoints((prev) => {
        const last = prev[0]
        if (last !== undefined && ts - last.ts < CHECKPOINT_QUIET_MS) {
          const merged = new Set(last.files)
          for (const p of paths) merged.add(p)
          return [{ ...last, files: [...merged], ts }, ...prev.slice(1)].slice(0, 20)
        }
        return [{ id: `cp:${ts}:${paths[0]}`, ts, files: [...paths] }, ...prev].slice(0, 20)
      })
      lastEventTs.current = ts
      // Auto-open the most recently touched file in the editor tab.
      if (autoOpen) {
        const target = paths[paths.length - 1]
        if (target !== undefined) {
          ctx.dshSidebar?.openTab({ type: 'editor', path: target, title: target.split('/').pop() ?? target }, scope)
        }
      }
    }
    es.onerror = () => { /* EventSource auto-reconnects; leave it. */ }
    return () => { es?.close() }
  }, [live, scope, ctx, autoOpen])

  const toggleAutoOpen = (): void => {
    setAutoOpen((value) => {
      const next = !value
      localStorage.setItem(`dsh-sidebar:follow:autoOpen:${scope.sessionId}`, next ? '1' : '0')
      return next
    })
  }

  const openFile = (path: string): void => {
    ctx.dshSidebar?.openTab({ type: 'editor', path, title: path.split('/').pop() ?? path }, scope)
  }

  const openDiff = (path: string): void => {
    ctx.dshSidebar?.openTab(
      { type: 'diff', id: `diff:follow:${path}:${Date.now()}`, diff: { kind: 'worktree', path, staged: false }, title: path.split('/').pop() ?? path },
      scope,
    )
  }

  const clearAll = (): void => { setRecent([]); setCheckpoints([]) }

  const row = (f: RecentFile, i: number): React.ReactNode => (
    <div key={`${f.path}:${i}`} style={rowStyle}>
      <button type="button" onClick={() => openFile(f.path)} style={pathBtnStyle}>{f.path}</button>
      <button type="button" onClick={() => openDiff(f.path)} style={diffBtnStyle} title="Open worktree diff">diff</button>
      <span style={timeStyle}>{new Date(f.ts).toLocaleTimeString()}</span>
    </div>
  )

  return (
    <div style={wrapStyle}>
      <div style={headerStyle}>
        <label style={toggleStyle}>
          <input type="checkbox" checked={autoOpen} onChange={toggleAutoOpen} /> Auto-open
        </label>
        <label style={toggleStyle}>
          <input type="checkbox" checked={live} onChange={(e) => setLive(e.target.checked)} /> Live
        </label>
        <button type="button" onClick={clearAll} style={clearBtnStyle}>Clear</button>
      </div>

      <div style={sectionStyle}>
        <div style={sectionTitleStyle}>Recent</div>
        {recent.length === 0
          ? <div style={emptyStyle}>No changes yet — edits the agent makes will appear here live.</div>
          : recent.map(row)}
      </div>

      <div style={sectionStyle}>
        <div style={sectionTitleStyle}>Turn checkpoints</div>
        {checkpoints.length === 0
          ? <div style={emptyStyle}>Bursts of changes group here for review.</div>
          : checkpoints.map((cp) => (
            <div key={cp.id} style={cpStyle}>
              <div style={cpHeadStyle}>
                <span>{new Date(cp.ts).toLocaleTimeString()}</span>
                <span style={cpCountStyle}>{cp.files.length} file{cp.files.length === 1 ? '' : 's'}</span>
              </div>
              <div style={cpFilesStyle}>
                {cp.files.map((p) => (
                  <span key={p} style={cpFileStyle} onClick={() => openDiff(p)}>{p}</span>
                ))}
              </div>
            </div>
          ))}
      </div>
    </div>
  )
}

// ── Inline styles (ponytail: avoids coupling to the css-module surface; a
//    real pass wires these into sidebar.module.css later). ──────────────────
const wrapStyle: React.CSSProperties = { padding: '8px 10px', fontFamily: 'var(--ds-font-family, system-ui)', fontSize: 12, color: 'inherit', display: 'flex', flexDirection: 'column', gap: 12, height: '100%', overflow: 'auto' }
const headerStyle: React.CSSProperties = { display: 'flex', gap: 12, alignItems: 'center', flexWrap: 'wrap', paddingBottom: 6, borderBottom: '1px solid var(--ds-color-border, rgba(128,128,128,0.2))' }
const toggleStyle: React.CSSProperties = { display: 'inline-flex', alignItems: 'center', gap: 4, cursor: 'pointer' }
const clearBtnStyle: React.CSSProperties = { marginLeft: 'auto', cursor: 'pointer' }
const sectionStyle: React.CSSProperties = { display: 'flex', flexDirection: 'column', gap: 4 }
const sectionTitleStyle: React.CSSProperties = { fontWeight: 600, fontSize: 11, textTransform: 'uppercase', letterSpacing: '0.06em', opacity: 0.7 }
const emptyStyle: React.CSSProperties = { opacity: 0.6, padding: '4px 0' }
const rowStyle: React.CSSProperties = { display: 'flex', alignItems: 'center', gap: 6, padding: '2px 0' }
const pathBtnStyle: React.CSSProperties = { background: 'none', border: 'none', color: 'inherit', cursor: 'pointer', padding: 0, textAlign: 'left', flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', fontFamily: 'var(--ds-font-family-code, ui-monospace, monospace)' }
const diffBtnStyle: React.CSSProperties = { background: 'none', border: '1px solid var(--ds-color-border, rgba(128,128,128,0.3))', borderRadius: 4, cursor: 'pointer', fontSize: 10, padding: '0 4px', opacity: 0.8 }
const timeStyle: React.CSSProperties = { opacity: 0.5, fontSize: 10, flexShrink: 0 }
const cpStyle: React.CSSProperties = { border: '1px solid var(--ds-color-border, rgba(128,128,128,0.2))', borderRadius: 6, padding: '6px 8px' }
const cpHeadStyle: React.CSSProperties = { display: 'flex', justifyContent: 'space-between', opacity: 0.8, marginBottom: 4 }
const cpCountStyle: React.CSSProperties = { opacity: 0.7 }
const cpFilesStyle: React.CSSProperties = { display: 'flex', flexDirection: 'column', gap: 2 }
const cpFileStyle: React.CSSProperties = { cursor: 'pointer', fontFamily: 'var(--ds-font-family-code, ui-monospace, monospace)', fontSize: 11 }