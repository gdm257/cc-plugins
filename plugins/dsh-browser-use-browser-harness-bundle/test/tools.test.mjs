// Unit tests for lib/tools.mjs: tool definitions, serialization via resources.run, prompt section.
import { register } from 'node:module'
import { test } from 'node:test'
import assert from 'node:assert/strict'

register(new URL('./stubs/loader.mjs', import.meta.url))

const { browserRunTool, browserStatusTool, mountTools, PROMPT } = await import('../lib/tools.mjs')

const AGENT = { id: 'session-tools-test' }

test('prompt: covers idioms, login-wall policy and dedicated-profile proxy note', () => {
  for (const phrase of ['new_tab', 'Accessibility.getFullAXTree', 'browser_status', 'ask the user', 'proxy', 'persist']) {
    assert.ok(PROMPT.includes(phrase), `prompt must mention ${phrase}`)
  }
})

test('mountTools: section at TOOL_COMPUTER_USE order plus both tools registered, disposers remove them', () => {
  const sections = []
  const tools = new Map()
  const ctx = {
    systemPrompt: {
      getSectionOrder: (name) => (name === 'TOOL_COMPUTER_USE' ? 720 : 0),
      section: (section) => (sections.push(section), () => sections.pop()),
    },
    tools: {
      register: (definition) => (tools.set(definition.name, definition), () => tools.delete(definition.name)),
    },
    agents: { requireInitiator: () => AGENT },
  }
  const dispose = mountTools(ctx, { resources: {} })
  assert.equal(sections.length, 1)
  assert.equal(sections[0].name, 'browser-use-browser-harness')
  assert.equal(sections[0].order, 720)
  assert.equal(sections[0].text, PROMPT)
  assert.deepEqual([...tools.keys()].sort(), ['browser_run', 'browser_status'])
  dispose()
  assert.equal(sections.length, 0)
  assert.equal(tools.size, 0)
})

test('browser_run: declares code parameter, 5-field output and headroom over the internal 120s timeout', () => {
  const tool = browserRunTool({ resources: {}, requireAgent: () => AGENT })
  assert.equal(tool.name, 'browser_run')
  assert.equal(tool.parameters.code.type, 'string')
  assert.equal(tool.parameters.code.required, true)
  assert.ok(tool.timeoutMs > 120_000)
  const properties = tool.output.schema.properties
  assert.deepEqual(Object.keys(properties).sort(), ['exitCode', 'hint', 'ok', 'stderr', 'stdout'])
  assert.equal(properties.ok.type, 'boolean')
  assert.deepEqual(properties.exitCode.oneOf.map((branch) => branch.type).sort(), ['integer', 'null'])
})

test('browser_run: executes inside resources.run on the lane handle with the caller signal', async () => {
  const order = []
  const lane = { run: async (code, options) => (order.push(['lane.run', code, options.signal?.name]), { ok: true, exitCode: 0, stdout: 'ok', stderr: '', hint: null }) }
  const resources = {
    get: async (agent) => (order.push(['get', agent]), lane),
    run: async (agent, signal, op) => (order.push(['run', agent, signal?.name]), op()),
  }
  const signal = AbortSignal.timeout(5_000)
  Object.assign(signal, { name: 'caller' })
  const tool = browserRunTool({ resources, requireAgent: () => AGENT })
  const result = await tool.execute({ code: 'print(1)' }, { signal })
  assert.deepEqual(result, { ok: true, exitCode: 0, stdout: 'ok', stderr: '', hint: null })
  assert.deepEqual(order, [
    ['get', AGENT],
    ['run', AGENT, 'caller'],
    ['lane.run', 'print(1)', 'caller'],
  ])
})

// output.render must return ContentBlock[]: the Host pipeline lands it verbatim in
// result.content, where post-execute consumers filter blocks (a bare string kills the call).
test('browser_run: render returns text blocks; stdout on success, hint plus stderr on failure', () => {
  const tool = browserRunTool({ resources: {}, requireAgent: () => AGENT })
  assert.deepEqual(
    tool.output.render({ code: '' }, { ok: true, exitCode: 0, stdout: 'TITLE\n', stderr: '', hint: null }),
    [{ type: 'text', text: 'TITLE\n' }],
  )
  assert.deepEqual(
    tool.output.render({ code: '' }, { ok: false, exitCode: null, stdout: '', stderr: 'boom', hint: 'timed out after 120000ms' }),
    [{ type: 'text', text: 'timed out after 120000ms\nboom' }],
  )
})

test('browser_status: no parameters, warmup-and-doctor report, executed through resources.run', async () => {
  const order = []
  const status = { cli: 'uvx', mode: 'dedicated', cdpUrl: 'http://127.0.0.1:1', lane: 'bh-x', healthy: true, doctor: {}, warmup: { ok: true, exitCode: 0 } }
  const lane = { status: async () => (order.push('lane.status'), status) }
  const resources = {
    get: async () => lane,
    run: async (agent, signal, op) => op(),
  }
  const tool = browserStatusTool({ resources, requireAgent: () => AGENT })
  assert.deepEqual(tool.parameters, {})
  const result = await tool.execute({}, { signal: undefined })
  assert.equal(result, status)
  assert.deepEqual(order, ['lane.status'])
  assert.deepEqual(tool.output.render({}, status), [{ type: 'text', text: JSON.stringify(status, null, 2) }])
})
