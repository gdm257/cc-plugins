const stubs = {
  '@deepseek-ai/schemastery': './schemastery.mjs',
  '@deepseek-ai/dsh-browser-use/brand': './brand.mjs',
  '@deepseek-ai/dsh-tools': './dsh-tools.mjs',
  '@deepseek-ai/dsh-experimental-browser-use-runtime': './runtime.mjs',
}

export async function resolve(specifier, context, nextResolve) {
  const target = stubs[specifier]
  if (target) return { url: new URL(target, import.meta.url).href, shortCircuit: true }
  return nextResolve(specifier, context)
}
