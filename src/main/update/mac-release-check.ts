import { compareVersions, UPDATE_GITHUB_OWNER, UPDATE_GITHUB_REPO } from './version-catalog'

/**
 * macOS builds from this fork are not signed/notarized, so Squirrel.Mac cannot
 * apply them. On macOS we only look up the latest GitHub Release and send the
 * user to its download page.
 */
export const LATEST_RELEASE_API = `https://api.github.com/repos/${UPDATE_GITHUB_OWNER}/${UPDATE_GITHUB_REPO}/releases/latest`
export const RELEASES_PAGE = `https://github.com/${UPDATE_GITHUB_OWNER}/${UPDATE_GITHUB_REPO}/releases`

export interface LatestRelease {
  version: string
  url: string
}

export function usesManualDownload(platform: NodeJS.Platform): boolean {
  return platform === 'darwin'
}

export function parseLatestRelease(raw: unknown): LatestRelease | undefined {
  if (typeof raw !== 'object' || raw === null) return undefined
  const r = raw as Record<string, unknown>
  if (r.draft === true || r.prerelease === true) return undefined
  if (typeof r.tag_name !== 'string') return undefined
  const version = r.tag_name.replace(/^v/iu, '')
  if (!version) return undefined
  const url = typeof r.html_url === 'string' && r.html_url.startsWith(RELEASES_PAGE) ? r.html_url : `${RELEASES_PAGE}/latest`
  return { version, url }
}

/** Returns the newer release, or undefined when already current. */
export async function checkLatestRelease(
  currentVersion: string,
  fetchImpl: typeof fetch = globalThis.fetch
): Promise<LatestRelease | undefined> {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), 10_000)
  try {
    const response = await fetchImpl(LATEST_RELEASE_API, {
      signal: controller.signal,
      headers: { Accept: 'application/vnd.github+json', 'User-Agent': 'Pierhouse-Updater' }
    })
    if (!response.ok) throw new Error(`GitHub Releases request failed: ${response.status}`)
    const latest = parseLatestRelease(await response.json())
    if (!latest) return undefined
    return compareVersions(latest.version, currentVersion) > 0 ? latest : undefined
  } finally {
    clearTimeout(timer)
  }
}
