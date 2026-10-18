import { afterEach, describe, expect, it, vi } from 'vitest'
import { fetchLatestVersion, updateUrl } from './updates'

afterEach(() => {
  vi.unstubAllGlobals()
  vi.useRealTimers()
})

describe('app updates', () => {
  it('checks a deployment subpath with fresh query keys and bypasses the browser cache', async () => {
    const fetch = vi.fn().mockResolvedValue(new Response(JSON.stringify({ version: 'build-2' })))
    vi.stubGlobal('fetch', fetch)
    expect(await fetchLatestVersion('https://example.com/somewhere/')).toBe('build-2')
    fetch.mockResolvedValueOnce(new Response(JSON.stringify({ version: 'build-2' })))
    await fetchLatestVersion('https://example.com/somewhere/')
    const first = fetch.mock.calls[0][0] as URL
    const second = fetch.mock.calls[1][0] as URL
    expect(first.pathname).toBe('/somewhere/version.json')
    expect(first.searchParams.get('_check')).toBeTruthy()
    expect(first.href).not.toBe(second.href)
    expect(fetch.mock.calls[0][1]).toEqual({ cache: 'no-store', signal: expect.any(AbortSignal) })
  })

  it.each([
    null,
    [],
    {},
    { version: '' },
    { version: 5 },
    { version: 'bad version' },
    { version: 'x'.repeat(161) },
  ])('rejects invalid version information: %j', async (manifest) => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(JSON.stringify(manifest))))
    await expect(fetchLatestVersion('https://example.com/')).rejects.toThrow('Invalid version')
  })

  it('rejects HTTP failures instead of treating an error page as an update', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response('Unavailable', { status: 503 })))
    await expect(fetchLatestVersion('https://example.com/')).rejects.toThrow('Version check failed')
  })

  it('aborts a hung check after eight seconds so the button can recover', async () => {
    vi.useFakeTimers()
    vi.stubGlobal(
      'fetch',
      vi.fn(
        (_url, options: RequestInit) =>
          new Promise((_resolve, reject) => {
            options.signal!.addEventListener('abort', () =>
              reject(new DOMException('Timed out', 'AbortError')),
            )
          }),
      ),
    )
    const rejected = expect(fetchLatestVersion('https://example.com/')).rejects.toThrow('Timed out')
    await vi.advanceTimersByTimeAsync(8000)
    await rejected
  })

  it('refreshes HTML without leaving the deployment path or losing other URL state', () => {
    const url = new URL(
      updateUrl('https://example.com/somewhere/?hello=Val&_app_update=old#game', 'build-2'),
    )
    expect(url.origin).toBe('https://example.com')
    expect(url.pathname).toBe('/somewhere/')
    expect(url.searchParams.get('hello')).toBe('Val')
    expect(url.searchParams.getAll('_app_update')).toEqual(['build-2'])
    expect(url.hash).toBe('#game')
  })
})
