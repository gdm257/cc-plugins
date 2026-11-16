/**
 * Dedicated Chrome lifecycle: flag assembly, binary detection, detached
 * spawn with DevTools endpoint parsing and process-tree teardown.
 */

import { spawn } from 'node:child_process'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'

const DEVTOOLS_WS_RE = /DevTools listening on (ws:\/\/\S+)/

/** Persistent profile dir, distinct from the third-party .dsh-browser-profile. */
export const userDataDir = (homedir = os.homedir()) => path.join(homedir, '.dsh-browser-harness-profile')

/** Compile a resolved Config into Chrome flags; dynamic port, headless by default. */
export function buildChromeFlags(config = {}, homedir = os.homedir()) {
  const flags = [
    '--remote-debugging-port=0',
    `--user-data-dir=${userDataDir(homedir)}`,
  ]
  if (config.headless !== false) flags.push('--headless=new')
  if (config.proxy) flags.push(`--proxy-server=${config.proxy}`)
  flags.push('--no-first-run', '--no-default-browser-check', 'about:blank')
  return flags
}

const CANDIDATES = [
  ['Google', 'Chrome', 'Application', 'chrome.exe'],
  ['Microsoft', 'Edge', 'Application', 'msedge.exe'],
]

/** chromePath, then BH_CHROME_PATH/CHROME_PATH, then common Windows Chrome and Edge installs. */
export function detectChrome(config = {}, env = process.env, exists = fs.existsSync) {
  if (config.chromePath) return config.chromePath
  for (const key of ['BH_CHROME_PATH', 'CHROME_PATH']) {
    if (env[key]) return env[key]
  }
  const roots = [env.ProgramFiles, env['ProgramFiles(x86)'], env.LOCALAPPDATA].filter(Boolean)
  for (const segments of CANDIDATES) {
    for (const root of roots) {
      const candidate = path.join(root, ...segments)
      if (exists(candidate)) return candidate
    }
  }
  throw new Error('no Chrome or Edge binary found: install Chrome or configure chromePath (BH_CHROME_PATH / CHROME_PATH env is also honored)')
}

/**
 * Spawn the Dedicated Chrome and resolve once its DevTools endpoint is parsed
 * from stderr. Resolves to { pid, wsEndpoint, httpUrl, kill }.
 */
export function launchChrome(options = {}) {
  const {
    config = {},
    env = process.env,
    exists = fs.existsSync,
    spawn: spawnFn = spawn,
    platform = process.platform,
    timeoutMs = 15_000,
    homedir = os.homedir(),
    mkdir = fs.mkdirSync,
  } = options

  const executable = detectChrome(config, env, exists)
  const dir = userDataDir(homedir)
  mkdir(dir, { recursive: true })

  return new Promise((resolve, reject) => {
    const child = spawnFn(executable, buildChromeFlags(config, homedir), {
      detached: true,
      stdio: ['ignore', 'ignore', 'pipe'],
      env,
    })

    let settled = false
    let stderr = ''

    const killTree = () => new Promise((done) => {
      if (platform === 'win32') {
        const taskkill = spawnFn('taskkill', ['/PID', String(child.pid), '/T', '/F'], { stdio: 'ignore', windowsHide: true })
        taskkill.on('close', () => done())
        taskkill.on('error', () => done())
      } else {
        try {
          child.kill('SIGTERM')
        } catch {}
        done()
      }
    })

    const fail = async (err) => {
      if (settled) return
      settled = true
      clearTimeout(timer)
      await killTree()
      reject(err)
    }

    const timer = setTimeout(() => fail(new Error(`Chrome did not expose a DevTools endpoint within ${timeoutMs}ms`)), timeoutMs)
    child.on('error', fail)
    child.on('exit', () => fail(new Error('Chrome exited before exposing a DevTools endpoint')))

    child.stderr.on('data', (chunk) => {
      if (settled) return
      stderr += chunk
      const match = stderr.match(DEVTOOLS_WS_RE)
      if (!match) return
      settled = true
      clearTimeout(timer)
      child.stderr.destroy()
      child.unref()
      const wsEndpoint = match[1]
      resolve({ pid: child.pid, wsEndpoint, httpUrl: `http://${new URL(wsEndpoint).host}`, kill: killTree })
    })
  })
}
