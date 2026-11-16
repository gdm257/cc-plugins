/**
 * Shared Dedicated Chrome reference counting: the profile's singleton lock
 * means one Chrome per user-data-dir, so lanes share one handle and the
 * last release tears the process down.
 */

/**
 * Build a manager over a launch() that resolves { wsEndpoint, httpUrl, pid, kill }.
 * Concurrent acquires share the single in-flight launch.
 */
export function createChromeManager(launch) {
  let chrome = null
  let starting = null
  let refCount = 0

  const stop = async (handle) => {
    try {
      await handle.kill()
    } catch {}
  }

  return {
    async acquire() {
      if (chrome) {
        refCount++
        return chrome
      }
      if (!starting) starting = launch().finally(() => (starting = null))
      const handle = await starting
      chrome = handle
      refCount++
      return chrome
    },

    async release() {
      refCount--
      if (refCount > 0 || !chrome) {
        if (refCount < 0) refCount = 0
        return
      }
      const handle = chrome
      chrome = null
      refCount = 0
      await stop(handle)
    },

    async dispose() {
      const handle = chrome
      chrome = null
      starting = null
      refCount = 0
      if (handle) await stop(handle)
    },
  }
}
