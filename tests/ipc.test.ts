import { describe, expect, it } from 'vitest'
import { IPC_CHANNELS, IPC_EVENTS } from '../packages/shared/src/index'

describe('shared IPC', () => {
  it('exports chat and search channels', () => {
    expect(IPC_CHANNELS.CHAT_SEND).toBe('chat:send')
    expect(IPC_CHANNELS.INDEX_SEARCH).toBe('index:search')
    expect(IPC_EVENTS.CHAT_STREAM).toBe('chat:stream')
  })
})
