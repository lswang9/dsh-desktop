import { describe, expect, it } from 'vitest'
import {
  buildFeedbackUrl,
  deriveJudgment,
  fetchIssuesByLabel,
  isRepoUrl,
  parseIssues
} from '../src/main/community/github-issues'
import { checkLatestRelease, parseLatestRelease } from '../src/main/update/mac-release-check'

const info = { appVersion: '0.9.0', platform: 'macOS', arch: 'arm64', osVersion: '15.1', electron: '43.4.0', locale: 'zh-CN' }

describe('community feedback link', () => {
  it('pre-fills title, body with system info and the feedback label', () => {
    const url = new URL(buildFeedbackUrl({ title: '启动慢', kind: 'bug', description: '冷启动 20 秒' }, info))
    expect(url.origin + url.pathname).toBe('https://github.com/lswang9/dsh-desktop/issues/new')
    expect(url.searchParams.get('labels')).toBe('feedback')
    expect(url.searchParams.get('title')).toBe('[问题] 启动慢')
    const body = url.searchParams.get('body')!
    expect(body).toContain('冷启动 20 秒')
    expect(body).toContain('Pierhouse v0.9.0')
    expect(body).toContain('macOS 15.1 (arm64)')
  })
  it('keeps very long feedback within URL limits', () => {
    const url = buildFeedbackUrl({ title: 'x', kind: 'idea', description: '很长'.repeat(5000) }, info)
    expect(url.length).toBeLessThanOrEqual(7_500)
  })
  it('only opens links inside the repository', () => {
    expect(isRepoUrl('https://github.com/lswang9/dsh-desktop/issues/1')).toBe(true)
    expect(isRepoUrl('https://github.com/lswang9/dsh-desktop-evil/issues/1')).toBe(false)
    expect(isRepoUrl('https://example.com')).toBe(false)
  })
})

describe('judgment derivation', () => {
  it('reads decision and priority from labels and reason from maintainer comment', () => {
    const j = deriveJudgment(['feedback', 'accepted', 'P1'], [
      { author_association: 'NONE', body: '不采纳！', created_at: '2026-10-03' },
      { author_association: 'OWNER', body: '理由：很多人提到', created_at: '2026-10-02', user: { login: 'lswang9' } }
    ])
    expect(j).toMatchObject({ decision: 'accepted', priority: 'P1', reason: '很多人提到', source: 'label', judgedBy: 'lswang9' })
  })
  it('falls back to a maintainer verdict line', () => {
    const j = deriveJudgment(['feedback'], [
      { author_association: 'OWNER', body: '判断：不采纳 P2\n理由：超出范围', created_at: '2026-10-02' }
    ])
    expect(j).toMatchObject({ decision: 'rejected', priority: 'P2', reason: '超出范围', source: 'comment' })
  })
  it('is pending without labels or maintainer comments', () => {
    expect(deriveJudgment(['feedback'], [{ author_association: 'NONE', body: '采纳吧' }]).decision).toBe('pending')
  })
})

describe('anonymous issue reads', () => {
  it('drops pull requests and normalises labels', async () => {
    const fake = (async (url: string) => {
      expect(url).toContain('labels=next')
      return new Response(JSON.stringify([
        { number: 1, title: 'a', html_url: 'https://github.com/lswang9/dsh-desktop/issues/1', labels: [{ name: 'next' }, { name: 'P0' }], state: 'open' },
        { number: 2, title: 'pr', pull_request: {} }
      ]))
    }) as unknown as typeof fetch
    const issues = await fetchIssuesByLabel('next', 'open', fake)
    expect(issues).toHaveLength(1)
    expect(issues[0]?.labels).toEqual(['next', 'P0'])
    expect(parseIssues(null)).toEqual([])
  })
})

describe('mac release check', () => {
  it('offers only newer stable releases', async () => {
    const fake = (async () => new Response(JSON.stringify({ tag_name: 'v0.9.1', html_url: 'https://github.com/lswang9/dsh-desktop/releases/tag/v0.9.1' }))) as unknown as typeof fetch
    expect(await checkLatestRelease('0.9.0', fake)).toEqual({ version: '0.9.1', url: 'https://github.com/lswang9/dsh-desktop/releases/tag/v0.9.1' })
    expect(await checkLatestRelease('0.9.1', fake)).toBeUndefined()
    expect(parseLatestRelease({ tag_name: 'v1.0.0', prerelease: true })).toBeUndefined()
  })
})
