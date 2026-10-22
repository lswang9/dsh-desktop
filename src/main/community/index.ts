import { app, BrowserWindow, ipcMain, shell } from 'electron'
import { release } from 'node:os'
import { join } from 'node:path'
import {
  buildFeedbackUrl,
  fetchFeedbackWithJudgments,
  fetchIssuesByLabel,
  isRepoUrl,
  REPO_URL,
  type FeedbackInput,
  type FeedbackItem,
  type IssueSummary,
  type SystemInfo
} from './github-issues'

export type CommunityTab = 'feedback' | 'next' | 'judgments'
const CACHE_MS = 5 * 60 * 1_000

let communityWindow: BrowserWindow | undefined
let registered = false
const cache = new Map<string, { at: number; value: unknown }>()

async function cached<T>(key: string, force: boolean, load: () => Promise<T>): Promise<T> {
  const hit = cache.get(key)
  if (!force && hit && Date.now() - hit.at < CACHE_MS) return hit.value as T
  const value = await load()
  cache.set(key, { at: Date.now(), value })
  return value
}

export function systemInfo(): SystemInfo {
  return {
    appVersion: app.getVersion(),
    platform: process.platform === 'darwin' ? 'macOS' : process.platform === 'win32' ? 'Windows' : process.platform,
    arch: process.arch,
    osVersion: typeof process.getSystemVersion === 'function' ? process.getSystemVersion() : release(),
    electron: process.versions.electron ?? '',
    locale: app.getLocale()
  }
}

function isFeedbackInput(value: unknown): value is FeedbackInput {
  if (typeof value !== 'object' || value === null) return false
  const v = value as Record<string, unknown>
  return (
    typeof v.title === 'string' &&
    typeof v.description === 'string' &&
    (v.kind === 'bug' || v.kind === 'idea' || v.kind === 'other')
  )
}

function communityPagePath(): string {
  return app.isPackaged
    ? join(process.resourcesPath, 'community.html')
    : join(app.getAppPath(), 'build', 'community.html')
}

export function openCommunityWindow(tab: CommunityTab = 'judgments'): void {
  if (communityWindow && !communityWindow.isDestroyed()) {
    communityWindow.webContents.send('community:select-tab', tab)
    communityWindow.show()
    communityWindow.focus()
    return
  }
  const window = new BrowserWindow({
    width: 980,
    height: 720,
    minWidth: 640,
    minHeight: 480,
    title: '意见与判断 · 泊屋',
    autoHideMenuBar: true,
    webPreferences: {
      preload: join(import.meta.dirname, '../preload/community.cjs'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false
    }
  })
  window.setMenuBarVisibility(false)
  window.webContents.setWindowOpenHandler(({ url }) => {
    if (isRepoUrl(url)) void shell.openExternal(url)
    return { action: 'deny' }
  })
  window.webContents.on('will-navigate', (event) => event.preventDefault())
  window.on('closed', () => {
    communityWindow = undefined
  })
  communityWindow = window
  void window.loadFile(communityPagePath(), { query: { tab } })
}

export function registerCommunityHandlers(): void {
  if (registered) return
  registered = true
  ipcMain.handle('community:system-info', () => systemInfo())
  ipcMain.handle('community:next', (_event, force: unknown) =>
    cached<IssueSummary[]>('next', force === true, () => fetchIssuesByLabel('next', 'open'))
  )
  ipcMain.handle('community:feedback', (_event, force: unknown) =>
    cached<FeedbackItem[]>('feedback', force === true, () => fetchFeedbackWithJudgments())
  )
  ipcMain.handle('community:submit-feedback', async (_event, input: unknown) => {
    if (!isFeedbackInput(input)) throw new Error('invalid feedback')
    const url = buildFeedbackUrl(input, systemInfo())
    await shell.openExternal(url)
    return url
  })
  ipcMain.handle('community:open-url', async (_event, url: unknown) => {
    if (!isRepoUrl(url)) return false
    await shell.openExternal(url)
    return true
  })
  ipcMain.handle('community:open-window', (_event, tab: unknown) => {
    openCommunityWindow(tab === 'feedback' || tab === 'next' ? tab : 'judgments')
  })
  ipcMain.handle('community:repo-url', () => REPO_URL)
}
