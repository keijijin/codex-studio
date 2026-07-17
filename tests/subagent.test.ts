import { mkdtemp, writeFile, rm } from 'fs/promises'
import { join } from 'path'
import { tmpdir } from 'os'
import { describe, expect, it } from 'vitest'
import { AgentOrchestrator, runSubagentTask } from '@codex/agent-core'
import { ToolRegistry, readTool, taskTool } from '@codex/tools'
import {
  collectOrchestratorEvents,
  createAgentRunContext,
  createMockProvider,
} from './helpers/agent-test-utils'

describe('Task subagents', () => {
  it('runs Task tool via runSubagent callback', async () => {
    const root = await mkdtemp(join(tmpdir(), 'codex-task-'))
    try {
      await writeFile(join(root, 'a.txt'), 'hello', 'utf-8')
      const registry = new ToolRegistry([taskTool, readTool])
      const llm = createMockProvider([
        [
          {
            type: 'tool_calls',
            calls: [
              {
                id: 't1',
                name: 'Task',
                arguments: { description: 'read a', prompt: 'Read a.txt and report' },
              },
            ],
          },
        ],
        [{ type: 'text', delta: 'Parent done.' }],
      ])
      const orchestrator = new AgentOrchestrator(llm, registry)

      const events = await collectOrchestratorEvents(
        orchestrator.run([{ role: 'user', content: 'Investigate' }], createAgentRunContext(root, {
          enabledTools: ['Task', 'Read'],
          yoloMode: true,
          resolvePath: (p) => join(root, p),
          getRelativePath: (p) => p.replace(`${root}/`, ''),
          runSubagent: async ({ prompt, description }) => {
            expect(prompt).toContain('Read a.txt')
            return {
              success: true,
              output: `## Subagent report (${description})\nok`,
            }
          },
        })),
      )

      const result = events.find((e) => e.type === 'tool_call_result')
      expect(result?.success).toBe(true)
      expect(String(result?.result)).toContain('Subagent report')
    } finally {
      await rm(root, { recursive: true, force: true })
    }
  })

  it('rejects nested subagents inside runSubagentTask', async () => {
    const llm = createMockProvider([[{ type: 'text', delta: 'should not run' }]])
    const registry = new ToolRegistry([readTool])
    const result = await runSubagentTask({
      prompt: 'x',
      workspaceRoot: process.cwd(),
      sessionId: 's',
      modelId: 'm',
      apiKey: 'k',
      signal: new AbortController().signal,
      llm,
      registry,
      resolvePath: (p) => p,
      getRelativePath: (p) => p,
      parentDepth: 1,
    })
    expect(result.success).toBe(false)
    expect(result.output).toMatch(/nested/i)
  })
})
