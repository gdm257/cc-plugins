/**
 * Activation-time Chrome bootstrap for the chrome-devtools provider: mirror
 * the upstream launch order (system stable Chrome, then the puppeteer Chrome
 * for Testing cache) and download into that cache when both miss.
 */

import { spawn } from 'node:child_process'
import { existsSync as fsExistsSync, readdirSync as fsReaddirSync } from 'node:fs'
import path from 'node:path'
import os from 'node:os'

export const INSTALL_TIMEOUT_MS = 600_000

/** Manual fix surfaced in logs when the automatic install fails. */
export const MANUAL_FIX = 'npx puppeteer browsers install chrome@stable'

const WIN_SUFFIX = ['Google', 'Chrome', 'Application', 'chrome.exe']
const WIN_PREFIXES = [
  'C:\\Program Files',
  'C:\\Program Files (x86)',
  'D:\\Program Files',
  'D:\\Program Files (x86)',
]

/** Candidate stable Chrome executables for the platform; win32 mirrors the env-prefix logic bundled in chrome-devtools-mcp. */
export function systemChromeCandidates({ platform, env }) {
  if (platform === 'win32') {
    const prefixes = [
      ...new Set([env.PROGRAMFILES, env.ProgramW6432, env['ProgramFiles(x86)'], env.LOCALAPPDATA, ...WIN_PREFIXES].filter(Boolean)),
    ]
    return prefixes.map((prefix) => path.win32.join(prefix, ...WIN_SUFFIX))
  }
  if (platform === 'darwin') return ['/Applications/Google Chrome.app/Contents/MacOS/Google Chrome']
  if (platform === 'linux') {
    return ['/usr/bin/google-chrome', '/usr/bin/google-chrome-stable', '/opt/google/chrome/chrome', '/usr/bin/chromium', '/usr/bin/chromium-browser']
  }
  return []
}

/** Puppeteer's default cache directory; PUPPETEER_CACHE_DIR overrides. */
export function puppeteerCacheDir({ env, home }) {
  return env.PUPPETEER_CACHE_DIR || path.join(home, '.cache', 'puppeteer')
}

const chromeForTestingLayouts = (platform) => {
  if (platform === 'win32') return [['chrome-win64', 'chrome.exe'], ['chrome-win', 'chrome.exe']]
  if (platform === 'darwin') {
    return [
      ['chrome-mac-arm64/Google Chrome for Testing.app/Contents/MacOS', 'Google Chrome for Testing'],
      ['chrome-mac/Google Chrome for Testing.app/Contents/MacOS', 'Google Chrome for Testing'],
    ]
  }
  return [['chrome-linux64', 'chrome'], ['chrome-linux', 'chrome']]
}

/** Newest installed chrome-for-testing executable under the cache, or null. */
export function cachedChromePath({ cacheDir, platform, existsSync = fsExistsSync, readdirSync = fsReaddirSync }) {
  const p = platform === 'win32' ? path.win32 : path.posix
  const chromeDir = p.join(cacheDir, 'chrome')
  let versions
  try {
    versions = [...readdirSync(chromeDir)].sort().reverse()
  } catch {
    return null
  }
  for (const version of versions) {
    for (const [dir, exe] of chromeForTestingLayouts(platform)) {
      const candidate = p.join(chromeDir, version, dir, exe)
      if (existsSync(candidate)) return candidate
    }
  }
  return null
}

/** Install command for the spawnable npx equivalent of `puppeteer.browsers.installChrome()`. */
// puppeteer 25.10.0 is the version inlined by chrome-devtools-mcp@1.9.0.
export function installSpec(platform) {
  return { command: platform === 'win32' ? 'npx.cmd' : 'npx', args: ['-y', 'puppeteer@25.10.0', 'browsers', 'install', 'chrome@stable'] }
}

const runInstall = ({ command, args, platform, spawnFn, timeoutMs }) =>
  new Promise((resolve) => {
    const child = spawnFn(command, args, { stdio: ['ignore', 'pipe', 'pipe'], windowsHide: true, shell: platform === 'win32' })
    let stdout = ''
    let stderr = ''
    let timedOut = false
    let settled = false
    const timer = setTimeout(() => {
      timedOut = true
      child.kill('SIGKILL')
    }, timeoutMs)
    const settle = (exitCode) => {
      if (settled) return
      settled = true
      clearTimeout(timer)
      resolve({ exitCode: timedOut ? null : exitCode, stdout, stderr, timedOut })
    }
    child.stdout?.on('data', (chunk) => (stdout += chunk.toString('utf8')))
    child.stderr?.on('data', (chunk) => (stderr += chunk.toString('utf8')))
    child.on('error', (err) => {
      stderr += String(err)
      settle(null)
    })
    child.on('close', (code) => settle(code))
  })

const tail = (text) => text.split(/\r?\n/).filter(Boolean).slice(-3).join('\n')

/**
 * Detect then download; resolves with { source, path } or { source: null, error },
 * never throws, so activation always proceeds.
 * @param log - logger with info/error.
 */
export async function bootstrapChrome({
  log,
  platform = process.platform,
  env = process.env,
  home = os.homedir(),
  existsSync = fsExistsSync,
  readdirSync = fsReaddirSync,
  installCommand = installSpec(platform),
  spawnFn = spawn,
  timeoutMs = INSTALL_TIMEOUT_MS,
}) {
  try {
    const system = systemChromeCandidates({ platform, env }).find((candidate) => existsSync(candidate))
    if (system) {
      log.info(`chrome-devtools: using system Chrome at ${system}`)
      return { source: 'system', path: system }
    }

    const cacheDir = puppeteerCacheDir({ env, home })
    const inCache = (label) => {
      const found = cachedChromePath({ cacheDir, platform, existsSync, readdirSync })
      if (found) log.info(`chrome-devtools: using ${label} Chrome for Testing at ${found}`)
      return found
    }
    const cached = inCache('cached')
    if (cached) return { source: 'cache', path: cached }

    log.info('chrome-devtools: no system Chrome and empty puppeteer cache; downloading Chrome for Testing, first activation may take a few minutes')
    const result = await runInstall({ ...installCommand, platform, spawnFn, timeoutMs })
    if (result.exitCode === 0) {
      const installed = inCache('installed')
      if (installed) return { source: 'installed', path: installed }
    }
    const reason = result.timedOut ? `timed out after ${timeoutMs}ms` : `exit ${result.exitCode}`
    const detail = [tail(result.stderr), tail(result.stdout)].filter(Boolean).join('\n')
    const error = `chrome-devtools: Chrome for Testing bootstrap failed (${reason}); manual fix: ${MANUAL_FIX}${detail ? `\n${detail}` : ''}`
    log.error(error)
    return { source: null, error }
  } catch (err) {
    log.error(`chrome-devtools: Chrome bootstrap error: ${err instanceof Error ? err.message : String(err)}`)
    return { source: null, error: String(err) }
  }
}
