/**
 * Per-Session Browser lane: sanitized BU_NAME, the daemon env, lane open/close
 * over the shared Chrome manager, and per-lane daemon stop.
 */

import { createHash } from 'node:crypto'

import { laneStatus, runPython, runCli } from './run.mjs'

const LANE_NAME_RE = /^[A-Za-z0-9_-]{1,64}$/
const STOP_TIMEOUT_MS = 15_000

/** Derive the daemon name from the agent id; base64url chars are all in the daemon charset. */
export function laneName(agent) {
  const id = String(agent?.id ?? agent ?? 'anonymous')
  return `bh-${createHash('sha256').update(id).digest('base64url').slice(0, 12)}`
}

/** Env that pins the daemon to the shared Chrome CDP endpoint as one named lane. */
export function laneEnv(httpUrl, name) {
  return {
    BU_CDP_URL: httpUrl,
    BU_NAME: name,
    BH_UPDATE_CHECK: '0',
    BH_TAB_MARKER: '0',
  }
}

/**
 * Stop this lane's daemon. `--reload` with BU_NAME in env is per-lane: run.py
 * calls restart_daemon() which names the target via admin.py NAME (BU_NAME env;
 * "restart" is actually a pure stop).
 */
export function stopLaneDaemon({ cli, env, spawnFn }) {
  return runCli({ cli, env, args: ['--reload'], timeoutMs: STOP_TIMEOUT_MS, spawnFn })
}

/** SessionResources.open: acquire the shared Chrome and bind a lane handle to it. */
export function createLaneOpener({ manager, cli, spawnFn }) {
  return async function open(agent) {
    const chrome = await manager.acquire()
    const name = laneName(agent)
    const env = laneEnv(chrome.httpUrl, name)
    return {
      value: {
        lane: name,
        cdpUrl: chrome.httpUrl,
        run: (code, options = {}) => runPython({ cli, env, code, signal: options.signal, spawnFn }),
        status: () => laneStatus({ cli, env, spawnFn }),
      },
      close: async () => {
        await stopLaneDaemon({ cli, env, spawnFn })
        await manager.release()
      },
    }
  }
}
