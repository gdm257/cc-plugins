/**
 * browser-harness CLI resolution: PATH first, uvx fallback, install hint otherwise.
 */

import fs from 'node:fs'
import path from 'node:path'

const findOnPath = (name, env, exists, platform) => {
  const bin = platform === 'win32' ? `${name}.exe` : name
  for (const dir of (env.PATH ?? '').split(path.delimiter)) {
    if (!dir) continue
    const candidate = path.join(dir, bin)
    if (exists(candidate)) return candidate
  }
  return null
}

/** Resolve to { command, args, source } or throw with the uv tool install hint. */
export function resolveCli(env = process.env, exists = fs.existsSync, platform = process.platform) {
  const direct = findOnPath('browser-harness', env, exists, platform)
  if (direct) return { command: direct, args: [], source: 'path' }
  if (findOnPath('uvx', env, exists, platform)) return { command: 'uvx', args: ['browser-harness'], source: 'uvx' }
  throw new Error('browser-harness CLI not found on PATH and uvx is unavailable; install it with: uv tool install --python 3.12 --upgrade --force browser-harness')
}
