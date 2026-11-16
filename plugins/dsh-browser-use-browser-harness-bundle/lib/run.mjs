/**
 * browser-harness CLI execution: child spawn with bounded output, timeout
 * kill of the runner only (the daemon outlives it), hint extraction and
 * lane status composition.
 */

import { spawn } from 'node:child_process'

/** Cold-start heal prefix; without it the first command can outlive the daemon IPC budget. */
const ENSURE_DAEMON = 'ensure_daemon()\n'

export const RUN_TIMEOUT_MS = 120_000
const OUTPUT_CAP = 100_000
const DOCTOR_TIMEOUT_MS = 30_000

const makeSink = () => ({ text: '', truncated: false })

const capture = (sink) => (chunk) => {
  const next = sink.text + chunk.toString('utf8')
  if (next.length > OUTPUT_CAP) {
    sink.text = next.slice(-OUTPUT_CAP)
    sink.truncated = true
  } else {
    sink.text = next
  }
}

const finish = (sink) => (sink.truncated ? `${sink.text}...[truncated]` : sink.text)

/** Spawn [cli.command, ...cli.args, ...args]; optional stdin; resolves { exitCode, stdout, stderr, timedOut, aborted }. */
export function runCli({ cli, env = {}, args = [], stdin = null, timeoutMs = 30_000, signal, spawnFn = spawn }) {
  return new Promise((resolve) => {
    const child = spawnFn(cli.command, [...cli.args, ...args], {
      stdio: ['pipe', 'pipe', 'pipe'],
      env: { ...process.env, ...env },
      windowsHide: true,
    })
    const stdout = makeSink()
    const stderr = makeSink()
    let timedOut = false
    let aborted = false
    let settled = false

    const settle = (exitCode) => {
      if (settled) return
      settled = true
      clearTimeout(timer)
      signal?.removeEventListener?.('abort', onAbort)
      resolve({ exitCode: timedOut || aborted ? null : exitCode, stdout: finish(stdout), stderr: finish(stderr), timedOut, aborted })
    }

    const onAbort = () => {
      aborted = true
      // Kill only the runner process; the daemon it started is separate and self-heals.
      child.kill('SIGKILL')
    }

    const timer = setTimeout(() => {
      timedOut = true
      child.kill('SIGKILL')
    }, timeoutMs)

    if (signal) {
      if (signal.aborted) onAbort()
      else signal.addEventListener('abort', onAbort, { once: true })
    }

    child.stdout?.on('data', capture(stdout))
    child.stderr?.on('data', capture(stderr))
    child.on('error', (err) => {
      capture(stderr)(String(err))
      settle(null)
    })
    child.on('close', (code) => settle(code))

    if (stdin !== null) child.stdin?.write(stdin)
    child.stdin?.end()
  })
}

/** Actionable failure message from stderr; timeout, then abort, beat stderr parsing. */
export function extractHint(stderr, { timedOut = false, aborted = false, timeoutMs = 0 } = {}) {
  if (timedOut) return `timed out after ${timeoutMs}ms and the runner was killed; split long waits into shorter polling steps and print intermediate state`
  if (aborted) return 'aborted before completion'
  const instruction = stderr.match(/^browser-harness: (.+)$/m)
  if (instruction) return instruction[1].trim()
  const exception = stderr.split(/\r?\n/).filter((line) => /^(?:[A-Za-z_][\w.]*)?(?:Error|Exception|Interrupt|Timeout|Exit)\b/.test(line))
  return exception.length ? exception[exception.length - 1].trim() : null
}

/** Run Python on the lane daemon; returns the browser_run tool value. */
export async function runPython({ cli, env, code, timeoutMs = RUN_TIMEOUT_MS, signal, spawnFn }) {
  const result = await runCli({ cli, env, stdin: ENSURE_DAEMON + code, timeoutMs, signal, spawnFn })
  return {
    ok: result.exitCode === 0,
    exitCode: result.exitCode,
    stdout: result.stdout,
    stderr: result.stderr,
    hint: extractHint(result.stderr, { timedOut: result.timedOut, aborted: result.aborted, timeoutMs }),
  }
}

/** One-shot telemetry opt-out at activation; best effort by contract. */
export function disableTelemetry({ cli, spawnFn }) {
  return runCli({ cli, args: ['telemetry', 'disable'], timeoutMs: 15_000, spawnFn }).catch(() => {})
}

/** Warm the lane daemon, then read doctor --json under the lane env. */
export async function laneStatus({ cli, env, spawnFn }) {
  const warmup = await runPython({ cli, env, code: 'pass', spawnFn })
  const doctor = await runCli({ cli, env, args: ['doctor', '--json', '--require-existing-daemon'], timeoutMs: DOCTOR_TIMEOUT_MS, spawnFn })
  let parsed = null
  try {
    parsed = JSON.parse(doctor.stdout)
  } catch {}
  return {
    cli: cli.source,
    mode: 'dedicated',
    cdpUrl: env.BU_CDP_URL,
    lane: env.BU_NAME,
    healthy: parsed?.healthy ?? null,
    doctor: parsed ?? { exitCode: doctor.exitCode, stdout: doctor.stdout.slice(0, 2_000) },
    warmup: { ok: warmup.ok, exitCode: warmup.exitCode },
  }
}
