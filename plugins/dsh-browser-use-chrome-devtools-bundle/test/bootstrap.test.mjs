// Unit tests for the activation-time Chrome bootstrap: system discovery, cache
// scan, install fallback. Offline: fs and spawn are injected stubs, no network.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import path from 'node:path'
import { EventEmitter } from 'node:events'

import {
  INSTALL_TIMEOUT_MS,
  MANUAL_FIX,
  bootstrapChrome,
  cachedChromePath,
  installSpec,
  puppeteerCacheDir,
  systemChromeCandidates,
} from '../lib/bootstrap.mjs'

const win = path.win32
const posix = path.posix

const makeFs = (existing) => ({
  existsSync: (p) => existing.has(p),
  readdirSync: (p) => {
    throw new Error(`readdir not stubbed for ${p}`)
  },
})

test('candidates: win32 stable Chrome spans env prefixes and upstream hard-coded drives', () => {
  const env = { PROGRAMFILES: 'C:\\Program Files', ProgramW6432: 'C:\\Program Files', 'ProgramFiles(x86)': 'C:\\Program Files (x86)', LOCALAPPDATA: 'C:\\Users\\demo\\AppData\\Local' }
  const paths = systemChromeCandidates({ platform: 'win32', env })
  assert.deepEqual(paths, [
    'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
    'C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe',
    'C:\\Users\\demo\\AppData\\Local\\Google\\Chrome\\Application\\chrome.exe',
    'D:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
    'D:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe',
  ])
})

test('candidates: missing env vars fall back to the hard-coded prefixes only', () => {
  const paths = systemChromeCandidates({ platform: 'win32', env: {} })
  assert.deepEqual(paths, [
    'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
    'C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe',
    'D:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
    'D:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe',
  ])
})

test('candidates: darwin and linux use their standard install locations', () => {
  assert.deepEqual(systemChromeCandidates({ platform: 'darwin', env: {} }), ['/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'])
  assert.ok(systemChromeCandidates({ platform: 'linux', env: {} }).includes('/usr/bin/google-chrome'))
  assert.deepEqual(systemChromeCandidates({ platform: 'freebsd', env: {} }), [])
})

test('cache dir: home-based default, PUPPETEER_CACHE_DIR wins', () => {
  assert.equal(puppeteerCacheDir({ env: {}, home: 'C:\\Users\\demo' }), 'C:\\Users\\demo\\.cache\\puppeteer')
  assert.equal(puppeteerCacheDir({ env: { PUPPETEER_CACHE_DIR: 'D:\\pptr' }, home: 'C:\\Users\\demo' }), 'D:\\pptr')
})

test('cached: newest chrome-for-testing build wins on win32', () => {
  const cacheDir = 'C:\\Users\\demo\\.cache\\puppeteer'
  const oldExe = win.join(cacheDir, 'chrome', '138.0.0.0', 'chrome-win', 'chrome.exe')
  const newExe = win.join(cacheDir, 'chrome', '139.0.0.0', 'chrome-win64', 'chrome.exe')
  const fs = {
    ...makeFs(new Set([oldExe, newExe])),
    readdirSync: (p) => (p === win.join(cacheDir, 'chrome') ? ['138.0.0.0', '139.0.0.0'] : []),
  }
  assert.equal(cachedChromePath({ cacheDir, platform: 'win32', ...fs }), newExe)
})

test('cached: linux layout and empty cache', () => {
  const cacheDir = '/home/demo/.cache/puppeteer'
  const exe = posix.join(cacheDir, 'chrome', '139.0.0.0', 'chrome-linux64', 'chrome')
  const fs = {
    ...makeFs(new Set([exe])),
    readdirSync: (p) => (p === posix.join(cacheDir, 'chrome') ? ['139.0.0.0'] : []),
  }
  assert.equal(cachedChromePath({ cacheDir, platform: 'linux', ...fs }), exe)
  const empty = { ...makeFs(new Set()), readdirSync: () => [] }
  assert.equal(cachedChromePath({ cacheDir, platform: 'linux', ...empty }), null)
  assert.equal(cachedChromePath({ cacheDir: 'D:\\gone', platform: 'win32', ...empty }), null)
})

test('install spec: pinned spawnable npx form with the fix hint matching', () => {
  assert.deepEqual(installSpec('linux'), { command: 'npx', args: ['-y', 'puppeteer@25.10.0', 'browsers', 'install', 'chrome@stable'] })
  assert.equal(installSpec('win32').command, 'npx.cmd')
  assert.equal(MANUAL_FIX, 'npx puppeteer browsers install chrome@stable')
})

const logs = () => {
  const entries = []
  return { entries, info: (m) => entries.push(['info', m]), error: (m) => entries.push(['error', m]) }
}

const childThat = (code, streams = {}) => () => {
  const child = new EventEmitter()
  child.stdout = new EventEmitter()
  child.stderr = new EventEmitter()
  child.kill = () => {}
  queueMicrotask(() => {
    if (streams.stdout) child.stdout.emit('data', Buffer.from(streams.stdout))
    if (streams.stderr) child.stderr.emit('data', Buffer.from(streams.stderr))
    child.emit('close', code, null)
  })
  return child
}

test('bootstrap: system Chrome present means no install spawn', async () => {
  const log = logs()
  const spawnFn = () => {
    throw new Error('must not spawn')
  }
  const result = await bootstrapChrome({
    log, platform: 'win32', env: { PROGRAMFILES: 'C:\\Program Files' }, home: 'C:\\Users\\demo',
    existsSync: (p) => p === 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
    readdirSync: () => [], spawnFn,
  })
  assert.deepEqual(result, { source: 'system', path: 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe' })
  assert.deepEqual(log.entries, [['info', 'chrome-devtools: using system Chrome at C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe']])
})

test('bootstrap: cache hit means no install spawn', async () => {
  const log = logs()
  const cacheDir = 'C:\\Users\\demo\\.cache\\puppeteer'
  const exe = win.join(cacheDir, 'chrome', '139.0.0.0', 'chrome-win64', 'chrome.exe')
  const result = await bootstrapChrome({
    log, platform: 'win32', env: {}, home: 'C:\\Users\\demo',
    existsSync: (p) => p === exe,
    readdirSync: (p) => (p === win.join(cacheDir, 'chrome') ? ['139.0.0.0'] : []),
    spawnFn: () => {
      throw new Error('must not spawn')
    },
  })
  assert.deepEqual(result, { source: 'cache', path: exe })
  assert.match(log.entries[0][1], /using cached Chrome for Testing/)
})

test('bootstrap: missing cache triggers install and the rescan finds the fresh build', async () => {
  const log = logs()
  const cacheDir = 'C:\\Users\\demo\\.cache\\puppeteer'
  const exe = win.join(cacheDir, 'chrome', '140.0.0.0', 'chrome-win64', 'chrome.exe')
  const existing = new Set()
  const calls = []
  const result = await bootstrapChrome({
    log, platform: 'win32', env: {}, home: 'C:\\Users\\demo',
    existsSync: (p) => existing.has(p),
    readdirSync: (p) => (p === win.join(cacheDir, 'chrome') ? (existing.size ? ['140.0.0.0'] : []) : []),
    spawnFn: (command, args, opts) => {
      calls.push({ command, args, opts })
      existing.add(exe)
      return childThat(0, { stdout: 'Chrome 140 downloaded\n' })()
    },
    installCommand: { command: 'npx.cmd', args: ['-y', 'puppeteer@25.10.0', 'browsers', 'install', 'chrome@stable'] },
  })
  assert.deepEqual(result, { source: 'installed', path: exe })
  assert.equal(calls.length, 1)
  assert.equal(calls[0].command, 'npx.cmd')
  assert.deepEqual(calls[0].args, ['-y', 'puppeteer@25.10.0', 'browsers', 'install', 'chrome@stable'])
  assert.equal(calls[0].opts.windowsHide, true)
  assert.equal(calls[0].opts.shell, true)
  assert.ok(log.entries.some(([level, m]) => level === 'info' && /downloading Chrome for Testing/.test(m)))
  assert.ok(log.entries.some(([level, m]) => level === 'info' && /installed Chrome for Testing/.test(m)))
})

test('bootstrap: failed install logs the manual fix and resolves without throwing', async () => {
  const log = logs()
  const result = await bootstrapChrome({
    log, platform: 'win32', env: {}, home: 'C:\\Users\\demo',
    existsSync: () => false, readdirSync: () => [],
    spawnFn: childThat(1, { stderr: 'network unreachable' }),
  })
  assert.equal(result.source, null)
  const error = log.entries.find(([level]) => level === 'error')
  assert.ok(error[1].includes(MANUAL_FIX))
  assert.match(error[1], /network unreachable/)
})

test('bootstrap: install timeout kills the child and still resolves', async () => {
  const log = logs()
  const kills = []
  const stuck = () => {
    const child = new EventEmitter()
    child.stdout = new EventEmitter()
    child.stderr = new EventEmitter()
    child.kill = (sig) => {
      kills.push(sig)
      queueMicrotask(() => child.emit('close', null, sig))
    }
    return child
  }
  const result = await bootstrapChrome({
    log, platform: 'win32', env: {}, home: 'C:\\Users\\demo',
    existsSync: () => false, readdirSync: () => [],
    spawnFn: stuck, timeoutMs: 20,
  })
  assert.equal(result.source, null)
  assert.deepEqual(kills, ['SIGKILL'])
  assert.ok(log.entries.some(([level, m]) => level === 'error' && /timed out/.test(m)))
})

test('bootstrap: an unexpected error is logged, never thrown', async () => {
  const log = logs()
  const result = await bootstrapChrome({
    log, platform: 'win32', env: {}, home: 'C:\\Users\\demo',
    existsSync: () => {
      throw new Error('fs broke')
    },
    readdirSync: () => [], spawnFn: () => {},
  })
  assert.equal(result.source, null)
  assert.ok(log.entries.some(([level, m]) => level === 'error' && /fs broke/.test(m)))
})

test('bootstrap: default install timeout is generous enough for a browser download', () => {
  assert.ok(INSTALL_TIMEOUT_MS >= 600_000)
})
