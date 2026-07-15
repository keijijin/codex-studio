import type { AgentStreamChunk, LLMProvider } from '@codex/llm-adapters'

export const E2E_AGENT_OUTPUT_FILE = 'e2e-agent-output.txt'
export const E2E_AGENT_OUTPUT_CONTENT = 'hello from agent e2e'

export function createE2eMockAgentProvider(): LLMProvider {
  let call = 0
  return {
    id: 'openai',
    async *chat() {
      yield { type: 'done' }
    },
    async *agentChat() {
      if (call === 0) {
        call++
        const chunk: AgentStreamChunk = {
          type: 'tool_calls',
          calls: [{
            id: 'e2e-write-1',
            name: 'Write',
            arguments: {
              path: E2E_AGENT_OUTPUT_FILE,
              content: E2E_AGENT_OUTPUT_CONTENT,
            },
          }],
        }
        yield chunk
        return
      }

      call++
      yield { type: 'text', delta: 'E2E agent task complete.' }
    },
  }
}
