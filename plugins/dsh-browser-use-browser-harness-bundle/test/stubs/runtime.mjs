// Offline stand-in for '@deepseek-ai/dsh-experimental-browser-use-runtime'.
// Records constructed instances so tests can assert options and drive run/get.
export const instances = []

export class SessionResources {
  constructor(ctx, options) {
    this.ctx = ctx
    this.options = options
    this.disposed = false
    this.entries = new Map()
    instances.push(this)
  }

  async get(agent) {
    if (!this.entries.has(agent)) this.entries.set(agent, await this.options.open(agent, undefined))
    return this.entries.get(agent).value
  }

  async run(agent, signal, op) {
    const value = await this.get(agent)
    return op(value)
  }

  async dispose() {
    this.disposed = true
    this.entries.clear()
  }
}
