// ES Module loader for Mocha tests
export async function resolve(specifier, context, defaultResolve) {
  return defaultResolve(specifier, context)
}

export async function load(url, context, defaultLoad) {
  return defaultLoad(url, context)
}