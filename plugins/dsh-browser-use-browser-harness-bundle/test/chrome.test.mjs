// Unit tests for lib/chrome.mjs: flag assembly, binary detection, launch with injected spawn.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import path from 'node:path'
import { EventEmitter } from 'node:events'

import { buildChromeFlags, detectChrome, launchChrome } from '../lib/chrome.mjs'

const HOME = 'H:\\home\\fake'
const PROFILE = path.join(HOME, '.dsh-browser-harness-profile')
const winEnv = {
  ProgramFiles: 'C:\\Program Files',
  'ProgramFiles(x86)': 'C:\\Program Files (x86)',
  LOCALAPPDATA: 'C:\\Users\\fake\\AppData\\Local',
}
const chromeIn = (root) => path.join(root, 'Google', 'Chrome', 'Application', 'chrome.exe')
const edgeIn = (root) => path.join(root, 'Microsoft', 'Edge', 'Application', 'msedge.exe')

test('flags: default config yields dynamic port, persistent profile, headless, no-first-run, about:blank', () => {
  assert.deepEqual(buildChromeFlags({}, HOME), [
    '--remote-debugging-port=0',
    `--user-data-dir=${PROFILE}`,
    '--headless=new',
    '--no-first-run',
    '--no-default-browser-check',
    'about:blank',
  ])
})

test('flags: headless false drops --headless=new', () => {
  assert.ok(!buildChromeFlags({ headless: false }, HOME).includes('--headless=new'))
})

test('flags: proxy compiles to --proxy-server after headless', () => {
  const flags = buildChromeFlags({ proxy: 'http://127.0.0.1:7890' }, HOME)
  assert.equal(flags[3], '--proxy-server=http://127.0.0.1:7890')
})

test('flags: profile dir is the dedicated .dsh-browser-harness-profile', () => {
  const flag = buildChromeFlags({}, HOME).find((f) => f.startsWith('--user-data-dir='))
  assert.ok(flag.includes('.dsh-browser-harness-profile'))
  assert.ok(!flag.includes('.dsh-browser-profile'))
})

test('detect: config chromePath wins over env and probing', () => {
  const env = { ...winEnv, BH_CHROME_PATH: 'C:\\env\\chrome.exe' }
  assert.equal(detectChrome({ chromePath: 'C:\\custom\\chrome.exe' }, env, () => true), 'C:\\custom\\chrome.exe')
})

test('detect: BH_CHROME_PATH beats CHROME_PATH and probing', () => {
  const env = { ...winEnv, BH_CHROME_PATH: 'C:\\bh\\chrome.exe', CHROME_PATH: 'C:\\cp\\chrome.exe' }
  assert.equal(detectChrome({}, env, () => true), 'C:\\bh\\chrome.exe')
})

test('detect: CHROME_PATH beats probing', () => {
  const env = { ...winEnv, CHROME_PATH: 'C:\\cp\\chrome.exe' }
  assert.equal(detectChrome({}, env, () => true), 'C:\\cp\\chrome.exe')
})

test('detect: probes Windows chrome locations before Edge', () => {
  const chromeHit = chromeIn(winEnv['ProgramFiles(x86)'])
  const edgeHit = edgeIn(winEnv.LOCALAPPDATA)
  const found = [chromeHit, edgeHit]
  assert.equal(detectChrome({}, winEnv, (p) => found.includes(p)), chromeHit)
})

test('detect: falls back to Edge when no chrome candidate exists', () => {
  const edgeHit = edgeIn(winEnv.LOCALAPPDATA)
  assert.equal(detectChrome({}, winEnv, (p) => p === edgeHit), edgeHit)
})

test('detect: throws with install guidance when nothing found', () => {
  assert.throws(() => detectChrome({}, winEnv, () => false), /install Chrome or configure chromePath/)
})

class FakeChild extends EventEmitter {
  constructor(pid) {
    super()
    this.pid = pid
    this.kills = []
    this.unrefCalls = 0
    this.stderrDestroyed = false
    this.stderr = new EventEmitter()
    this.stderr.destroy = () => {
      this.stderrDestroyed = true
    }
  }
  unref() {
    this.unrefCalls++
  }
  kill(signal) {
    this.kills.push(signal)
  }
}

const emitEndpoint = (child, ws = 'ws://127.0.0.1:52331/devtools/browser/abc') =>
  child.stderr.emit('data', Buffer.from(`DevTools listening on ${ws}\n`))

test('launch: resolves pid, wsEndpoint and httpUrl from the stderr DevTools line', async () => {
  const child = new FakeChild(4242)
  const ops = []
  const spawns = []
  const spawnFn = (cmd, args, opts) => {
    ops.push('spawn')
    spawns.push({ cmd, args, opts })
    queueMicrotask(() => emitEndpoint(child))
    return child
  }
  const mkdir = (dir, opts) => ops.push(['mkdir', dir, opts])
  const launched = await launchChrome({ config: { chromePath: 'C:\\cfg\\chrome.exe' }, spawn: spawnFn, homedir: HOME, mkdir })
  assert.equal(launched.pid, 4242)
  assert.equal(launched.wsEndpoint, 'ws://127.0.0.1:52331/devtools/browser/abc')
  assert.equal(launched.httpUrl, 'http://127.0.0.1:52331')
  assert.deepEqual(ops[0], ['mkdir', PROFILE, { recursive: true }])
  assert.equal(spawns[0].cmd, 'C:\\cfg\\chrome.exe')
  assert.deepEqual(spawns[0].args, buildChromeFlags({}, HOME))
  assert.equal(spawns[0].opts.detached, true)
  assert.equal(spawns[0].opts.stdio[2], 'pipe')
  assert.ok(child.stderrDestroyed)
  assert.equal(child.unrefCalls, 1)
})

test('launch: kill() taskkills the process tree on win32', async () => {
  const child = new FakeChild(777)
  const spawns = []
  const spawnFn = (cmd, args) => {
    spawns.push({ cmd, args })
    if (cmd === 'taskkill') {
      const taskkill = new EventEmitter()
      queueMicrotask(() => taskkill.emit('close'))
      return taskkill
    }
    queueMicrotask(() => emitEndpoint(child, 'ws://127.0.0.1:9/devtools/browser/x'))
    return child
  }
  const launched = await launchChrome({ config: { chromePath: 'C:\\c.exe' }, spawn: spawnFn, homedir: HOME, mkdir: () => {}, platform: 'win32' })
  await launched.kill()
  assert.equal(spawns[1].cmd, 'taskkill')
  assert.deepEqual(spawns[1].args, ['/PID', '777', '/T', '/F'])
})

test('launch: rejects and kills the child on timeout without an endpoint', async () => {
  const child = new FakeChild(111)
  await assert.rejects(
    launchChrome({ config: { chromePath: 'C:\\c.exe' }, spawn: () => child, homedir: HOME, mkdir: () => {}, timeoutMs: 25, platform: 'linux' }),
    /did not expose a DevTools endpoint/,
  )
  assert.deepEqual(child.kills, ['SIGTERM'])
})

test('launch: rejects when the binary fails to spawn', async () => {
  const child = new FakeChild(222)
  const spawnFn = () => {
    queueMicrotask(() => child.emit('error', new Error('ENOENT no such file')))
    return child
  }
  await assert.rejects(
    launchChrome({ config: { chromePath: 'C:\\missing.exe' }, spawn: spawnFn, homedir: HOME, mkdir: () => {}, platform: 'linux' }),
    /ENOENT/,
  )
})
