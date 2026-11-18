// Unit tests for lib/bootstrap.mjs: cache detection, install spawn, failure logging.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { EventEmitter } from 'node:events'

import { ensureBrowser } from '../lib/bootstrap.mjs'

const CLI = 'C:/cache/node_modules/@playwright/mcp/cli.js'
const EXE = 'C:/Users/demo/AppData/Local/ms-playwright/chromium-1234/chrome-win/chrome.exe'

const makeLogger = () => {
  const lines = { info: [], warn: [], error: [] }
  return {
    lines,
    info: (msg) => lines.info.push(msg),
    warn: (msg) => lines.warn.push(msg),
    error: (msg) => lines.error.push(msg),
  }
}

const wiredChild = (code) => {
  const child = new EventEmitter()
  child.stdout = new EventEmitter()
  child.stderr = new EventEmitter()
  child.kills = []
  child.kill = (signal) => {
    child.kills.push(signal)
    queueMicrotask(() => child.emit('close', null, signal))
  }
  queueMicrotask(() => {
    child.stdout.emit('data', Buffer.from('downloading chromium\n'))
    child.stderr.emit('data', Buffer.from('progress 50%\n'))
    child.emit('close', code, null)
  })
  return child
}

const baseDeps = () => ({
  resolveTargets: async () => ({ cli: CLI, executablePath: EXE }),
  exists: () => false,
  spawnFn: () => wiredChild(0),
})

test('bootstrap: cached executable skips install entirely', async () => {
  const logger = makeLogger()
  let spawned = 0
  await ensureBrowser({
    logger,
    resolveTargets: async () => ({ cli: CLI, executablePath: EXE }),
    exists: (path) => path === EXE,
    spawnFn: () => {
      spawned++
    },
  })
  assert.equal(spawned, 0)
  assert.equal(logger.lines.error.length, 0)
})

test('bootstrap: missing cache spawns the pinned mcp CLI with install-browser', async () => {
  const logger = makeLogger()
  const calls = []
  await ensureBrowser({
    ...baseDeps(),
    logger,
    spawnFn: (command, args, opts) => {
      calls.push({ command, args, opts })
      return wiredChild(0)
    },
  })
  assert.equal(calls.length, 1)
  assert.equal(calls[0].command, process.execPath)
  assert.deepEqual(calls[0].args, [CLI, 'install-browser', 'chrome-for-testing'])
  assert.equal(calls[0].opts.windowsHide, true)
  assert.ok(logger.lines.warn.some((line) => /chrome-for-testing/.test(line)))
})

test('bootstrap: install output is visible through the logger', async () => {
  const logger = makeLogger()
  await ensureBrowser({ ...baseDeps(), logger })
  const output = [...logger.lines.info, ...logger.lines.error].join('\n')
  assert.match(output, /downloading chromium/)
  assert.match(output, /progress 50%/)
})

test('bootstrap: install failure logs the manual fix command and does not throw', async () => {
  const logger = makeLogger()
  await ensureBrowser({ ...baseDeps(), logger, spawnFn: () => wiredChild(1) })
  assert.equal(logger.lines.error.length, 1)
  assert.match(logger.lines.error[0], /install-browser failed/)
  assert.match(logger.lines.error[0], new RegExp(`node "${CLI}" install-browser chrome-for-testing`))
})

test('bootstrap: timeout kills the child and logs the manual fix command', async () => {
  const logger = makeLogger()
  const stalled = new EventEmitter()
  stalled.stdout = new EventEmitter()
  stalled.stderr = new EventEmitter()
  stalled.kills = []
  stalled.kill = (signal) => {
    stalled.kills.push(signal)
    queueMicrotask(() => stalled.emit('close', null, signal))
  }
  await ensureBrowser({ ...baseDeps(), logger, spawnFn: () => stalled, timeoutMs: 20 })
  assert.deepEqual(stalled.kills, ['SIGKILL'])
  assert.match(logger.lines.error[0], /timed out/)
  assert.match(logger.lines.error[0], /install-browser chrome-for-testing/)
})

test('bootstrap: target resolution failure logs a warning and does not throw', async () => {
  const logger = makeLogger()
  await ensureBrowser({
    logger,
    resolveTargets: async () => {
      throw new Error('cannot resolve @playwright/mcp')
    },
    exists: () => false,
    spawnFn: () => {
      throw new Error('must not spawn')
    },
  })
  assert.equal(logger.lines.warn.length, 1)
  assert.match(logger.lines.warn[0], /cannot resolve/)
})
