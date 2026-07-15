import { describe, expect, it } from 'vitest'
import { DEFAULT_SETTINGS, IPC_CHANNELS } from './packages/shared/src/index'

describe('shared', () => {
  it('exports default settings', () => {
    expect(DEFAULT_SETTINGS.general.theme).toBe('dark')
    expect(DEFAULT_SETTINGS.agent.maxIterations).toBe(25)
  })

  it('defines IPC channels', () => {
    expect(IPC_CHANNELS.WORKSPACE_OPEN).toBe('workspace:open')
    expect(IPC_CHANNELS.FILE_READ).toBe('file:read')
  })
})
