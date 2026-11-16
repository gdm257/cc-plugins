// Offline stand-in for '@deepseek-ai/dsh-tools'; covers only defineTool as tools.mjs uses it.
export function defineTool(options) {
  return {
    name: options.name,
    description: options.description,
    parameters: options.parameters,
    output: options.output,
    ...(options.timeoutMs !== undefined ? { timeoutMs: options.timeoutMs } : {}),
    async execute(args, exec) {
      return options.execute(args, exec)
    },
  }
}
