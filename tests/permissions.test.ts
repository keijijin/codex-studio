import { describe, expect, it } from 'vitest'
import {
  DEFAULT_AGENT_PERMISSIONS,
  isToolEnabled,
  permissionForTool,
  type AgentPermissions,
} from '@codex/shared'

describe('permissions', () => {
  it('maps tools to categories with defaults', () => {
    expect(permissionForTool('Read', DEFAULT_AGENT_PERMISSIONS)).toBe('allow')
    expect(permissionForTool('Grep', DEFAULT_AGENT_PERMISSIONS)).toBe('allow')
    expect(permissionForTool('GitStatus', DEFAULT_AGENT_PERMISSIONS)).toBe('allow')
    expect(permissionForTool('Task', DEFAULT_AGENT_PERMISSIONS)).toBe('allow')
    expect(permissionForTool('Write', DEFAULT_AGENT_PERMISSIONS)).toBe('ask')
    expect(permissionForTool('Shell', DEFAULT_AGENT_PERMISSIONS)).toBe('ask')
    expect(permissionForTool('Team', DEFAULT_AGENT_PERMISSIONS)).toBe('ask')
    expect(permissionForTool('WebSearch', DEFAULT_AGENT_PERMISSIONS)).toBe('allow')
    expect(permissionForTool('MemoryAppend', DEFAULT_AGENT_PERMISSIONS)).toBe('ask')
    expect(permissionForTool('GenerateVideo', DEFAULT_AGENT_PERMISSIONS)).toBe('ask')
    expect(permissionForTool('GeneratePresentation', DEFAULT_AGENT_PERMISSIONS)).toBe('ask')
  })

  it('matches tool names case-insensitively for permissions', () => {
    const permissions: AgentPermissions = {
      read: 'allow',
      edit: 'allow',
      shell: 'deny',
      network: 'allow',
      media: 'ask',
      mcp: 'ask',
    }
    expect(permissionForTool('shell', permissions)).toBe('deny')
    expect(permissionForTool('SHELL', permissions)).toBe('deny')
    expect(permissionForTool('write', permissions)).toBe('allow')
  })

  it('respects per-category overrides including network', () => {
    const permissions: AgentPermissions = {
      read: 'deny',
      edit: 'allow',
      shell: 'deny',
      network: 'deny',
      media: 'deny',
      mcp: 'deny',
    }
    expect(permissionForTool('Glob', permissions)).toBe('deny')
    expect(permissionForTool('StrReplace', permissions)).toBe('allow')
    expect(permissionForTool('Shell', permissions)).toBe('deny')
    expect(permissionForTool('WebSearch', permissions)).toBe('deny')
    expect(permissionForTool('GenerateVideo', permissions)).toBe('deny')
    expect(permissionForTool('GeneratePresentation', permissions)).toBe('deny')
    expect(permissionForTool('mcp__demo__tool', permissions)).toBe('deny')
  })

  it('maps mcp__ tools to mcp category', () => {
    expect(permissionForTool('mcp__fs__list', DEFAULT_AGENT_PERMISSIONS)).toBe('ask')
  })

  it('enforces enabledTools allow-list', () => {
    expect(isToolEnabled('Write', ['Read', 'Grep'])).toBe(false)
    expect(isToolEnabled('Read', ['Read', 'Grep'])).toBe(true)
    expect(isToolEnabled('write', ['Write'])).toBe(true)
    expect(isToolEnabled('mcp__x__y', ['Read', '*mcp*'])).toBe(true)
    expect(isToolEnabled('Write', undefined)).toBe(true)
  })
})
