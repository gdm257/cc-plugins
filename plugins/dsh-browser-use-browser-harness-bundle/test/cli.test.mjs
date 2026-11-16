// Unit tests for lib/cli.mjs: browser-harness CLI resolution order and install hint.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import path from 'node:path'

import { resolveCli } from '../lib/cli.mjs'

const hit = (dir, name) => path.join(dir, `${name}.exe`)

test('cli: browser-harness on PATH wins over uvx', () => {
  const bin = hit('C:\\tools\\bin', 'browser-harness')
  const exists = (p) => p === bin || p === hit('C:\\tools\\bin', 'uvx')
  assert.deepEqual(resolveCli({ PATH: ['C:\\tools\\bin', 'C:\\other'].join(path.delimiter) }, exists, 'win32'), {
    command: bin,
    args: [],
    source: 'path',
  })
})

test('cli: falls back to uvx browser-harness when only uvx is on PATH', () => {
  const uvx = hit('C:\\scoop\\shims', 'uvx')
  assert.deepEqual(resolveCli({ PATH: 'C:\\scoop\\shims' }, (p) => p === uvx, 'win32'), {
    command: 'uvx',
    args: ['browser-harness'],
    source: 'uvx',
  })
})

test('cli: posix PATH hit carries no .exe suffix', () => {
  const bin = path.join('/opt', 'bin', 'browser-harness')
  assert.deepEqual(resolveCli({ PATH: ['/opt', '/opt/bin'].join(path.delimiter) }, (p) => p === bin, 'linux'), {
    command: bin,
    args: [],
    source: 'path',
  })
})

test('cli: throws with the uv tool install hint when neither is found', () => {
  assert.throws(
    () => resolveCli({ PATH: 'C:\\empty' }, () => false, 'win32'),
    /uv tool install --python 3\.12 --upgrade --force browser-harness/,
  )
})
