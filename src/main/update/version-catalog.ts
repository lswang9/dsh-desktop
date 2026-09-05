import type { AvailableRelease } from '../../shared/contracts'

export type { AvailableRelease }

/** GitHub repo that hosts Pierhouse installers and update metadata. */
export const UPDATE_GITHUB_OWNER = 'lswang9'
export const UPDATE_GITHUB_REPO = 'dsh-desktop'

export const GITHUB_UPDATE_FEED = {
  provider: 'github' as const,
  owner: UPDATE_GITHUB_OWNER,
  repo: UPDATE_GITHUB_REPO
}

/** @deprecated Prefer GITHUB_UPDATE_FEED; kept for tests that assert the stable channel. */
export const STABLE_FEED_URL = `https://github.com/${UPDATE_GITHUB_OWNER}/${UPDATE_GITHUB_REPO}/releases/latest/download/`

const RELEASES_API_URL = `https://api.github.com/repos/${UPDATE_GITHUB_OWNER}/${UPDATE_GITHUB_REPO}/releases`
const INDEX_TIMEOUT_MS = 8_000

/** Per-release asset base used by electron-updater's generic provider for one-shot downgrades. */
export function archiveFeedUrl(version: string): string {
  const normalized = version.trim().replace(/^v/iu, '')
  return `https://github.com/${UPDATE_GITHUB_OWNER}/${UPDATE_GITHUB_REPO}/releases/download/v${normalized}/`
}

export function releaseTag(version: string): string {
  const normalized = version.trim().replace(/^v/iu, '')
  return `v${normalized}`
}

/** Split "1.2.3-rc.1" into ([1,2,3], "rc.1"). Non-numeric segments read as 0. */
function splitVersion(value: string): { nums: number[]; pre: string } {
  const [core = '', ...preParts] = value.trim().split('-')
  const nums = core.split('.').map((part) => {
    const parsed = Number.parseInt(part, 10)
    return Number.isFinite(parsed) ? parsed : 0
  })
  while (nums.length < 3) nums.push(0)
  return { nums, pre: preParts.join('-') }
}

export function compareVersions(a: string, b: string): -1 | 0 | 1 {
  const left = splitVersion(a)
  const right = splitVersion(b)
  for (let i = 0; i < Math.max(left.nums.length, right.nums.length); i += 1) {
    const diff = (left.nums[i] ?? 0) - (right.nums[i] ?? 0)
    if (diff !== 0) return diff < 0 ? -1 : 1
  }
  if (left.pre === right.pre) return 0
  if (!left.pre) return 1 // release > prerelease
  if (!right.pre) return -1
  return left.pre < right.pre ? -1 : 1
}

function isRelease(value: unknown): value is AvailableRelease {
  if (typeof value !== 'object' || value === null) return false
  const record = value as Record<string, unknown>
  return (
    typeof record.version === 'string' &&
    record.version.length > 0 &&
    typeof record.tag === 'string' &&
    record.tag.length > 0 &&
    typeof record.archiveUrl === 'string' &&
    record.archiveUrl.length > 0
  )
}

export function parseVersionIndex(raw: unknown): AvailableRelease[] {
  if (typeof raw === 'object' && raw !== null && Array.isArray((raw as { versions?: unknown }).versions)) {
    return ((raw as { versions: unknown[] }).versions).filter(isRelease)
  }
  if (!Array.isArray(raw)) return []
  const releases: AvailableRelease[] = []
  for (const entry of raw) {
    if (typeof entry !== 'object' || entry === null) continue
    const record = entry as {
      draft?: unknown
      prerelease?: unknown
      tag_name?: unknown
    }
    if (record.draft === true || record.prerelease === true) continue
    if (typeof record.tag_name !== 'string' || !record.tag_name.startsWith('v')) continue
    const version = record.tag_name.slice(1)
    if (!version) continue
    releases.push({
      version,
      tag: record.tag_name,
      archiveUrl: archiveFeedUrl(version)
    })
  }
  return releases
}

export async function fetchAvailableReleases(
  currentVersion: string,
  fetchImpl: typeof fetch = globalThis.fetch
): Promise<AvailableRelease[]> {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), INDEX_TIMEOUT_MS)
  try {
    const response = await fetchImpl(RELEASES_API_URL, {
      signal: controller.signal,
      headers: {
        Accept: 'application/vnd.github+json',
        'User-Agent': 'Pierhouse-Updater'
      }
    })
    if (!response.ok) {
      throw new Error(`Version index request failed: ${response.status}`)
    }
    const releases = parseVersionIndex(await response.json())
    return releases
      .filter((release) => compareVersions(release.version, currentVersion) !== 0)
      .sort((a, b) => compareVersions(b.version, a.version))
  } finally {
    clearTimeout(timer)
  }
}
