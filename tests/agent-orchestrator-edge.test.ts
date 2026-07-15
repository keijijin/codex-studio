import { mkdtemp, writeFile, rm } from 'fs/promises'
import { join } from 'path'
import { tmpdir } from 'os'
import { describe, expect, it } from 'vitest'
import { AgentOrchestrator } from '@codex/agent-core'
import { ToolRegistry, readTool, writeTool } from '@codex/tools'
import {
  collectOrchestratorEvents,
  createAgentRunContext,
  createMockProvider,
} from './helpers/agent-test-utils'

describe('AgentOrchestrator edge cases', () => {
  it('requests approval before write and skips apply when rejected', async () => {
    const root = await mkdtemp(join(tmpdir(), 'codex-orch-'))
    const target = join(root, 'draft.txt')
    await writeFile(target, 'before', 'utf-8')

    const registry = new ToolRegistry([writeTool])
    const llm = createMockProvider([
      [{ type: 'tool_calls', calls: [{ id: 'tc1', name: 'Write', arguments: { path: 'draft.txt', content: 'after' } }] }],
      [{ type: 'text', delta: 'Rejected.' }],
    ])
    const orchestrator = new AgentOrchestrator(llm, registry)
    const approvalRequests: unknown[] = []

    const events = await collectOrchestratorEvents(
      orchestrator.run([{ role: 'user', content: 'Update draft.txt' }], createAgentRunContext(root, {
        yoloMode: false,
        enabledTools: ['Write'],
        resolvePath: (p) => join(root, p),
        getRelativePath: (p) => p.replace(`${root}/`, ''),
        requestApproval: async (req) => {
          approvalRequests.push(req)
          return false
        },
      })),
    )

    expect(approvalRequests).toHaveLength(1)
    expect(events.some((e) => e.type === 'approval_required')).toBe(true)
    const result = events.find((e) => e.type === 'tool_call_result')
    expect(result?.success).toBe(false)
    expect(String(result?.result)).toContain('rejected')
  })

  it('applies write after approval', async () => {
    const root = await mkdtemp(join(tmpdir(), 'codex-orch-'))
    const target = join(root, 'approved.txt')

    try {
      const registry = new ToolRegistry([writeTool])
      const llm = createMockProvider([
        [{ type: 'tool_calls', calls: [{ id: 'tc1', name: 'Write', arguments: { path: 'approved.txt', content: 'approved content' } }] }],
        [{ type: 'text', delta: 'Done.' }],
      ])
      const orchestrator = new AgentOrchestrator(llm, registry)

      const events = await collectOrchestratorEvents(
        orchestrator.run([{ role: 'user', content: 'Create approved.txt' }], createAgentRunContext(root, {
          yoloMode: false,
          enabledTools: ['Write'],
          resolvePath: (p) => join(root, p),
          getRelativePath: (p) => p.replace(`${root}/`, ''),
          requestApproval: async () => true,
        })),
      )

      const result = events.find((e) => e.type === 'tool_call_result')
      expect(result?.success).toBe(true)
      const { readFile } = await import('fs/promises')
      expect(await readFile(target, 'utf-8')).toBe('approved content')
    } finally {
      await rm(root, { recursive: true, force: true })
    }
  })

  it('respects maxIterations', async () => {
    const root = await mkdtemp(join(tmpdir(), 'codex-orch-'))
    try {
      const registry = new ToolRegistry([readTool])
      const llm = createMockProvider([
        [{ type: 'tool_calls', calls: [{ id: 'tc1', name: 'Read', arguments: { path: 'README.md' } }] }],
        [{ type: 'tool_calls', calls: [{ id: 'tc2', name: 'Read', arguments: { path: 'README.md' } }] }],
        [{ type: 'tool_calls', calls: [{ id: 'tc3', name: 'Read', arguments: { path: 'README.md' } }] }],
      ])
      const orchestrator = new AgentOrchestrator(llm, registry)
      await writeFile(join(root, 'README.md'), '# test', 'utf-8')

      const events = await collectOrchestratorEvents(
        orchestrator.run([{ role: 'user', content: 'Keep reading' }], createAgentRunContext(root, {
          maxIterations: 2,
          enabledTools: ['Read'],
          resolvePath: (p) => join(root, p),
          getRelativePath: (p) => p.replace(`${root}/`, ''),
        })),
      )

      const error = events.find((e) => e.type === 'error')
      expect(error?.message).toMatch(/Max iterations \(2\) reached/)
    } finally {
      await rm(root, { recursive: true, force: true })
    }
  })

  it('handles cancellation when signal is already aborted', async () => {
    const registry = new ToolRegistry([readTool])
    const llm = createMockProvider([])
    const orchestrator = new AgentOrchestrator(llm, registry)
    const controller = new AbortController()
    controller.abort()

    const events = await collectOrchestratorEvents(
      orchestrator.run([{ role: 'user', content: 'Cancel me' }], createAgentRunContext(process.cwd(), {
        signal: controller.signal,
      })),
    )

    expect(events).toEqual([{ type: 'error', message: 'Cancelled' }])
  })

  it('stops when signal is aborted between iterations', async () => {
    const root = await mkdtemp(join(tmpdir(), 'codex-orch-'))
    try {
      await writeFile(join(root, 'README.md'), '# test', 'utf-8')
      const registry = new ToolRegistry([readTool])
      const llm = createMockProvider([
        [{ type: 'tool_calls', calls: [{ id: 'tc1', name: 'Read', arguments: { path: 'README.md' } }] }],
        [{ type: 'tool_calls', calls: [{ id: 'tc2', name: 'Read', arguments: { path: 'README.md' } }] }],
      ])
      const orchestrator = new AgentOrchestrator(llm, registry)
      const controller = new AbortController()

      const events: Array<{ type: string; [key: string]: unknown }> = []
      const generator = orchestrator.run([{ role: 'user', content: 'Read twice' }], createAgentRunContext(root, {
        maxIterations: 5,
        enabledTools: ['Read'],
        signal: controller.signal,
        resolvePath: (p) => join(root, p),
        getRelativePath: (p) => p.replace(`${root}/`, ''),
      }))

      for await (const event of generator) {
        events.push(event)
        if (event.type === 'tool_call_result') {
          controller.abort()
        }
      }

      expect(events.some((e) => e.type === 'tool_call_result')).toBe(true)
      expect(events.at(-1)).toEqual({ type: 'error', message: 'Cancelled' })
    } finally {
      await rm(root, { recursive: true, force: true })
    }
  })

  it('recovers from LLM stream error', async () => {
    const registry = new ToolRegistry([readTool])
    const llm = createMockProvider([[{ type: 'error', error: 'stream failed' }]])
    const orchestrator = new AgentOrchestrator(llm, registry)

    const events = await collectOrchestratorEvents(
      orchestrator.run([{ role: 'user', content: 'Fail' }], createAgentRunContext(process.cwd())),
    )

    expect(events).toEqual([{ type: 'error', message: 'stream failed' }])
  })
})
