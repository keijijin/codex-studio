import { describe, expect, it } from 'vitest'
import { AgentOrchestrator } from '@codex/agent-core'
import type { AgentMessage, AgentStreamChunk, LLMProvider } from '@codex/llm-adapters'
import { ToolRegistry, readTool } from '@codex/tools'

function createMockProvider(responses: AgentStreamChunk[][]): LLMProvider {
  let call = 0
  return {
    id: 'openai',
    async *chat() {
      yield { type: 'done' }
    },
    async *agentChat() {
      const chunks = responses[call] ?? [{ type: 'done' }]
      call++
      for (const chunk of chunks) {
        yield chunk
      }
    },
  }
}

describe('AgentOrchestrator', () => {
  it('executes read tool and completes', async () => {
    const registry = new ToolRegistry([readTool])
    const llm = createMockProvider([
      [
        { type: 'tool_calls', calls: [{ id: 'tc1', name: 'Read', arguments: { path: 'README.md' } }] },
      ],
      [{ type: 'text', delta: 'This is the readme.' }, { type: 'done' }],
    ])
    const orchestrator = new AgentOrchestrator(llm, registry)

    const events: string[] = []
    const tmpDir = process.cwd()

    for await (const event of orchestrator.run([{ role: 'user', content: 'What is in README?' }], {
      workspaceRoot: tmpDir,
      sessionId: 's1',
      modelId: 'gpt-4o',
      apiKey: 'test',
      maxIterations: 5,
      enabledTools: ['Read'],
      yoloMode: true,
      signal: new AbortController().signal,
      resolvePath: (p) => `${tmpDir}/${p}`,
      getRelativePath: (p) => p.replace(`${tmpDir}/`, ''),
    })) {
      events.push(event.type)
    }

    expect(events).toContain('tool_call_start')
    expect(events).toContain('tool_call_result')
    expect(events).toContain('text_delta')
    expect(events).toContain('done')
  })
})
