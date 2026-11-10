import { join } from 'path'
import { simpleGit, type SimpleGit } from 'simple-git'
import type { GitChange, GitCommitResult, GitStatusSnapshot } from '@codex/shared'
import { workspaceService } from './workspace'

const DANGEROUS_REF = /^(--force|-f|--hard|--no-verify)$/i

function gitFor(cwd: string): SimpleGit {
  return simpleGit({ baseDir: cwd, binary: 'git', maxConcurrentProcesses: 1 })
}

function parsePorcelain(root: string, lines: string[]): GitChange[] {
  const changes: GitChange[] = []
  for (const line of lines) {
    if (!line || line.length < 4) continue
    const index = line[0] ?? ' '
    const workingTree = line[1] ?? ' '
    let pathPart = line.slice(3)
    // rename: "R  old -> new"
    if (pathPart.includes(' -> ')) {
      pathPart = pathPart.split(' -> ').pop() ?? pathPart
    }
    const rel = pathPart.replace(/\\/g, '/').replace(/^"|"$/g, '')
    if (!rel) continue
    const staged = index !== ' ' && index !== '?'
    const unstaged = workingTree !== ' ' || index === '?'
    changes.push({
      path: rel,
      absolutePath: join(root, rel),
      index,
      workingTree: index === '?' ? '?' : workingTree,
      staged,
      unstaged,
    })
  }
  return changes.sort((a, b) => a.path.localeCompare(b.path))
}

export class GitService {
  async status(): Promise<GitStatusSnapshot> {
    const workspaceRoot = workspaceService.getRoot()
    if (!workspaceRoot) {
      return {
        root: null,
        branch: null,
        ahead: 0,
        behind: 0,
        isRepo: false,
        changes: [],
        error: 'ワークスペースが開かれていません',
      }
    }

    try {
      const git = gitFor(workspaceRoot)
      const isRepo = await git.checkIsRepo()
      if (!isRepo) {
        return {
          root: null,
          branch: null,
          ahead: 0,
          behind: 0,
          isRepo: false,
          changes: [],
          error: 'Git リポジトリではありません',
        }
      }

      const root = (await git.revparse(['--show-toplevel'])).trim()
      const st = await git.status()
      const porcelain = await git.raw(['status', '--porcelain', '-uall'])
      const lines = porcelain.split('\n').map((l) => l.replace(/\r$/, '')).filter(Boolean)
      const changes = parsePorcelain(root, lines)

      return {
        root,
        branch: st.current ?? st.tracking ?? null,
        ahead: st.ahead ?? 0,
        behind: st.behind ?? 0,
        isRepo: true,
        changes,
      }
    } catch (err) {
      return {
        root: null,
        branch: null,
        ahead: 0,
        behind: 0,
        isRepo: false,
        changes: [],
        error: err instanceof Error ? err.message : 'git status failed',
      }
    }
  }

  async stage(paths: string[]): Promise<void> {
    const root = await this.requireRepoRoot()
    const git = gitFor(root)
    const rels = paths.map((p) => this.toRel(root, p))
    await git.add(rels)
  }

  async unstage(paths: string[]): Promise<void> {
    const root = await this.requireRepoRoot()
    const git = gitFor(root)
    const rels = paths.map((p) => this.toRel(root, p))
    await git.reset(['HEAD', '--', ...rels])
  }

  async commit(message: string): Promise<GitCommitResult> {
    const msg = message.trim()
    if (!msg) {
      return { success: false, message: 'コミットメッセージが空です' }
    }
    try {
      const root = await this.requireRepoRoot()
      const git = gitFor(root)
      const result = await git.commit(msg)
      return {
        success: true,
        message: 'コミットしました',
        commit: result.commit,
      }
    } catch (err) {
      return {
        success: false,
        message: err instanceof Error ? err.message : 'commit failed',
      }
    }
  }

  async checkout(branch: string): Promise<{ success: boolean; message: string }> {
    const name = branch.trim()
    if (!name || DANGEROUS_REF.test(name) || name.startsWith('-')) {
      return { success: false, message: '不正なブランチ名です' }
    }
    try {
      const root = await this.requireRepoRoot()
      await gitFor(root).checkout(name)
      return { success: true, message: `checked out ${name}` }
    } catch (err) {
      return {
        success: false,
        message: err instanceof Error ? err.message : 'checkout failed',
      }
    }
  }

  async listBranches(): Promise<string[]> {
    const root = await this.requireRepoRoot()
    const summary = await gitFor(root).branchLocal()
    return summary.all
  }

  private async requireRepoRoot(): Promise<string> {
    const snap = await this.status()
    if (!snap.isRepo || !snap.root) {
      throw new Error(snap.error ?? 'Not a git repository')
    }
    return snap.root
  }

  private toRel(root: string, pathOrRel: string): string {
    const abs = pathOrRel.startsWith('/') || /^[A-Za-z]:/.test(pathOrRel)
      ? pathOrRel
      : join(root, pathOrRel)
    return abs.startsWith(root) ? abs.slice(root.length).replace(/^[/\\]/, '') : pathOrRel
  }
}

export const gitService = new GitService()
