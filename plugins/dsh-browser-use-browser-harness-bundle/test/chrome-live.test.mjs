// Live smoke: spawn the detected Chromium binary headless, hit the CDP endpoint,
// kill the process tree, then assert the profile dir survived. Skips when no binary exists.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'

import { detectChrome, launchChrome, userDataDir } from '../lib/chrome.mjs'

let skipReason = null
try {
  detectChrome()
} catch (err) {
  skipReason = err.message
}

test('dedicated chrome lifecycle: launch, CDP reachable, kill, profile kept', skipReason ? { skip: skipReason } : {}, async () => {
  const chrome = await launchChrome({ config: { headless: true } })
  const { pid, wsEndpoint, httpUrl, kill } = chrome
  assert.equal(typeof pid, 'number')
  assert.match(wsEndpoint, /^ws:\/\/127\.0\.0\.1:\d+\/devtools\/browser\//)
  assert.equal(httpUrl, `http://127.0.0.1:${new URL(wsEndpoint).port}`)

  const res = await fetch(`${httpUrl}/json/version`, { signal: AbortSignal.timeout(10_000) })
  assert.equal(res.status, 200)
  const version = await res.json()
  assert.ok(version.Browser)

  await kill()
  let gone = false
  for (let i = 0; i < 50 && !gone; i++) {
    try {
      process.kill(pid, 0)
    } catch (err) {
      if (err.code === 'ESRCH') gone = true
    }
    if (!gone) await new Promise((r) => setTimeout(r, 100))
  }
  assert.ok(gone, `pid ${pid} still alive after kill()`)
  assert.ok(fs.existsSync(userDataDir()))
})
