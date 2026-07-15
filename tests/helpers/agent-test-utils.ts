import type { AgentRunContext } from '@codex/agent-core'
import type { AgentStreamChunk, LLMProvider } from '@codex/llm-adapters'

export function createMockProvider(responses: AgentStreamChunk[][]): LLMProvider {
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

export function createAgentRunContext(
  workspaceRoot: string,
  overrides: Partial<AgentRunContext> = {},
): AgentRunContext {
  return {
    workspaceRoot,
    sessionId: 'test-session',
    modelId: 'gpt-4o',
    apiKey: 'test-key',
    maxIterations: 5,
    enabledTools: ['Read', 'Write', 'StrReplace', 'Shell'],
    yoloMode: true,
    signal: new AbortController().signal,
    resolvePath: (p) => `${workspaceRoot}/${p.replace(/^\//, '')}`,
    getRelativePath: (p) => p.replace(`${workspaceRoot}/`, ''),
    ...overrides,
  }
}

export async function collectOrchestratorEvents(
  generator: AsyncGenerator<{ type: string; [key: string]: unknown }>,
): Promise<Array<{ type: string; [key: string]: unknown }>> {
  const events: Array<{ type: string; [key: string]: unknown }> = []
  for await (const event of generator) {
    events.push(event)
  }
  return events
}
