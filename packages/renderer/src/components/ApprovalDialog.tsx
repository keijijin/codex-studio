import { createPortal } from 'react-dom'
import type { ApprovalRequest } from '@codex/shared'
import { FileDiffView, guessLanguageFromPath } from './DiffEditor'

interface ApprovalDialogProps {
  request: ApprovalRequest & { sessionId: string }
  onRespond: (approved: boolean) => void
}

function ContentPreview({ content, label }: { content: string; label?: string }) {
  return (
    <div>
      {label && (
        <p style={{ margin: '0 0 6px', fontSize: 11, color: '#858585' }}>{label}</p>
      )}
      <pre
        style={{
          margin: 0,
          maxHeight: 320,
          overflow: 'auto',
          padding: 12,
          fontSize: 12,
          lineHeight: 1.5,
          backgroundColor: '#1e1e1e',
          border: '1px solid #3c3c3c',
          borderRadius: 4,
          whiteSpace: 'pre-wrap',
          wordBreak: 'break-word',
        }}
      >
        {content || '(空)'}
      </pre>
    </div>
  )
}

export function ApprovalDialog({ request, onRespond }: ApprovalDialogProps) {
  const isShell = request.action === 'shell' || request.tool === 'Shell'
  const isCreate = request.action === 'create'
  const showPlainPreview = isCreate || (request.action === 'overwrite' && !request.oldContent)

  return createPortal(
    <div
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 100000,
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
        <h3 style={{ margin: '0 0 8px', fontSize: 16, color: '#fff' }}>
          変更の承認
        </h3>
        <p style={{ margin: '0 0 12px', fontSize: 13, color: '#858585' }}>
          <strong style={{ color: '#cccccc' }}>{request.tool}</strong>
          {' · '}
          {request.relativePath || request.summary}
        </p>

        {isShell ? (
          <pre
            style={{
              margin: '0 0 16px',
              padding: 12,
              fontSize: 12,
              backgroundColor: '#1e1e1e',
              border: '1px solid #3c3c3c',
              borderRadius: 4,
              whiteSpace: 'pre-wrap',
              wordBreak: 'break-all',
            }}
          >
            {request.summary}
          </pre>
        ) : request.action === 'delete' ? (
          <p style={{ margin: '0 0 16px', fontSize: 13, color: '#f87171' }}>
            このファイルを削除します: {request.relativePath}
          </p>
        ) : showPlainPreview ? (
          <ContentPreview content={request.newContent} label="作成する内容" />
        ) : (
          <FileDiffView
            oldContent={request.oldContent}
            newContent={request.newContent}
            language={guessLanguageFromPath(request.relativePath)}
          />
        )}

        <div style={{ marginTop: 16, display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
          <button
            type="button"
            onClick={() => onRespond(false)}
            style={{
              padding: '8px 16px',
              fontSize: 14,
              color: '#858585',
              backgroundColor: 'transparent',
              border: '1px solid #3c3c3c',
              borderRadius: 4,
              cursor: 'pointer',
            }}
          >
            却下
          </button>
          <button
            type="button"
            onClick={() => onRespond(true)}
            style={{
              padding: '8px 16px',
              fontSize: 14,
              color: '#fff',
              backgroundColor: '#0078d4',
              border: 'none',
              borderRadius: 4,
              cursor: 'pointer',
            }}
          >
            適用
          </button>
        </div>
      </div>
    </div>,
    document.body,
  )
}
