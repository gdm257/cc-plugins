// Unit tests for lib/chrome-manager.mjs: shared-chrome reference counting.
import { test } from 'node:test'
import assert from 'node:assert/strict'

import { createChromeManager } from '../lib/chrome-manager.mjs'

const makeChrome = (launches, name = 'chrome') => {
  const chrome = { pid: 1000 + launches.length, wsEndpoint: `ws://127.0.0.1:5/devtools/browser/${name}`, httpUrl: 'http://127.0.0.1:5', killed: 0 }
  chrome.kill = async () => {
    chrome.killed++
  }
  launches.push(chrome)
  return chrome
}

const deferredLaunch = (launches, resolveLater) => {
  let resolveLaunch
  const promise = new Promise((resolve) => {
    resolveLaunch = resolve
  })
  const launch = () => {
    launch.calls = (launch.calls ?? 0) + 1
    return promise
  }
  return { launch, release: () => resolveLaunch(makeChrome(launches)) }
}

test('chrome-manager: first acquire launches, second reuses the cached handle', async () => {
  const launches = []
  const manager = createChromeManager(() => Promise.resolve(makeChrome(launches)))
  const a = await manager.acquire()
  const b = await manager.acquire()
  assert.equal(launches.length, 1)
  assert.equal(b, a)
})

test('chrome-manager: concurrent acquires share one in-flight launch', async () => {
  const launches = []
  const { launch, release } = deferredLaunch(launches)
  const manager = createChromeManager(launch)
  const p1 = manager.acquire()
  const p2 = manager.acquire()
  release()
  const [a, b] = await Promise.all([p1, p2])
  assert.equal(launch.calls, 1)
  assert.equal(launches.length, 1)
  assert.equal(a, b)
  assert.equal(a, launches[0])
})

test('chrome-manager: release at refcount zero kills the chrome and a fresh acquire relaunches', async () => {
  const launches = []
  const manager = createChromeManager(() => Promise.resolve(makeChrome(launches)))
  const a = await manager.acquire()
  await manager.release()
  assert.equal(launches[0].killed, 1)
  const b = await manager.acquire()
  assert.equal(launches.length, 2)
  assert.notEqual(b, a)
})

test('chrome-manager: release above zero keeps chrome alive', async () => {
  const launches = []
  const manager = createChromeManager(() => Promise.resolve(makeChrome(launches)))
  await manager.acquire()
  await manager.acquire()
  await manager.release()
  assert.equal(launches[0].killed, 0)
})

test('chrome-manager: release with no holder clamps instead of underflowing', async () => {
  const launches = []
  const manager = createChromeManager(() => Promise.resolve(makeChrome(launches)))
  await manager.acquire()
  await manager.release()
  await manager.release()
  assert.equal(launches[0].killed, 1, 'double release must not kill twice or throw')
})

test('chrome-manager: launch failure rejects every waiter and a later acquire retries', async () => {
  const launches = []
  let fail = true
  const manager = createChromeManager(() => (fail ? Promise.reject(new Error('no chrome binary')) : Promise.resolve(makeChrome(launches))))
  await assert.rejects(Promise.all([manager.acquire(), manager.acquire()]), /no chrome binary/)
  fail = false
  await manager.acquire()
  assert.equal(launches.length, 1)
})

test('chrome-manager: dispose kills the held chrome and resets for a clean relaunch', async () => {
  const launches = []
  const manager = createChromeManager(() => Promise.resolve(makeChrome(launches)))
  await manager.acquire()
  await manager.dispose()
  assert.equal(launches[0].killed, 1)
  await manager.acquire()
  assert.equal(launches.length, 2)
  await manager.dispose()
})

test('chrome-manager: dispose without a holder is a no-op', async () => {
  const launches = []
  const manager = createChromeManager(() => Promise.resolve(makeChrome(launches)))
  await manager.dispose()
  assert.equal(launches.length, 0)
})
