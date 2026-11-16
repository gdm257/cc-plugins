// Offline stand-in for 'schemastery'; covers only what Config in index.js uses.
const field = (accept) => {
  const schema = (value) => {
    if (value === undefined) return schema.__default
    if (!accept(value)) throw new TypeError(`expected ${accept.kind}, got ${typeof value}`)
    return value
  }
  schema.default = (value) => {
    schema.__default = value
    return schema
  }
  schema.__default = undefined
  return schema
}

const Schema = (value) => value

Schema.string = () => field((v) => typeof v === 'string')
Schema.boolean = () => field((v) => typeof v === 'boolean')
Schema.object = (shape) => (value) => {
  const input = value ?? {}
  const resolved = {}
  for (const [key, fieldSchema] of Object.entries(shape)) resolved[key] = fieldSchema(input[key])
  return resolved
}

export default Schema
