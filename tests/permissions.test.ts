import { describe, expect, it } from 'vitest'
import {
  DEFAULT_AGENT_PERMISSIONS,
  permissionForTool,
  type AgentPermissions,
} from '@codex/shared'

describe('permissions', () => {
  it('maps tools to categories with defaults', () => {
    expect(permissionForTool('Read', DEFAULT_AGENT_PERMISSIONS)).toBe('allow')
    expect(permissionForTool('Grep', DEFAULT_AGENT_PERMISSIONS)).toBe('allow')
    expect(permissionForTool('Task', DEFAULT_AGENT_PERMISSIONS)).toBe('allow')
    expect(permissionForTool('Write', DEFAULT_AGENT_PERMISSIONS)).toBe('ask')
    expect(permissionForTool('Shell', DEFAULT_AGENT_PERMISSIONS)).toBe('ask')
    expect(permissionForTool('WebSearch', DEFAULT_AGENT_PERMISSIONS)).toBe('allow')
    expect(permissionForTool('MemoryAppend', DEFAULT_AGENT_PERMISSIONS)).toBe('ask')
  })

  it('respects per-category overrides including network', () => {
    const permissions: AgentPermissions = {
      read: 'deny',
      edit: 'allow',
      shell: 'deny',
      network: 'deny',
    }
    expect(permissionForTool('Glob', permissions)).toBe('deny')
    expect(permissionForTool('StrReplace', permissions)).toBe('allow')
    expect(permissionForTool('Shell', permissions)).toBe('deny')
    expect(permissionForTool('WebSearch', permissions)).toBe('deny')
  })
})
