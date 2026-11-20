// Offline smoke test: peer deps (@deepseek-ai/schemastery, @deepseek-ai/*) are stubbed via module.register, no install, no network.
import { register } from 'node:module'
import { readFileSync } from 'node:fs'
import { EventEmitter } from 'node:events'
import { test } from 'node:test'
import assert from 'node:assert/strict'

register(new URL('./stubs/loader.mjs', import.meta.url))

const entry = await import('../index.js')

test('entry exports the plugin contract', () => {
  assert.equal(entry.name, 'browser-use-browser-harness')
  assert.deepEqual(entry.inject, ['browserUse', 'agents', 'tools', 'systemPrompt'])
  assert.equal(typeof entry.Config, 'function')
  assert.equal(typeof entry.apply, 'function')
})

test('Config fills headless default and keeps optional fields optional', () => {
  for (const input of [{}, undefined]) {
    const resolved = entry.Config(input)
    assert.equal(resolved.headless, true)
    assert.equal(resolved.proxy, undefined)
    assert.equal(resolved.chromePath, undefined)
  }
  assert.deepEqual(entry.Config({ proxy: 'http://127.0.0.1:7890', chromePath: 'C:/chromium/chrome.exe', headless: false }), {
    proxy: 'http://127.0.0.1:7890',
    chromePath: 'C:/chromium/chrome.exe',
    headless: false,
  })
})

test('apply registers the browser-harness provider inside an effect', () => {
  const registered = []
  let disposer = null
  const ctx = {
    effect(fn) {
      const result = fn()
      const disposers = typeof result?.[Symbol.iterator] === 'function' ? [...result] : [result]
      disposer = () => disposers.reverse().forEach((dispose) => dispose?.())
      return disposer
    },
    browserUse: { register: (name) => (registered.push(name), () => {}) },
    plugin: (def) => def.apply(ctx) ?? { dispose: () => {} },
    systemPrompt: { getSectionOrder: () => 720, section: () => () => {} },
    tools: { register: () => () => {} },
    agents: { requireInitiator: () => ({ id: 'smoke' }) },
  }
  const deps = {
    resolveCli: () => ({ command: 'uvx', args: ['browser-harness'], source: 'uvx' }),
    launchChrome: async () => ({ pid: 1, wsEndpoint: 'ws://x', httpUrl: 'http://x', kill: async () => {} }),
    spawn: () => {
      const child = new EventEmitter()
      child.stdout = new EventEmitter()
      child.stderr = new EventEmitter()
      child.stdin = { write() {}, end() {} }
      queueMicrotask(() => child.emit('close', 0, null))
      return child
    },
  }
  entry.apply(ctx, {}, deps)
  assert.deepEqual(registered, ['browser-harness'])
  assert.equal(typeof disposer, 'function')
})

const patch = readFileSync(new URL('../cordis.patch.yml', import.meta.url), 'utf8')

test('cordis.patch.yml inserts the registry row then the provider row', () => {
  const rows = [...patch.matchAll(/- id: (\S+)\r?\n\s+name: '([^']+)'/g)]
  assert.deepEqual(rows.map((m) => [m[1], m[2]]), [
    ['browser-use', '@deepseek-ai/dsh-browser-use'],
    ['browser-use-browser-harness', '@gdm257/dsh-browser-use-browser-harness-bundle'],
  ])
})

const manifest = JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf8'))

test('manifest pins peers and dependencies per spec', () => {
  assert.equal(manifest.dsh.bundle.patch, './cordis.patch.yml')
  assert.deepEqual(manifest.peerDependencies, {
    '@deepseek-ai/cordis': '~4.1.0',
    '@deepseek-ai/dsh-agent': '>=0.2.2-0 <0.2.3-0',
    '@deepseek-ai/dsh-system-prompt': '>=0.2.2-0 <0.2.3-0',
  })
  assert.deepEqual(manifest.dependencies, {
    '@deepseek-ai/dsh-browser-use': '>=0.2.2-0 <0.2.3-0',
    '@deepseek-ai/dsh-experimental-browser-use-runtime': '>=0.2.2-0 <0.2.3-0',
    '@deepseek-ai/dsh-tools': '>=0.2.2-0 <0.2.3-0',
    '@deepseek-ai/schemastery': '3.19.0',
  })
})
