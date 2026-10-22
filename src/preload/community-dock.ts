import { ipcRenderer } from 'electron'

/**
 * Floating "提意见 / 下一步要改 / 意见与判断" dock on the main window.
 * Self-contained so the upstream preload only needs one import line.
 */
const DOCK_ID = 'pierhouse-community-dock'

interface NextIssue {
  number: number
  title: string
  url: string
  labels: string[]
}

const css = `
#${DOCK_ID}{position:fixed;right:16px;bottom:16px;z-index:2147483000;display:flex;flex-direction:column;align-items:flex-end;gap:8px;font:13px/1.4 -apple-system,BlinkMacSystemFont,"Segoe UI","PingFang SC","Microsoft YaHei",sans-serif}
#${DOCK_ID} .ph-row{display:flex;gap:8px}
#${DOCK_ID} button.ph-btn{border:0;border-radius:999px;padding:8px 14px;cursor:pointer;font:inherit;font-weight:600;box-shadow:0 4px 14px rgba(0,0,0,.18)}
#${DOCK_ID} .ph-primary{background:#4d6bfe;color:#fff}
#${DOCK_ID} .ph-primary:hover{background:#3b58e8}
#${DOCK_ID} .ph-secondary{background:#fff;color:#1f2329;border:1px solid rgba(0,0,0,.08)!important}
#${DOCK_ID} .ph-panel{width:320px;max-height:360px;overflow:auto;background:#fff;color:#1f2329;border-radius:12px;box-shadow:0 12px 36px rgba(0,0,0,.22);padding:12px 14px}
#${DOCK_ID} .ph-panel h4{margin:0 0 8px;font-size:14px;display:flex;justify-content:space-between;align-items:center}
#${DOCK_ID} .ph-panel ul{list-style:none;margin:0;padding:0}
#${DOCK_ID} .ph-panel li{padding:6px 0;border-top:1px solid rgba(0,0,0,.06)}
#${DOCK_ID} .ph-panel a{color:#2f54eb;text-decoration:none;cursor:pointer}
#${DOCK_ID} .ph-muted{color:#8a8f99;font-size:12px}
#${DOCK_ID} .ph-tag{display:inline-block;font-size:11px;padding:0 6px;border-radius:6px;background:#fff1d6;color:#a15c00;margin-left:4px}
@media (prefers-color-scheme: dark){
#${DOCK_ID} .ph-secondary,#${DOCK_ID} .ph-panel{background:#24262b;color:#eceef2;border-color:rgba(255,255,255,.12)!important}
#${DOCK_ID} .ph-panel li{border-top-color:rgba(255,255,255,.08)}
#${DOCK_ID} .ph-panel a{color:#8ea2ff}}
`

function el<K extends keyof HTMLElementTagNameMap>(tag: K, cls?: string, text?: string): HTMLElementTagNameMap[K] {
  const node = document.createElement(tag)
  if (cls) node.className = cls
  if (text !== undefined) node.textContent = text
  return node
}

function mount(): void {
  if (document.getElementById(DOCK_ID) || !document.body) return
  // Only on the Harness UI, not the splash or recovery pages.
  if (!/^https?:$/u.test(location.protocol)) return

  const style = el('style')
  style.textContent = css
  document.head.appendChild(style)

  const dock = el('div')
  dock.id = DOCK_ID
  const panel = el('div', 'ph-panel')
  panel.hidden = true
  const row = el('div', 'ph-row')
  const nextBtn = el('button', 'ph-btn ph-secondary', '🧭 下一步要改')
  const feedbackBtn = el('button', 'ph-btn ph-primary', '💬 提意见')
  nextBtn.title = '维护者计划接下来做的改动'
  feedbackBtn.title = '在浏览器中提交意见（自动附带版本与系统信息）'
  row.append(nextBtn, feedbackBtn)
  dock.append(panel, row)
  document.body.appendChild(dock)

  feedbackBtn.addEventListener('click', () => void ipcRenderer.invoke('community:open-window', 'feedback'))
  nextBtn.addEventListener('click', () => {
    panel.hidden = !panel.hidden
    if (!panel.hidden) void renderNext(panel, false)
  })
}

async function renderNext(panel: HTMLElement, force: boolean): Promise<void> {
  panel.replaceChildren()
  const head = el('h4', undefined, '下一步要改')
  const refresh = el('a', 'ph-muted', '刷新')
  refresh.addEventListener('click', () => void renderNext(panel, true))
  head.appendChild(refresh)
  panel.appendChild(head)
  const status = el('div', 'ph-muted', '正在从 GitHub 读取…')
  panel.appendChild(status)
  try {
    const issues = (await ipcRenderer.invoke('community:next', force)) as NextIssue[]
    status.remove()
    if (!issues.length) panel.appendChild(el('div', 'ph-muted', '暂无带 next 标签的计划。'))
    const list = el('ul')
    for (const issue of issues) {
      const item = el('li')
      const link = el('a', undefined, `#${issue.number} ${issue.title}`)
      link.addEventListener('click', () => void ipcRenderer.invoke('community:open-url', issue.url))
      item.appendChild(link)
      for (const p of issue.labels.filter((l) => /^P[012]$/u.test(l))) item.appendChild(el('span', 'ph-tag', p))
      list.appendChild(item)
    }
    panel.appendChild(list)
  } catch (error) {
    status.textContent = `读取失败：${error instanceof Error ? error.message : String(error)}`
  }
  const more = el('a', undefined, '查看全部意见与判断 →')
  more.style.display = 'block'
  more.style.marginTop = '8px'
  more.addEventListener('click', () => void ipcRenderer.invoke('community:open-window', 'judgments'))
  panel.appendChild(more)
}

export function mountCommunityDock(): void {
  if (document.readyState === 'loading') {
    window.addEventListener('DOMContentLoaded', mount, { once: true })
  } else {
    mount()
  }
}
