import type { PresentationThemeId, ThemeTokens } from './presentation-types'

export const PRESENTATION_THEMES: Record<PresentationThemeId, ThemeTokens> = {
  midnight: {
    id: 'midnight',
    label: 'Midnight',
    background: '#0f172a',
    surface: '#111827',
    text: '#f1f5f9',
    muted: '#94a3b8',
    accent: '#38bdf8',
    codeBg: '#020617',
    pptxBackground: '0F172A',
    pptxSurface: '111827',
    pptxText: 'F1F5F9',
    pptxMuted: '94A3B8',
    pptxAccent: '38BDF8',
    pptxCodeBg: '020617',
  },
  paper: {
    id: 'paper',
    label: 'Paper',
    background: '#f8fafc',
    surface: '#ffffff',
    text: '#0f172a',
    muted: '#64748b',
    accent: '#0f766e',
    codeBg: '#f1f5f9',
    pptxBackground: 'F8FAFC',
    pptxSurface: 'FFFFFF',
    pptxText: '0F172A',
    pptxMuted: '64748B',
    pptxAccent: '0F766E',
    pptxCodeBg: 'F1F5F9',
  },
  forest: {
    id: 'forest',
    label: 'Forest',
    background: '#0c1f17',
    surface: '#132a20',
    text: '#ecfdf5',
    muted: '#86efac',
    accent: '#34d399',
    codeBg: '#07140f',
    pptxBackground: '0C1F17',
    pptxSurface: '132A20',
    pptxText: 'ECFDF5',
    pptxMuted: '86EFAC',
    pptxAccent: '34D399',
    pptxCodeBg: '07140F',
  },
  coral: {
    id: 'coral',
    label: 'Coral',
    background: '#fff7ed',
    surface: '#ffffff',
    text: '#1c1917',
    muted: '#78716c',
    accent: '#ea580c',
    codeBg: '#ffedd5',
    pptxBackground: 'FFF7ED',
    pptxSurface: 'FFFFFF',
    pptxText: '1C1917',
    pptxMuted: '78716C',
    pptxAccent: 'EA580C',
    pptxCodeBg: 'FFEDD5',
  },
}

export function resolveTheme(id?: string): ThemeTokens {
  if (id && id in PRESENTATION_THEMES) {
    return PRESENTATION_THEMES[id as PresentationThemeId]
  }
  return PRESENTATION_THEMES.midnight
}
