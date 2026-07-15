import { describe, expect, it, vi, afterEach } from 'vitest'
import { ApprovalService } from '../packages/app/src/main/services/approval'

describe('ApprovalService', () => {
  afterEach(() => {
    vi.useRealTimers()
  })

  it('resolves true when approved', async () => {
    const service = new ApprovalService()
    const pending = service.waitForApproval('session-1', 'tool-1')
    service.respond('session-1', 'tool-1', true)
    await expect(pending).resolves.toBe(true)
  })

  it('resolves false when rejected', async () => {
    const service = new ApprovalService()
    const pending = service.waitForApproval('session-1', 'tool-1')
    service.respond('session-1', 'tool-1', false)
    await expect(pending).resolves.toBe(false)
  })

  it('times out when no response', async () => {
    vi.useFakeTimers()
    const service = new ApprovalService()
    const pending = service.waitForApproval('session-1', 'tool-1', 1000)
    vi.advanceTimersByTime(1001)
    await expect(pending).resolves.toBe(false)
  })

  it('cancelAll rejects pending approvals for the session', async () => {
    const service = new ApprovalService()
    const pending1 = service.waitForApproval('session-1', 'tool-1')
    const pending2 = service.waitForApproval('session-1', 'tool-2')
    const pendingOther = service.waitForApproval('session-2', 'tool-1')

    service.cancelAll('session-1')

    await expect(pending1).resolves.toBe(false)
    await expect(pending2).resolves.toBe(false)
    expect(service.respond('session-1', 'tool-1', true)).toBeUndefined()
    service.respond('session-2', 'tool-1', true)
    await expect(pendingOther).resolves.toBe(true)
  })

  it('ignores respond for unknown toolCallId', () => {
    const service = new ApprovalService()
    expect(() => service.respond('session-1', 'missing', true)).not.toThrow()
  })
})
