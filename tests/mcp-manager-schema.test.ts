import { describe, expect, it } from 'vitest'
import {
  effectiveMcpCwd,
  jsonSchemaToToolParams,
  sameMcpConnection,
  stableMcpEnvKey,
} from '@codex/mcp-client'
import type { McpServerConfig } from '@codex/shared'

const baseConfig = (over: Partial<McpServerConfig> = {}): McpServerConfig => ({
  id: 'demo',
  name: 'Demo',
  enabled: true,
  command: 'npx',
  args: ['-y', 'demo'],
  ...over,
})

describe('jsonSchemaToToolParams', () => {
  it('keeps items, enum, anyOf, and nested properties', () => {
    const input = {
      type: 'object',
      properties: {
        tags: { type: 'array', items: { type: 'string' }, description: 'tags' },
        mode: { type: 'string', enum: ['a', 'b'] },
        nested: {
          type: 'object',
          properties: { n: { type: 'number' } },
        },
        choice: { anyOf: [{ type: 'string' }, { type: 'number' }] },
      },
      required: ['tags'],
    }
    const out = jsonSchemaToToolParams(input)
    expect(out.properties).toEqual(input.properties)
    expect(out.required).toEqual(['tags'])
    expect(out.properties.tags).toMatchObject({ items: { type: 'string' } })
  })
})

describe('MCP connection identity', () => {
  it('treats env key order as irrelevant but values as significant', () => {
    expect(stableMcpEnvKey({ B: '2', A: '1' })).toBe(stableMcpEnvKey({ A: '1', B: '2' }))
    expect(stableMcpEnvKey({ A: '1' })).not.toBe(stableMcpEnvKey({ A: '2' }))
  })

  it('reconnects when env or cwd/workspace changes', () => {
    const existing = {
      config: baseConfig({ env: { TOKEN: 'old' }, cwd: '/a' }),
      workspaceRoot: '/ws',
    }
    expect(sameMcpConnection(existing, baseConfig({ env: { TOKEN: 'old' }, cwd: '/a' }), '/ws')).toBe(
      true,
    )
    expect(sameMcpConnection(existing, baseConfig({ env: { TOKEN: 'new' }, cwd: '/a' }), '/ws')).toBe(
      false,
    )
    expect(sameMcpConnection(existing, baseConfig({ env: { TOKEN: 'old' }, cwd: '/b' }), '/ws')).toBe(
      false,
    )
    expect(
      sameMcpConnection(
        { config: baseConfig({ env: { TOKEN: 'old' } }), workspaceRoot: '/ws1' },
        baseConfig({ env: { TOKEN: 'old' } }),
        '/ws2',
      ),
    ).toBe(false)
  })

  it('uses config.cwd or workspace root as effective cwd', () => {
    expect(effectiveMcpCwd({ cwd: '/a' }, '/ws')).toBe('/a')
    expect(effectiveMcpCwd({}, '/ws')).toBe('/ws')
  })
})
