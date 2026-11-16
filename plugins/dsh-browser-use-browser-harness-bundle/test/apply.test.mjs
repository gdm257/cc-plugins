// Offline assembly tests for the plugin apply(): fake cordis ctx + injected deps.
import { register } from 'node:module'
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { EventEmitter } from 'node:events'

register(new URL('./stubs/loader.mjs', import.meta.url))

const entry = await import('../index.js')
const { instances } = await import('./stubs/runtime.mjs')

const AGENT = { id: 'session-apply-test' }

const makeSpawn = (log) => (command, args, opts) => {
  const stdin = []
  log.push({ args, env: opts?.env, stdin })
  const child = new EventEmitter()
  child.stdout = new EventEmitter()
  child.stderr = new EventEmitter()
  child.stdin = { write: (data) => stdin.push(String(data)), end: () => {} }
  queueMicrotask(() => child.emit('close', 0, null))
  return child
}

const makeCtx = () => {
  const ops = []
  const sections = []
  const tools = new Map()
  const registered = []
  const children = []
  const ctx = {
    browserUse: {
      register: (name) => {
        registered.push(name)
        return () => ops.push('browserUse.unregister')
      },
    },
    effect(fn) {
      const result = fn()
      const disposers = typeof result?.[Symbol.iterator] === 'function' ? [...result] : [result]
      ctx.disposeAll = () => disposers.reverse().forEach((dispose) => dispose?.())
      return ctx.disposeAll
    },
    plugin(def) {
      children.push(def)
      def.apply(ctx)
      return { dispose: () => ops.push(`child.dispose:${def.name}`) }
    },
    systemPrompt: {
      getSectionOrder: () => 720,
      section: (section) => (sections.push(section), () => sections.pop()),
    },
    tools: {
      register: (definition) => (tools.set(definition.name, definition), () => tools.delete(definition.name)),
    },
    agents: { requireInitiator: () => AGENT },
  }
  return { ctx, ops, sections, tools, registered, children }
}

const makeDeps = (spawnLog, ops) => ({
  resolveCli: () => ({ command: 'uvx', args: ['browser-harness'], source: 'uvx' }),
  launchChrome: async (options) => {
    ops.push('launchChrome')
    return { pid: 42, wsEndpoint: 'ws://127.0.0.1:1/devtools/browser/x', httpUrl: 'http://127.0.0.1:9222', kill: async () => ops.push('chrome.kill') }
  },
  spawn: makeSpawn(spawnLog),
})

test('apply: CLI resolution failure aborts activation with the install hint and no side effects', () => {
  instances.length = 0
  const { ctx, registered } = makeCtx()
  const deps = {
    resolveCli: () => {
      throw new Error('browser-harness CLI not found; run: uv tool install --python 3.12 --upgrade --force browser-harness')
    },
    launchChrome: async () => {},
    spawn: () => {},
  }
  assert.throws(() => entry.apply(ctx, {}, deps), /uv tool install/)
  assert.equal(registered.length, 0)
  assert.equal(instances.length, 0)
})

test('apply: assembles provider, shared-chrome lanes and the tools child plugin', async () => {
  instances.length = 0
  const spawnLog = []
  const ops = []
  const deps = makeDeps(spawnLog, ops)
  const harness = makeCtx()
  const input = { proxy: 'http://127.0.0.1:7890' }
  entry.apply(harness.ctx, input, deps)

  assert.deepEqual(harness.registered, ['browser-harness'])
  assert.equal(instances.length, 1)
  assert.equal(instances[0].options.label, 'browser-harness')
  assert.equal(instances[0].options.exclusive, false)
  assert.equal(typeof instances[0].options.open, 'function')
  assert.deepEqual([...harness.tools.keys()].sort(), ['browser_run', 'browser_status'])
  assert.equal(harness.sections.length, 1)
  assert.equal(harness.children.length, 1)
  assert.equal(harness.children[0].name, 'browser-use-browser-harness_tools')
  assert.deepEqual(harness.children[0].inject, ['agents', 'tools', 'systemPrompt'])

  await new Promise((resolve) => setImmediate(resolve))
  assert.ok(spawnLog.some(({ args }) => args.join(' ') === 'browser-harness telemetry disable'), 'telemetry opt-out runs once')
})

test('apply: config reaches launchChrome with defaults applied', async () => {
  instances.length = 0
  const launched = []
  const harness = makeCtx()
  const deps = {
    ...makeDeps([], []),
    launchChrome: async (options) => {
      launched.push(options)
      return { pid: 1, wsEndpoint: 'ws://x', httpUrl: 'http://x', kill: async () => {} }
    },
  }
  entry.apply(harness.ctx, {}, deps)
  await instances[0].options.open(AGENT, undefined)
  assert.equal(launched.length, 1)
  assert.equal(launched[0].config.headless, true)
  assert.equal(launched[0].config.proxy, undefined)
})

test('apply: lane open binds chrome env and close stops the lane then releases the chrome', async () => {
  instances.length = 0
  const spawnLog = []
  const ops = []
  const deps = makeDeps(spawnLog, ops)
  const harness = makeCtx()
  entry.apply(harness.ctx, {}, deps)

  const { value: lane, close } = await instances[0].options.open(AGENT, undefined)
  assert.equal(lane.cdpUrl, 'http://127.0.0.1:9222')
  assert.match(lane.lane, /^bh-[A-Za-z0-9_-]+$/)
  assert.deepEqual(ops, ['launchChrome'])

  const result = await lane.run('print(1)')
  assert.equal(result.ok, true)
  const runCall = spawnLog.find(({ stdin }) => stdin.length)
  assert.equal(runCall.stdin[0], 'ensure_daemon()\nprint(1)')
  assert.equal(runCall.env.BU_CDP_URL, 'http://127.0.0.1:9222')
  assert.match(runCall.env.BU_NAME, /^bh-[A-Za-z0-9_-]+$/)

  await close()
  const stopCall = spawnLog[spawnLog.length - 1]
  assert.deepEqual(stopCall.args, ['browser-harness', '--reload'])
  assert.equal(stopCall.env.BU_NAME, runCall.env.BU_NAME)
  assert.deepEqual(ops, ['launchChrome', 'chrome.kill'])
})

test('apply: effect disposal runs child, resources, provider in reverse order', async () => {
  instances.length = 0
  const harness = makeCtx()
  const deps = makeDeps([], [])
  entry.apply(harness.ctx, {}, deps)
  harness.ctx.disposeAll()
  assert.deepEqual(harness.ops, ['child.dispose:browser-use-browser-harness_tools', 'browserUse.unregister'])
  assert.equal(instances[0].disposed, true)
})
