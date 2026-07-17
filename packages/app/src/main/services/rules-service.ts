import { mkdir, writeFile, unlink, access } from 'fs/promises'
import { basename, dirname, join } from 'path'
import { app } from 'electron'
import {
  collectRules,
  loadRules,
  loadProjectContext,
  loadMemory,
  serializeRuleFile,
  type LoadRulesOptions,
} from '@codex/agent-core'
import type { RuleFile, RuleSaveParams } from '@codex/shared'
import { workspaceService } from './workspace'

function globalRulesDir(): string {
  return join(app.getPath('home'), '.codex-studio', 'rules')
}

function assertSafeRuleName(name: string): string {
  const base = basename(name.trim())
  if (!base || base !== name.trim() || base.includes('..')) {
    throw new Error('Invalid rule name')
  }
  if (!base.endsWith('.md') && !base.endsWith('.mdc')) {
    return `${base}.md`
  }
  return base
}

export class RulesService {
  getGlobalRulesDir(): string {
    return globalRulesDir()
  }

  async list(): Promise<RuleFile[]> {
    const root = workspaceService.getRoot()
    return collectRules(root, { globalRulesDir: globalRulesDir() })
  }

  async buildPrompt(contextPaths: string[] = []): Promise<string> {
    const root = workspaceService.getRoot()
    const [rules, project, memory] = await Promise.all([
      loadRules(root, { globalRulesDir: globalRulesDir(), contextPaths }),
      root ? loadProjectContext(root) : Promise.resolve(''),
      root ? loadMemory(root) : Promise.resolve(''),
    ])
    return `${rules}${project}${memory}`
  }

  async loadOptions(contextPaths?: string[]): Promise<LoadRulesOptions> {
    return {
      globalRulesDir: globalRulesDir(),
      contextPaths,
    }
  }

  async save(params: RuleSaveParams): Promise<RuleFile> {
    const fileName = assertSafeRuleName(params.name)
    const meta = {
      alwaysApply: params.alwaysApply,
      globs: params.globs.map((g) => g.trim()).filter(Boolean),
      description: params.description?.trim() || undefined,
    }
    const raw = serializeRuleFile(meta, params.content)

    let absolutePath = params.absolutePath
    if (absolutePath) {
      // ensure we only write editable locations
      const allowedPrefixes = [globalRulesDir()]
      const root = workspaceService.getRoot()
      if (root) {
        allowedPrefixes.push(join(root, '.codex', 'rules'), join(root, '.cursor', 'rules'))
      }
      if (!allowedPrefixes.some((p) => absolutePath!.startsWith(p))) {
        throw new Error('Cannot edit rule outside rules directories')
      }
    } else if (params.scope === 'global') {
      absolutePath = join(globalRulesDir(), fileName)
    } else {
      const root = workspaceService.getRoot()
      if (!root) throw new Error('Open a workspace to save project rules')
      absolutePath = join(root, '.codex', 'rules', fileName)
    }

    await mkdir(dirname(absolutePath), { recursive: true })
    await writeFile(absolutePath, raw, 'utf-8')

    const rules = await this.list()
    const saved = rules.find((r) => r.absolutePath === absolutePath)
    if (!saved) {
      throw new Error('Rule saved but could not be reloaded')
    }
    return saved
  }

  async remove(absolutePath: string): Promise<void> {
    const rules = await this.list()
    const target = rules.find((r) => r.absolutePath === absolutePath)
    if (!target) throw new Error('Rule not found')
    if (!target.editable) throw new Error('Rule is not editable')
    await unlink(absolutePath)
  }

  async ensureGlobalDir(): Promise<string> {
    const dir = globalRulesDir()
    await mkdir(dir, { recursive: true })
    return dir
  }

  async exists(path: string): Promise<boolean> {
    try {
      await access(path)
      return true
    } catch {
      return false
    }
  }
}

export const rulesService = new RulesService()
