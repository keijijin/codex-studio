import { describe, expect, it } from 'vitest'
import { PathIgnore, createDefaultPathIgnore } from '@codex/shared'

describe('PathIgnore', () => {
  it('always ignores node_modules and .git', () => {
    const rules = createDefaultPathIgnore()
    expect(rules.ignores('node_modules')).toBe(true)
    expect(rules.ignores('node_modules/foo/bar.js')).toBe(true)
    expect(rules.ignores('.git/config')).toBe(true)
    expect(rules.ignores('packages/app/src/main.ts')).toBe(false)
  })

  it('hides build outputs by default', () => {
    const rules = createDefaultPathIgnore({ showBuildOutputs: false })
    expect(rules.ignores('dist')).toBe(true)
    expect(rules.ignores('dist/main.js')).toBe(true)
    expect(rules.ignores('release/mac-arm64')).toBe(true)
    expect(rules.isShallowDirectory('dist')).toBe(false)
  })

  it('can show build outputs as shallow dirs', () => {
    const rules = createDefaultPathIgnore({ showBuildOutputs: true })
    expect(rules.ignores('dist')).toBe(false)
    expect(rules.ignores('dist/main.js')).toBe(false)
    expect(rules.isShallowDirectory('dist')).toBe(true)
    expect(rules.isShallowDirectory('CodexStudio.app')).toBe(true)
  })

  it('respects .gitignore patterns', () => {
    const rules = new PathIgnore({
      showBuildOutputs: true,
      gitignoreContent: `
*.log
.env
coverage/
tmp/**
!tmp/keep.txt
`,
    })
    expect(rules.ignores('foo.log')).toBe(true)
    expect(rules.ignores('.env')).toBe(true)
    expect(rules.ignores('coverage/a.js')).toBe(true)
    expect(rules.ignores('src/index.ts')).toBe(false)
  })

  it('does not freeze-path recurse into .app bundles', () => {
    const rules = createDefaultPathIgnore({ showBuildOutputs: true })
    expect(rules.isShallowDirectory('Foo.app', 'release/mac/Foo.app')).toBe(true)
  })
})
