import { useState, type CSSProperties } from 'react'
import { createPortal } from 'react-dom'
import type { CeoApprovalDecision, CeoApprovalRequest } from '@codex/shared'
import { MarkdownRenderer } from './MarkdownRenderer'

interface CeoApprovalDialogProps {
  request: CeoApprovalRequest & { sessionId: string }
  onRespond: (decision: CeoApprovalDecision, note?: string) => void
}

const btnBase: CSSProperties = {
  padding: '8px 14px',
  fontSize: 13,
  borderRadius: 4,
  border: '1px solid #3c3c3c',
  cursor: 'pointer',
}

export function CeoApprovalDialog({ request, onRespond }: CeoApprovalDialogProps) {
  const [note, setNote] = useState('')

  return createPortal(
    <div
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 100001,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        backgroundColor: 'rgba(0,0,0,0.8)',
        padding: 16,
      }}
    >
      <div
        style={{
          width: '100%',
          maxWidth: 720,
          maxHeight: '90vh',
          overflow: 'auto',
          backgroundColor: '#252526',
          border: '1px solid #3c3c3c',
          borderRadius: 8,
          padding: 20,
          color: '#cccccc',
        }}
      >
        <h3 style={{ margin: '0 0 8px', fontSize: 16, color: '#fff' }}>社長承認</h3>
        <p style={{ margin: '0 0 4px', fontSize: 12, color: '#858585' }}>
          {request.teamName}（{request.teamId}）
          {request.suggestedDecision ? ` · AI提案: ${request.suggestedDecision}` : ''}
        </p>
        <p style={{ margin: '0 0 12px', fontSize: 13, color: '#a3a3a3' }}>{request.task}</p>

        <p style={{ margin: '0 0 6px', fontSize: 11, color: '#858585' }}>社長（AI）の判断案</p>
        <div
          className="markdown-body"
          style={{
            margin: '0 0 16px',
            maxHeight: 360,
            overflow: 'auto',
            padding: 12,
            fontSize: 13,
            lineHeight: 1.55,
            backgroundColor: '#1e1e1e',
            border: '1px solid #3c3c3c',
            borderRadius: 4,
            color: '#cccccc',
          }}
        >
          <MarkdownRenderer content={request.decisionBrief || '(空)'} />
        </div>

        <label style={{ display: 'block', fontSize: 11, color: '#858585', marginBottom: 6 }}>
          メモ（条件付き承認時は必須）
        </label>
        <textarea
          value={note}
          onChange={(e) => setNote(e.target.value)}
          rows={3}
          placeholder="例: 個人情報はマスクしてから実装すること"
          style={{
            width: '100%',
            boxSizing: 'border-box',
            marginBottom: 16,
            padding: 10,
            fontSize: 13,
            color: '#cccccc',
            backgroundColor: '#1e1e1e',
            border: '1px solid #3c3c3c',
            borderRadius: 4,
            resize: 'vertical',
          }}
        />

        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, justifyContent: 'flex-end' }}>
          <button
            type="button"
            style={{ ...btnBase, backgroundColor: 'transparent', color: '#a3a3a3' }}
            onClick={() => onRespond('defer', note.trim() || undefined)}
          >
            見送り
          </button>
          <button
            type="button"
            style={{ ...btnBase, backgroundColor: 'transparent', color: '#f87171', borderColor: '#7f1d1d' }}
            onClick={() => onRespond('reject', note.trim() || undefined)}
          >
            差し戻し
          </button>
          <button
            type="button"
            style={{ ...btnBase, backgroundColor: '#b45309', color: '#fff', border: 'none' }}
            onClick={() => {
              if (!note.trim()) {
                window.alert('条件付き承認にはメモが必要です')
                return
              }
              onRespond('conditional', note.trim())
            }}
          >
            条件付き承認 → 実装
          </button>
          <button
            type="button"
            style={{ ...btnBase, backgroundColor: '#0078d4', color: '#fff', border: 'none' }}
            onClick={() => onRespond('approve', note.trim() || undefined)}
          >
            承認 → 実装へ
          </button>
        </div>
        <p style={{ margin: '12px 0 0', fontSize: 11, color: '#6e6e6e' }}>
          承認後は実装部が変更を行います（ファイル編集・Shell は従来どおり個別承認あり）。ボード:{' '}
          {request.boardRelativePath}
        </p>
      </div>
    </div>,
    document.body,
  )
}
