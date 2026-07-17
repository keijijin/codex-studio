import type { Tool, ToolResult } from '../types'

export interface WebSearchHit {
  title: string
  url: string
  snippet: string
}

function stripTags(html: string): string {
  return html
    .replace(/<script[\s\S]*?<\/script>/gi, '')
    .replace(/<style[\s\S]*?<\/style>/gi, '')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/\s+/g, ' ')
    .trim()
}

/** Parse DuckDuckGo HTML results (best-effort, no API key). */
export function parseDuckDuckGoHtml(html: string, limit = 5): WebSearchHit[] {
  const hits: WebSearchHit[] = []
  const blockRe =
    /<a[^>]+class="[^"]*result__a[^"]*"[^>]*href="([^"]+)"[^>]*>([\s\S]*?)<\/a>([\s\S]*?)(?=<a[^>]+class="[^"]*result__a|<\/div>\s*<\/div>\s*<\/div>|$)/gi

  let match: RegExpExecArray | null
  while ((match = blockRe.exec(html)) !== null && hits.length < limit) {
    const url = match[1]
    const title = stripTags(match[2])
    const snippetMatch = match[3].match(/class="[^"]*result__snippet[^"]*"[^>]*>([\s\S]*?)<\/(?:a|td|div)/i)
    const snippet = snippetMatch ? stripTags(snippetMatch[1]) : stripTags(match[3]).slice(0, 240)
    if (title && url && url.startsWith('http')) {
      hits.push({ title, url, snippet })
    }
  }

  if (hits.length === 0) {
    // Fallback: any result links
    const loose = [...html.matchAll(/<a[^>]+href="(https?:\/\/[^"]+)"[^>]*>([\s\S]*?)<\/a>/gi)]
    for (const m of loose) {
      if (hits.length >= limit) break
      const url = m[1]
      const title = stripTags(m[2])
      if (!title || title.length < 3) continue
      if (/duckduckgo\.com|javascript:/i.test(url)) continue
      hits.push({ title: title.slice(0, 120), url, snippet: '' })
    }
  }

  return hits
}

function formatHits(query: string, hits: WebSearchHit[]): string {
  if (hits.length === 0) {
    return `No web results for: ${query}`
  }
  const lines = hits.map(
    (h, i) => `${i + 1}. ${h.title}\n   ${h.url}${h.snippet ? `\n   ${h.snippet}` : ''}`,
  )
  return `Web search results for "${query}":\n\n${lines.join('\n\n')}`
}

export const webSearchTool: Tool = {
  name: 'WebSearch',
  description:
    'Search the public web for up-to-date information (docs, errors, APIs). Prefer codebase tools first for project-specific questions.',
  requiresApproval: false,
  parameters: {
    type: 'object',
    properties: {
      query: { type: 'string', description: 'Search query' },
      limit: { type: 'integer', description: 'Max results (1–8, default 5)' },
    },
    required: ['query'],
  },
  async execute(ctx, args): Promise<ToolResult> {
    const query = String(args.query ?? '').trim()
    if (!query) return { success: false, output: 'Error: query is required' }
    const limit = Math.min(8, Math.max(1, Number(args.limit) || 5))

    if (ctx.executeMode === 'preview') {
      return { success: true, output: `Would search the web for: ${query}` }
    }
    if (ctx.signal.aborted) {
      return { success: false, output: 'Error: cancelled' }
    }

    try {
      const url = `https://html.duckduckgo.com/html/?q=${encodeURIComponent(query)}`
      const res = await fetch(url, {
        signal: ctx.signal,
        headers: {
          'User-Agent': 'CodexStudio/0.1 (WebSearch; +https://github.com/keijijin/codex-studio)',
          Accept: 'text/html',
        },
      })
      if (!res.ok) {
        return { success: false, output: `Error: web search HTTP ${res.status}` }
      }
      const html = await res.text()
      const hits = parseDuckDuckGoHtml(html, limit)
      return {
        success: true,
        output: formatHits(query, hits),
        metadata: { query, count: hits.length },
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Web search failed'
      return { success: false, output: `Error: ${message}` }
    }
  },
}
