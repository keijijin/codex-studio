import type { CeoApprovalDecision, CeoApprovalResponse } from '@codex/shared'

/**
 * Wait for human CEO approval decisions (richer than boolean tool approvals).
 */
export class CeoApprovalService {
  private pending = new Map<string, (response: CeoApprovalResponse) => void>()

  private key(sessionId: string, approvalId: string): string {
    return `${sessionId}:${approvalId}`
  }

  wait(
    sessionId: string,
    approvalId: string,
    timeoutMs = 600_000,
  ): Promise<CeoApprovalResponse> {
    const k = this.key(sessionId, approvalId)
    return new Promise((resolve) => {
      const timer = setTimeout(() => {
        this.pending.delete(k)
        resolve({ decision: 'defer', note: 'Timed out waiting for CEO approval' })
      }, timeoutMs)

      this.pending.set(k, (response) => {
        clearTimeout(timer)
        this.pending.delete(k)
        resolve(response)
      })
    })
  }

  respond(sessionId: string, approvalId: string, response: CeoApprovalResponse): void {
    const resolve = this.pending.get(this.key(sessionId, approvalId))
    if (resolve) resolve(response)
  }

  cancelAll(sessionId: string): void {
    for (const [k, resolve] of this.pending) {
      if (k.startsWith(`${sessionId}:`)) {
        resolve({ decision: 'defer', note: 'Cancelled' })
        this.pending.delete(k)
      }
    }
  }
}

export function parseSuggestedCeoDecision(brief: string): CeoApprovalDecision | undefined {
  const head = brief.slice(0, 800)
  if (/条件付き承認|conditional/i.test(head)) return 'conditional'
  if (/差し戻し|reject|差し戻/i.test(head)) return 'reject'
  if (/見送り|defer|保留/i.test(head)) return 'defer'
  if (/承認|approve|\bGo\b|承認する/i.test(head) && !/未承認|不承認/.test(head)) {
    return 'approve'
  }
  return undefined
}

export const ceoApprovalService = new CeoApprovalService()
