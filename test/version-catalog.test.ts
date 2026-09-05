import { describe, expect, it } from 'vitest'
import {
  archiveFeedUrl,
  compareVersions,
  fetchAvailableReleases,
  GITHUB_UPDATE_FEED,
  parseVersionIndex,
  STABLE_FEED_URL
} from '../src/main/update/version-catalog'

describe('version-catalog constants', () => {
  it('points the stable feed at the Pierhouse GitHub releases', () => {
    expect(GITHUB_UPDATE_FEED).toEqual({
      provider: 'github',
      owner: 'lswang9',
      repo: 'dsh-desktop'
    })
    expect(STABLE_FEED_URL).toBe(
      'https://github.com/lswang9/dsh-desktop/releases/latest/download/'
    )
  })

  it('builds a per-version GitHub release download url with a trailing slash', () => {
    expect(archiveFeedUrl('1.2.3')).toBe(
      'https://github.com/lswang9/dsh-desktop/releases/download/v1.2.3/'
    )
    expect(archiveFeedUrl('v1.2.3')).toBe(
      'https://github.com/lswang9/dsh-desktop/releases/download/v1.2.3/'
    )
  })
})

describe('compareVersions', () => {
  it('orders by numeric segments', () => {
    expect(compareVersions('1.2.0', '1.10.0')).toBe(-1)
    expect(compareVersions('2.0.0', '1.9.9')).toBe(1)
    expect(compareVersions('1.2.3', '1.2.3')).toBe(0)
  })

  it('treats a prerelease as lower than its release', () => {
    expect(compareVersions('1.2.3-rc.1', '1.2.3')).toBe(-1)
    expect(compareVersions('1.2.3', '1.2.3-rc.1')).toBe(1)
    expect(compareVersions('1.2.3-rc.1', '1.2.3-rc.2')).toBe(-1)
  })
})

describe('parseVersionIndex', () => {
  it('keeps well-formed entries from the legacy versions.json shape', () => {
    const raw = {
      versions: [
        {
          version: '1.2.3',
          tag: 'v1.2.3',
          archiveUrl: 'https://github.com/lswang9/dsh-desktop/releases/download/v1.2.3/'
        },
        { version: '', tag: 'v0', archiveUrl: 'x' },
        { nope: true },
        42
      ]
    }
    expect(parseVersionIndex(raw)).toEqual([
      {
        version: '1.2.3',
        tag: 'v1.2.3',
        archiveUrl: 'https://github.com/lswang9/dsh-desktop/releases/download/v1.2.3/'
      }
    ])
  })

  it('maps GitHub release API payloads into the catalog shape', () => {
    expect(
      parseVersionIndex([
        { tag_name: 'v1.2.0', draft: false, prerelease: false },
        { tag_name: 'v1.2.1-rc.1', draft: false, prerelease: true },
        { tag_name: 'v1.1.0', draft: true, prerelease: false },
        { tag_name: 'skip' }
      ])
    ).toEqual([
      {
        version: '1.2.0',
        tag: 'v1.2.0',
        archiveUrl: 'https://github.com/lswang9/dsh-desktop/releases/download/v1.2.0/'
      }
    ])
  })

  it('returns an empty array for non-objects or a missing versions array', () => {
    expect(parseVersionIndex(null)).toEqual([])
    expect(parseVersionIndex({})).toEqual([])
    expect(parseVersionIndex('nope')).toEqual([])
  })
})

describe('fetchAvailableReleases', () => {
  const index = [
    { tag_name: 'v1.0.0', draft: false, prerelease: false },
    { tag_name: 'v1.2.0', draft: false, prerelease: false },
    { tag_name: 'v1.1.0', draft: false, prerelease: false }
  ]
  const ok = () =>
    Promise.resolve({ ok: true, json: () => Promise.resolve(index) } as Response)

  it('drops the current version and sorts descending', async () => {
    const releases = await fetchAvailableReleases('1.1.0', ok as unknown as typeof fetch)
    expect(releases.map((r) => r.version)).toEqual(['1.2.0', '1.0.0'])
  })

  it('throws when the request fails', async () => {
    const bad = () => Promise.resolve({ ok: false, status: 503 } as Response)
    await expect(
      fetchAvailableReleases('1.1.0', bad as unknown as typeof fetch)
    ).rejects.toThrow()
  })

  it('throws when the network rejects', async () => {
    const boom = () => Promise.reject(new Error('offline'))
    await expect(
      fetchAvailableReleases('1.1.0', boom as unknown as typeof fetch)
    ).rejects.toThrow('offline')
  })
})
