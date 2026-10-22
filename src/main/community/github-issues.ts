/**
 * Pierhouse community module: anonymous, read-only access to the public GitHub
 * issue tracker plus helpers that build pre-filled "new issue" links. No token
 * is ever stored or sent; everything here is plain public REST.
 *
 * Kept free of Electron imports so it can be unit-tested and merged upstream
 * without touching the rest of the app.
 */
export const COMMUNITY_OWNER = 'lswang9'
export const COMMUNITY_REPO = 'dsh-desktop'
export const REPO_URL = `https://github.com/${COMMUNITY_OWNER}/${COMMUNITY_REPO}`
export const API_BASE = `https://api.github.com/repos/${COMMUNITY_OWNER}/${COMMUNITY_REPO}`
export const MAINTAINER_ASSOCIATIONS = ['OWNER', 'MEMBER', 'COLLABORATOR']
const MAX_ISSUE_URL_LENGTH = 7_500

export type Decision = 'accepted' | 'rejected' | 'pending'
export type Priority = 'P0' | 'P1' | 'P2'

export interface IssueSummary {
  number: number
  title: string
  url: string
  state: 'open' | 'closed'
  labels: string[]
  comments: number
  createdAt: string
  updatedAt: string
  author: string
}

export interface Judgment {
  decision: Decision
  priority?: Priority
  reason?: string
  /** Where the decision came from, for display. */
  source: 'label' | 'comment' | 'none'
  judgedBy?: string
}

export interface FeedbackItem extends IssueSummary {
  judgment: Judgment
}

export interface RawComment {
  body?: string | null
  author_association?: string
  user?: { login?: string } | null
  created_at?: string
}

export function parseIssues(raw: unknown): IssueSummary[] {
  if (!Array.isArray(raw)) return []
  const out: IssueSummary[] = []
  for (const entry of raw) {
    if (typeof entry !== 'object' || entry === null) continue
    const r = entry as Record<string, any>
    if (r.pull_request) continue
    if (typeof r.number !== 'number' || typeof r.title !== 'string') continue
    out.push({
      number: r.number,
      title: r.title,
      url: typeof r.html_url === 'string' ? r.html_url : `${REPO_URL}/issues/${r.number}`,
      state: r.state === 'closed' ? 'closed' : 'open',
      labels: Array.isArray(r.labels)
        ? r.labels
            .map((l: any) => (typeof l === 'string' ? l : l?.name))
            .filter((l: unknown): l is string => typeof l === 'string')
        : [],
      comments: typeof r.comments === 'number' ? r.comments : 0,
      createdAt: String(r.created_at ?? ''),
      updatedAt: String(r.updated_at ?? ''),
      author: String(r.user?.login ?? '')
    })
  }
  return out
}

const PRIORITIES: Priority[] = ['P0', 'P1', 'P2']

function priorityFrom(text: string): Priority | undefined {
  const match = /\bP([012])\b/iu.exec(text)
  return match ? (`P${match[1]}` as Priority) : undefined
}

function decisionFrom(text: string): Decision | undefined {
  if (/(不采纳|拒绝|不做|\brejected?\b|won'?t\s*fix)/iu.test(text)) return 'rejected'
  if (/(采纳|接受|会做|\baccepted?\b)/iu.test(text)) return 'accepted'
  return undefined
}

/** Pull "理由：..." / "Reason: ..." out of a maintainer comment, else the whole comment. */
export function reasonFrom(body: string): string {
  const match = /^(?:\s*[-*]?\s*)(?:理由|原因|reason)\s*[:：]\s*(.+)$/imu.exec(body)
  const text = (match?.[1] ?? body).replace(/\r/g, '').trim()
  return text.length > 400 ? `${text.slice(0, 400)}…` : text
}

/**
 * Judgment = labels first (accepted/rejected, P0–P2), then the most recent
 * maintainer comment fills in anything the labels do not say plus the reason.
 * A maintainer comment can carry a line like "判断：采纳 P1" and "理由：...".
 */
export function deriveJudgment(labels: string[], comments: RawComment[] = []): Judgment {
  const lower = labels.map((l) => l.toLowerCase())
  let decision: Decision | undefined = lower.includes('rejected')
    ? 'rejected'
    : lower.includes('accepted')
      ? 'accepted'
      : undefined
  let priority = PRIORITIES.find((p) => labels.includes(p))
  let source: Judgment['source'] = decision || priority ? 'label' : 'none'

  const maintainer = [...comments]
    .filter((c) => MAINTAINER_ASSOCIATIONS.includes(String(c.author_association ?? '')))
    .filter((c) => typeof c.body === 'string' && c.body.trim())
    .sort((a, b) => String(b.created_at ?? '').localeCompare(String(a.created_at ?? '')))[0]

  let reason: string | undefined
  let judgedBy: string | undefined
  if (maintainer?.body) {
    const body = maintainer.body
    const verdictLine = /^(?:\s*[-*]?\s*)(?:判断|结论|decision)\s*[:：]\s*(.+)$/imu.exec(body)?.[1] ?? ''
    if (!decision) {
      decision = decisionFrom(verdictLine) ?? decisionFrom(body.slice(0, 80))
      if (decision) source = 'comment'
    }
    if (!priority) priority = priorityFrom(verdictLine || body.slice(0, 80))
    reason = reasonFrom(body)
    judgedBy = maintainer.user?.login
    if (source === 'none') source = 'comment'
  }

  return { decision: decision ?? 'pending', priority, reason, source, judgedBy }
}

export interface SystemInfo {
  appVersion: string
  platform: string
  arch: string
  osVersion: string
  electron: string
  locale: string
}

export interface FeedbackInput {
  title: string
  kind: 'bug' | 'idea' | 'other'
  description: string
}

const KIND_LABEL: Record<FeedbackInput['kind'], string> = {
  bug: '问题',
  idea: '建议',
  other: '其他'
}

export function feedbackBody(input: FeedbackInput, info: SystemInfo): string {
  return [
    `**类型**：${KIND_LABEL[input.kind] ?? '其他'}`,
    '',
    '**描述**',
    '',
    input.description.trim() || '（未填写）',
    '',
    '---',
    '<!-- 以下信息由泊屋自动附带 -->',
    `- 版本：Pierhouse v${info.appVersion}`,
    `- 系统：${info.platform} ${info.osVersion} (${info.arch})`,
    `- Electron：${info.electron}`,
    `- 语言：${info.locale}`
  ].join('\n')
}

/** Pre-filled issues/new link with the feedback label. Long bodies are trimmed to stay within URL limits. */
export function buildFeedbackUrl(input: FeedbackInput, info: SystemInfo): string {
  const kindPrefix = input.kind === 'bug' ? '[问题] ' : input.kind === 'idea' ? '[建议] ' : ''
  const title = `${kindPrefix}${input.title.trim() || '意见反馈'}`
  const make = (description: string): string => {
    const params = new URLSearchParams({
      labels: 'feedback',
      title,
      body: feedbackBody({ ...input, description }, info)
    })
    return `${REPO_URL}/issues/new?${params.toString()}`
  }
  let description = input.description
  let url = make(description)
  while (url.length > MAX_ISSUE_URL_LENGTH && description.length > 0) {
    description = description.slice(0, Math.floor(description.length * 0.8))
    url = make(`${description}\n\n（内容过长已截断，请在此补充）`)
  }
  return url
}

/** Only links into this repository may be opened from community UI. */
export function isRepoUrl(url: unknown): url is string {
  return typeof url === 'string' && (url === REPO_URL || url.startsWith(`${REPO_URL}/`))
}

type FetchLike = typeof fetch

async function getJson(url: string, fetchImpl: FetchLike): Promise<unknown> {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), 10_000)
  try {
    const response = await fetchImpl(url, {
      signal: controller.signal,
      headers: { Accept: 'application/vnd.github+json', 'User-Agent': 'Pierhouse-Community' }
    })
    if (!response.ok) {
      const limited = response.status === 403 || response.status === 429
      throw new Error(
        limited ? 'GitHub 匿名访问次数已达上限，请稍后再试' : `GitHub 请求失败：${response.status}`
      )
    }
    return await response.json()
  } finally {
    clearTimeout(timer)
  }
}

export async function fetchIssuesByLabel(
  label: string,
  state: 'open' | 'all',
  fetchImpl: FetchLike = globalThis.fetch
): Promise<IssueSummary[]> {
  const params = new URLSearchParams({ labels: label, state, per_page: '100', sort: 'updated' })
  return parseIssues(await getJson(`${API_BASE}/issues?${params}`, fetchImpl))
}

export async function fetchFeedbackWithJudgments(
  fetchImpl: FetchLike = globalThis.fetch,
  maxCommentFetches = 30
): Promise<FeedbackItem[]> {
  const issues = await fetchIssuesByLabel('feedback', 'all', fetchImpl)
  let budget = maxCommentFetches
  return Promise.all(
    issues.map(async (issue) => {
      let comments: RawComment[] = []
      if (issue.comments > 0 && budget > 0) {
        budget -= 1
        try {
          const raw = await getJson(`${API_BASE}/issues/${issue.number}/comments?per_page=100`, fetchImpl)
          if (Array.isArray(raw)) comments = raw as RawComment[]
        } catch {
          // Labels still give a judgment when comments cannot be read.
        }
      }
      return { ...issue, judgment: deriveJudgment(issue.labels, comments) }
    })
  )
}
