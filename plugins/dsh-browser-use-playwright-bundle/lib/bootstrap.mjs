/**
 * Activation-time bootstrap for the playwright browser-use provider: detect
 * the chrome-for-testing cache expected by the pinned @playwright/mcp tree,
 * install it via the same tree's CLI when missing. Never throws.
 */
import { spawn } from 'node:child_process'
import { existsSync } from 'node:fs'
import { createRequire } from 'node:module'
import { dirname, join } from 'node:path'
import { pathToFileURL } from 'node:url'

export const INSTALL_TIMEOUT_MS = 600_000

const MANUAL_HINT = (cli) => `manual fix: node "${cli}" install-browser chrome-for-testing`

/**
 * Resolve the mcp CLI entry and the chromium executable path the pinned
 * dependency tree expects. Pure path computation, no download, no browser.
 */
export async function resolveTargets() {
  const providerUrl = import.meta.resolve('@deepseek-ai/dsh-experimental-browser-use-playwright-mcp/package.json')
  const providerReq = createRequire(providerUrl)
  const mcpRoot = dirname(providerReq.resolve('@playwright/mcp/package.json'))
  const cli = join(mcpRoot, 'cli.js')
  const mod = await import(pathToFileURL(providerReq.resolve('playwright-core')).href)
  const playwright = mod.default ?? mod
  return { cli, executablePath: playwright.chromium.executablePath() }
}

const runInstall = ({ cli, logger, timeoutMs, spawnFn }) =>
  new Promise((resolve) => {
    const child = spawnFn(process.execPath, [cli, 'install-browser', 'chrome-for-testing'], {
      stdio: ['ignore', 'pipe', 'pipe'],
      windowsHide: true,
    })
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
      resolve({ exitCode, timedOut })
    }

    child.stdout?.on('data', (chunk) => logger?.info?.(String(chunk).trimEnd()))
    child.stderr?.on('data', (chunk) => logger?.info?.(String(chunk).trimEnd()))
    child.on('error', (err) => {
      logger?.info?.(String(err))
      settle(null)
    })
    child.on('close', (code) => settle(code))
  })

/**
 * Ensure the expected chrome-for-testing exists before the provider serves
 * sessions. All failures are logged with the manual fix command and swallowed.
 */
export async function ensureBrowser({ logger, timeoutMs = INSTALL_TIMEOUT_MS, resolveTargets: resolve = resolveTargets, exists = existsSync, spawnFn = spawn }) {
  try {
    const { cli, executablePath } = await resolve()
    if (exists(executablePath)) return
    logger?.warn?.(`browser-use-playwright: chrome-for-testing not found at ${executablePath}, installing via the pinned @playwright/mcp`)
    const result = await runInstall({ cli, logger, timeoutMs, spawnFn })
    if (result.timedOut) {
      logger?.error?.(`browser-use-playwright: install-browser timed out after ${timeoutMs}ms; ${MANUAL_HINT(cli)}`)
    } else if (result.exitCode !== 0) {
      logger?.error?.(`browser-use-playwright: install-browser failed with exit code ${result.exitCode}; ${MANUAL_HINT(cli)}`)
    } else {
      logger?.info?.('browser-use-playwright: chrome-for-testing installed')
    }
  } catch (err) {
    logger?.warn?.(`browser-use-playwright: browser bootstrap skipped: ${err}`)
  }
}
