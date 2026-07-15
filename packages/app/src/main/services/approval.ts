import type { ApprovalRequest } from '@codex/shared'

export class ApprovalService {
  private pending = new Map<string, (approved: boolean) => void>()

  private key(sessionId: string, toolCallId: string): string {
    return `${sessionId}:${toolCallId}`
  }

  waitForApproval(sessionId: string, toolCallId: string, timeoutMs = 300_000): Promise<boolean> {
    const k = this.key(sessionId, toolCallId)
    return new Promise((resolve) => {
      const timer = setTimeout(() => {
        this.pending.delete(k)
        resolve(false)
      }, timeoutMs)

      this.pending.set(k, (approved) => {
        clearTimeout(timer)
        this.pending.delete(k)
        resolve(approved)
      })
    })
  }

  respond(sessionId: string, toolCallId: string, approved: boolean): void {
    const resolve = this.pending.get(this.key(sessionId, toolCallId))
    if (resolve) resolve(approved)
  }

  cancelAll(sessionId: string): void {
    for (const [k, resolve] of this.pending) {
      if (k.startsWith(`${sessionId}:`)) {
        resolve(false)
        this.pending.delete(k)
      }
    }
  }
}

export const approvalService = new ApprovalService()
