// Live smoke: real shared Chrome + browser-harness CLI lane over uvx; opens
// about:blank, reads page_info, checks lane health, then closes the lane.
// Skips when the CLI or a Chromium binary is unavailable; requires network only
// through the uvx PyPI cache on first run.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'

import { detectChrome, launchChrome } from '../lib/chrome.mjs'
import { resolveCli } from '../lib/cli.mjs'
import { createChromeManager } from '../lib/chrome-manager.mjs'
import { createLaneOpener } from '../lib/lane.mjs'

let skipReason = null
let cli = null
try {
  detectChrome()
  cli = resolveCli()
} catch (err) {
  skipReason = err.message
}

test('live lane: shared chrome, daemon lane run + status, clean close', skipReason ? { skip: skipReason } : {}, async () => {
  // Isolated profile: node --test runs live files concurrently and the shared
  // user-data-dir admits only one Chromium instance.
  const homedir = fs.mkdtempSync(path.join(os.tmpdir(), 'bh-lane-live-'))
  const manager = createChromeManager(() => launchChrome({ config: { headless: true }, homedir }))
  const open = createLaneOpener({ manager, cli })
  const { value: lane, close } = await open({ id: 'live-lane-smoke' }, undefined)

  const run = await lane.run(`
tab = new_tab('about:blank')
wait_for_load()
print(page_info())
`)
  assert.equal(run.ok, true, `run failed: ${run.stderr}\nhint: ${run.hint}`)
  assert.match(run.stdout, /title/)

  const status = await lane.status()
  assert.equal(status.healthy, true, JSON.stringify(status))
  assert.equal(status.cli, cli.source)
  assert.match(status.lane, /^bh-[A-Za-z0-9_-]+$/)
  assert.match(status.cdpUrl, /^http:\/\/127\.0\.0\.1:\d+$/)

  await close()
  const stopped = await lane.run('print(1)')
  assert.equal(stopped.ok, false, 'daemon lane should be gone after close')
})
