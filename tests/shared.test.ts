import { describe, expect, it } from 'vitest'
import { APP_NAME, DEFAULT_SETTINGS, IPC_CHANNELS } from './packages/shared/src/index'

describe('shared', () => {
  it('exports default settings', () => {
    expect(DEFAULT_SETTINGS.general.theme).toBe('dark')
    expect(DEFAULT_SETTINGS.agent.maxIterations).toBe(50)
    expect(DEFAULT_SETTINGS.routing.mode).toBe('fixed')
  })

  it('defines IPC channels', () => {
    expect(IPC_CHANNELS.WORKSPACE_OPEN).toBe('workspace:open')
    expect(IPC_CHANNELS.FILE_READ).toBe('file:read')
  })

  it('exports Codex Studio as the application name', () => {
    expect(APP_NAME).toBe('Codex Studio')
  })
})
