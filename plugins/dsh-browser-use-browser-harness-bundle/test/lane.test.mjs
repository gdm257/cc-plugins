// Unit tests for lib/lane.mjs: BU_NAME derivation, lane env, per-lane daemon stop, lane opener.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { EventEmitter } from 'node:events'

import { createLaneOpener, laneEnv, laneName, stopLaneDaemon } from '../lib/lane.mjs'

const CLI = { command: 'uvx', args: ['browser-harness'], source: 'uvx' }

test('lane: names match the daemon name charset and length for hostile agent ids', () => {
  const ids = ['session-abc123', '', 'ünïcødé 会话 😐', 'a'.repeat(500), 'weird/../..\\id', null, undefined]
  for (const id of ids) assert.match(laneName({ id }), /^[A-Za-z0-9_-]{1,64}$/, `bad name for ${JSON.stringify(id)}`)
})

test('lane: name is deterministic per agent and distinct across agents', () => {
  assert.equal(laneName({ id: 'session-1' }), laneName({ id: 'session-1' }))
  assert.notEqual(laneName({ id: 'session-1' }), laneName({ id: 'session-2' }))
})

test('lane: env carries cdp url, name and the quiet flags', () => {
  assert.deepEqual(laneEnv('http://127.0.0.1:52331', 'bh-abc'), {
    BU_CDP_URL: 'http://127.0.0.1:52331',
    BU_NAME: 'bh-abc',
    BH_UPDATE_CHECK: '0',
    BH_TAB_MARKER: '0',
  })
})

const wiredChild = (code = 0) => {
  const child = new EventEmitter()
  child.stdout = new EventEmitter()
  child.stderr = new EventEmitter()
  child.stdin = { write: () => {}, end: () => {} }
  queueMicrotask(() => child.emit('close', code, null))
  return child
}

test('lane: stop runs --reload under the lane env so only that daemon stops', async () => {
  const calls = []
  await stopLaneDaemon({ cli: CLI, env: laneEnv('http://127.0.0.1:5', 'bh-x'), spawnFn: (command, args, opts) => (calls.push({ command, args, opts }), wiredChild()) })
  assert.deepEqual(calls[0].args, ['browser-harness', '--reload'])
  assert.equal(calls[0].opts.env.BU_NAME, 'bh-x')
})

test('lane: stop swallows a nonzero exit so close never fails', async () => {
  await assert.doesNotReject(stopLaneDaemon({ cli: CLI, env: { BU_NAME: 'bh-x' }, spawnFn: () => wiredChild(1) }))
})

test('lane: opener acquires chrome once and hands out a lane handle bound to its env', async () => {
  const chrome = { httpUrl: 'http://127.0.0.1:42424', pid: 9, kill: async () => {} }
  const ops = []
  const manager = { acquire: async () => (ops.push('acquire'), chrome), release: async () => ops.push('release') }
  const calls = []
  const spawnFn = (command, args, opts) => (calls.push(args), wiredChild())
  const opener = createLaneOpener({ manager, cli: CLI, spawnFn })
  const { value, close } = await opener({ id: 'session-lane-test' }, undefined)
  assert.deepEqual(ops, ['acquire'])
  assert.match(value.lane, /^bh-[A-Za-z0-9_-]+$/)
  assert.equal(value.cdpUrl, 'http://127.0.0.1:42424')

  await value.run('print(title)')
  assert.deepEqual(calls[0], ['browser-harness'])

  await close()
  assert.deepEqual(calls[1], ['browser-harness', '--reload'])
  assert.deepEqual(ops, ['acquire', 'release'])
})

test('lane: handle run routes stdin through ensure_daemon with the lane env', async () => {
  const chrome = { httpUrl: 'http://127.0.0.1:1', pid: 1, kill: async () => {} }
  const manager = { acquire: async () => chrome, release: async () => {} }
  const stdinWrites = []
  const calls = []
  const spawnFn = (command, args, opts) => {
    calls.push(opts)
    const child = wiredChild()
    child.stdin = { write: (data) => stdinWrites.push(String(data)), end: () => {} }
    return child
  }
  const opener = createLaneOpener({ manager, cli: CLI, spawnFn })
  const { value } = await opener({ id: 's1' }, undefined)
  const result = await value.run('print(page_info())')
  assert.equal(result.ok, true)
  assert.equal(stdinWrites[0], 'ensure_daemon()\nprint(page_info())')
  assert.equal(calls[0].env.BU_CDP_URL, 'http://127.0.0.1:1')
})
