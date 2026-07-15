import { describe, expect, it } from 'vitest'
import { join } from 'path'
import { AgentOrchestrator } from '@codex/agent-core'
import type { AgentStreamChunk, LLMProvider } from '@codex/llm-adapters'
import { ToolRegistry, readTool, grepTool, globTool, writeTool, strReplaceTool, deleteTool, shellTool } from '@codex/tools'
import { AGENT_BENCHMARK_CASES } from '../benchmarks/agent-cases'

function buildProviderForCase(
  mockResponses: (typeof AGENT_BENCHMARK_CASES)[number]['mockResponses'],
): LLMProvider {
  const turns: AgentStreamChunk[][] = []
  let current: AgentStreamChunk[] = []

  for (const step of mockResponses) {
    if (step.type === 'tool') {
      current.push({
        type: 'tool_calls',
        calls: [{ id: `tc-${turns.length}-${current.length}`, name: step.tool, arguments: step.args }],
      })
      turns.push(current)
      current = []
    } else {
      current.push({ type: 'text', delta: step.content }, { type: 'done' })
      turns.push(current)
      current = []
    }
  }
  if (current.length > 0) {
    turns.push(current)
  }

  let call = 0
  return {
    id: 'openai',
    async *chat() {
      yield { type: 'done' }
    },
    async *agentChat() {
      const chunks = turns[call] ?? [{ type: 'done' }]
      call++
      for (const chunk of chunks) {
        yield chunk
      }
    },
  }
}

describe('Agent benchmark (20 cases, mock LLM)', () => {
  const workspaceRoot = join(process.cwd(), 'e2e/fixtures/sample-workspace')
  const registry = new ToolRegistry([
    readTool, grepTool, globTool, writeTool, strReplaceTool, deleteTool, shellTool,
  ])

  for (const benchmark of AGENT_BENCHMARK_CASES) {
    it(`${benchmark.id}: ${benchmark.prompt}`, async () => {
      const llm = buildProviderForCase(benchmark.mockResponses)
      const orchestrator = new AgentOrchestrator(llm, registry)

      const events: string[] = []
      const toolsUsed: string[] = []

      for await (const event of orchestrator.run(
        [{ role: 'user', content: benchmark.prompt }],
        {
          workspaceRoot,
          sessionId: `bench-${benchmark.id}`,
          modelId: 'gpt-4o',
          apiKey: 'test',
          maxIterations: 8,
          enabledTools: ['Read', 'Grep', 'Glob', 'Write', 'StrReplace', 'Delete', 'Shell'],
          yoloMode: true,
          signal: new AbortController().signal,
          resolvePath: (p) => join(workspaceRoot, p),
          getRelativePath: (p) => p.replace(`${workspaceRoot}/`, '').replace(`${workspaceRoot}\\`, ''),
        },
      )) {
        events.push(event.type)
        if (event.type === 'tool_call_start') {
          toolsUsed.push(event.tool)
        }
      }

      for (const expected of benchmark.expectedEvents) {
        expect(events).toContain(expected)
      }
      for (const tool of benchmark.expectedTools) {
        expect(toolsUsed).toContain(tool)
      }
    })
  }
})
