// Offline assembly tests for the plugin entry and shipped manifests; stubs only node builtins.
import { readFileSync } from 'node:fs'
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { EventEmitter } from 'node:events'

const entry = await import('../index.js')

const makeCtx = () => {
  const entries = []
  return { ctx: { logger: { info: (m) => entries.push(['info', m]), error: (m) => entries.push(['error', m]) } }, entries }
}

const hitSystemChrome = {
  platform: 'win32',
  env: { PROGRAMFILES: 'C:\\Program Files' },
  home: 'C:\\Users\\demo',
  existsSync: (p) => p === 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
  readdirSync: () => [],
  spawn: () => {
    throw new Error('must not spawn')
  },
}

test('entry exports the plugin contract', () => {
  assert.equal(entry.name, 'browser-use-chrome-devtools-bootstrap')
  assert.equal(typeof entry.apply, 'function')
})

const flush = () => new Promise((resolve) => setTimeout(resolve, 0))

test('apply: fire-and-forget, returns before the install child settles', async () => {
  const { ctx } = makeCtx()
  const pending = () => {
    const child = new EventEmitter()
    child.stdout = new EventEmitter()
    child.stderr = new EventEmitter()
    child.kill = () => queueMicrotask(() => child.emit('close', null, 'SIGKILL'))
    return child
  }
  let returned = false
  const ret = entry.apply(ctx, {}, { ...hitSystemChrome, existsSync: () => false, spawn: pending, timeoutMs: 20 })
  returned = true
  assert.equal(returned, true)
  assert.equal(ret, undefined)
  await flush()
})

test('apply: bootstrap failure is logged asynchronously and never throws on total failure', async () => {
  const { ctx, entries } = makeCtx()
  const broken = {
    ...hitSystemChrome,
    existsSync: () => false,
    spawn: () => {
      const child = new EventEmitter()
      child.stdout = new EventEmitter()
      child.stderr = new EventEmitter()
      child.kill = () => {}
      queueMicrotask(() => child.emit('close', 1, null))
      return child
    },
  }
  entry.apply(ctx, {}, broken)
  await flush()
  assert.ok(entries.some(([level, m]) => level === 'error' && /manual fix/i.test(m)))
})

test('apply: an unexpected bootstrap rejection is swallowed and logged as error', async () => {
  const { ctx, entries } = makeCtx()
  entry.apply(ctx, {}, { ...hitSystemChrome, existsSync: () => {
    throw new Error('fs broke')
  } })
  await flush()
  assert.ok(entries.some(([level, m]) => level === 'error' && /fs broke/.test(m)))
})

const patch = readFileSync(new URL('../cordis.patch.yml', import.meta.url), 'utf8')

test('cordis.patch.yml keeps the official rows and appends the bootstrap plugin row', () => {
  const rows = [...patch.matchAll(/- id: (\S+)\r?\n\s+name: '?([^\n']+)'?/g)]
  assert.deepEqual(rows.map((m) => [m[1], m[2].trim()]), [
    ['browser-use', '@deepseek-ai/dsh-browser-use'],
    ['browser-use-chrome-devtools', '@deepseek-ai/dsh-experimental-browser-use-chrome-devtools-mcp'],
    ['browser-use-chrome-devtools-bootstrap', '@gdm257/dsh-browser-use-chrome-devtools-bundle'],
  ])
  assert.match(patch, /mode: launch/)
})

const manifest = JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf8'))

test('manifest ships the code bundle files', () => {
  assert.equal(manifest.dsh.bundle.patch, './cordis.patch.yml')
  assert.equal(manifest.exports['.'], './index.js')
  for (const shipped of ['index.js', 'lib/*.mjs']) assert.ok(manifest.files.includes(shipped))
})
