// Unit tests for lib/run.mjs: CLI child execution, ensure_daemon prepend, timeout kill, hints, status.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { EventEmitter } from 'node:events'

import { extractHint, laneStatus, runCli, runPython } from '../lib/run.mjs'

const CLI = { command: 'uvx', args: ['browser-harness'], source: 'uvx' }
const ENV = { BU_CDP_URL: 'http://127.0.0.1:52331', BU_NAME: 'bh-lane1', BH_UPDATE_CHECK: '0', BH_TAB_MARKER: '0' }

class FakeChild extends EventEmitter {
  constructor() {
    super()
    this.kills = []
    this.stdinWrites = []
    this.stdin = {
      write: (data) => this.stdinWrites.push(String(data)),
      end: () => {
        this.stdinEnded = true
      },
    }
  }
  kill(signal) {
    this.kills.push(signal)
    queueMicrotask(() => this.emit('close', null, signal))
  }
}

const recorder = (child, calls) => (command, args, opts) => {
  calls.push({ command, args, opts })
  return child
}

const closeLater = (child, code, streams = {}) =>
  queueMicrotask(() => {
    if (streams.stdout) child.stdout.emit('data', Buffer.from(streams.stdout))
    if (streams.stderr) child.stderr.emit('data', Buffer.from(streams.stderr))
    child.emit('close', code, null)
  })

const wiredChild = () => {
  const child = new FakeChild()
  child.stdout = new EventEmitter()
  child.stderr = new EventEmitter()
  return child
}

test('run: prepends ensure_daemon to the user code on stdin and maps exit 0', async () => {
  const child = wiredChild()
  const calls = []
  closeLater(child, 0, { stdout: 'Example Domain\n' })
  const result = await runPython({ cli: CLI, env: ENV, code: 'print(page_info())', spawnFn: recorder(child, calls) })
  assert.deepEqual(result, { ok: true, exitCode: 0, stdout: 'Example Domain\n', stderr: '', hint: null })
  assert.deepEqual(calls[0].args, ['browser-harness'])
  assert.equal(calls[0].opts.windowsHide, true)
  assert.equal(child.stdinWrites.length, 1)
  assert.equal(child.stdinWrites[0], 'ensure_daemon()\nprint(page_info())')
  assert.ok(child.stdinEnded)
  assert.equal(calls[0].opts.env.BU_NAME, 'bh-lane1')
  assert.equal(calls[0].opts.env.BU_CDP_URL, 'http://127.0.0.1:52331')
})

test('run: exit 1 keeps ok false and extracts the traceback exception as hint', async () => {
  const child = wiredChild()
  closeLater(child, 1, {
    stderr: 'Traceback (most recent call last):\n  File "<string>", line 1, in <module>\nTimeoutError: IPC request timed out\n',
  })
  const result = await runPython({ cli: CLI, env: ENV, code: 'boom()', spawnFn: () => child })
  assert.equal(result.ok, false)
  assert.equal(result.exitCode, 1)
  assert.equal(result.hint, 'TimeoutError: IPC request timed out')
})

test('run: browser-harness instruction lines win over tracebacks', async () => {
  const child = wiredChild()
  closeLater(child, 1, {
    stderr: 'browser-harness: chrome-not-running: no supported browser is running\nTraceback (most recent call last):\nRuntimeError: x\n',
  })
  const result = await runPython({ cli: CLI, env: ENV, code: 'x', spawnFn: () => child })
  assert.equal(result.hint, 'chrome-not-running: no supported browser is running')
})

test('run: timeout kills the runner, reports null exitCode and a split-steps hint', async () => {
  const child = wiredChild()
  child.stderr.emit('data', Buffer.from('stuck\n'))
  const result = await runPython({ cli: CLI, env: ENV, code: 'while True: pass', timeoutMs: 20, spawnFn: () => child })
  assert.equal(result.ok, false)
  assert.equal(result.exitCode, null)
  assert.deepEqual(child.kills, ['SIGKILL'])
  assert.match(result.hint, /timed out after 20ms/)
  assert.match(result.hint, /shorter polling steps/)
})

test('run: spawn failure resolves with ok false and the error as hint', async () => {
  const child = wiredChild()
  queueMicrotask(() => child.emit('error', new Error('ENOENT: spawn uvx')))
  const result = await runPython({ cli: CLI, env: ENV, code: 'pass', spawnFn: () => child })
  assert.equal(result.ok, false)
  assert.equal(result.exitCode, null)
  assert.match(result.stderr, /ENOENT: spawn uvx/)
  assert.match(result.hint, /ENOENT/)
})

test('runCli: appends extra args after the base CLI args and merges env over process env', async () => {
  const child = wiredChild()
  const calls = []
  closeLater(child, 0)
  await runCli({ cli: CLI, env: ENV, args: ['doctor', '--json'], spawnFn: recorder(child, calls) })
  assert.deepEqual(calls[0].args, ['browser-harness', 'doctor', '--json'])
  assert.equal(calls[0].opts.env.SystemRoot, process.env.SystemRoot)
  assert.equal(calls[0].opts.env.BU_NAME, 'bh-lane1')
})

test('runCli: caps oversized stdout and marks the tail as truncated', async () => {
  const child = wiredChild()
  const chunk = 'x'.repeat(10_000)
  queueMicrotask(() => {
    for (let i = 0; i < 15; i++) child.stdout.emit('data', Buffer.from(chunk))
    child.emit('close', 0, null)
  })
  const result = await runCli({ cli: CLI, spawnFn: () => child })
  assert.ok(result.stdout.length < 110_000)
  assert.ok(result.stdout.endsWith('...[truncated]'))
})

test('run: aborting the signal kills the runner and reports an aborted hint', async () => {
  const child = wiredChild()
  const controller = new AbortController()
  setTimeout(() => controller.abort(), 5)
  const result = await runPython({ cli: CLI, env: ENV, code: 'while True: pass', signal: controller.signal, spawnFn: () => child })
  assert.equal(result.ok, false)
  assert.equal(result.exitCode, null)
  assert.deepEqual(child.kills, ['SIGKILL'])
  assert.equal(result.hint, 'aborted before completion')
})

test('run: an already aborted signal never starts the child', async () => {
  const child = wiredChild()
  let spawned = 0
  const spawnFn = () => {
    spawned++
    return child
  }
  const result = await runPython({ cli: CLI, env: ENV, code: 'pass', signal: AbortSignal.abort(), spawnFn })
  assert.equal(spawned, 1)
  assert.deepEqual(child.kills, ['SIGKILL'])
  assert.equal(result.hint, 'aborted before completion')
})

test('hint: returns null for clean or unrecognized stderr', () => {
  assert.equal(extractHint('', {}), null)
  assert.equal(extractHint('some random noise\n', {}), null)
})

test('status: warms the lane daemon then reads doctor json and composes the report', async () => {
  const children = [wiredChild(), wiredChild()]
  const calls = []
  const spawnFn = (command, args, opts) => {
    calls.push(args)
    const child = children[calls.length - 1]
    queueMicrotask(() => {
      if (calls.length === 1) {
        child.emit('close', 0, null)
      } else {
        child.stdout.emit('data', Buffer.from('{"healthy": true, "daemon": {"alive": true, "name": "bh-lane1"}, "version": "0.1.13"}'))
        child.emit('close', 0, null)
      }
    })
    return child
  }
  const status = await laneStatus({ cli: CLI, env: ENV, spawnFn })
  assert.equal(children[0].stdinWrites[0], 'ensure_daemon()\npass')
  assert.deepEqual(calls[1], ['browser-harness', 'doctor', '--json', '--require-existing-daemon'])
  assert.deepEqual(status, {
    cli: 'uvx',
    mode: 'dedicated',
    cdpUrl: 'http://127.0.0.1:52331',
    lane: 'bh-lane1',
    healthy: true,
    doctor: { healthy: true, daemon: { alive: true, name: 'bh-lane1' }, version: '0.1.13' },
    warmup: { ok: true, exitCode: 0 },
  })
})

test('status: unparsable doctor output degrades to a bounded raw report with healthy null', async () => {
  const children = [wiredChild(), wiredChild()]
  let n = 0
  const spawnFn = () => {
    const child = children[n++]
    queueMicrotask(() => {
      if (n === 1) child.emit('close', 0, null)
      else {
        child.stdout.emit('data', Buffer.from('not json at all'))
        child.emit('close', 1, null)
      }
    })
    return child
  }
  const status = await laneStatus({ cli: CLI, env: ENV, spawnFn })
  assert.equal(status.healthy, null)
  assert.equal(status.doctor.exitCode, 1)
  assert.match(status.doctor.stdout, /not json/)
})
