import { createVitest } from 'vitest/node'

export async function collectTests(root) {
  const vitest = await createVitest('test', {
    root,
    watch: false,
    configLoader: 'runner',
    cache: false,
    reporters: [],
  })
  try {
    // Runtime collection expands parameterized cases without running test bodies
    // or hooks. Unlike `vitest list`, unfiltered allTests includes skipped cases.
    const { testModules, unhandledErrors } = await vitest.collect()
    if (unhandledErrors.length || testModules.some(module => !module.ok())) {
      throw new Error('Vitest test collection failed', { cause: unhandledErrors })
    }
    return testModules.flatMap(module => [...module.children.allTests()].map(test => ({
      name: test.fullName,
      file: module.moduleId,
    })))
  } finally {
    await vitest.close()
  }
}
