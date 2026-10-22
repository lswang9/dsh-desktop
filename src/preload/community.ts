import { contextBridge, ipcRenderer } from 'electron'

/** Bridge for build/community.html. Read-only GitHub data plus "open in browser". */
contextBridge.exposeInMainWorld('pierhouseCommunity', {
  systemInfo: () => ipcRenderer.invoke('community:system-info'),
  next: (force = false) => ipcRenderer.invoke('community:next', force),
  feedback: (force = false) => ipcRenderer.invoke('community:feedback', force),
  submitFeedback: (input: unknown) => ipcRenderer.invoke('community:submit-feedback', input),
  openUrl: (url: string) => ipcRenderer.invoke('community:open-url', url),
  repoUrl: () => ipcRenderer.invoke('community:repo-url'),
  onSelectTab: (listener: (tab: string) => void) => {
    ipcRenderer.on('community:select-tab', (_event, tab: string) => listener(tab))
  }
})
