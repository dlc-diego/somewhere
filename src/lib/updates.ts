export const APP_VERSION = __APP_VERSION__
export const UPDATE_QUERY_KEY = '_app_update'

export async function fetchLatestVersion(baseUrl: string): Promise<string> {
  const url = new URL('version.json', baseUrl)
  // A unique query also avoids reusing a CDN response, not just the browser cache.
  url.searchParams.set('_check', crypto.randomUUID())
  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), 8000)
  try {
    const response = await fetch(url, { cache: 'no-store', signal: controller.signal })
    if (!response.ok) throw new Error('Version check failed')
    const manifest: unknown = await response.json()
    if (
      !manifest ||
      typeof manifest !== 'object' ||
      !('version' in manifest) ||
      typeof manifest.version !== 'string' ||
      !/^[a-zA-Z0-9._-]{1,160}$/.test(manifest.version)
    )
      throw new Error('Invalid version information')
    return manifest.version
  } finally {
    clearTimeout(timeout)
  }
}

export function updateUrl(currentUrl: string, version: string): string {
  const url = new URL(currentUrl)
  // Fetch a fresh HTML entry point. Its Vite asset names change with their content.
  url.searchParams.set(UPDATE_QUERY_KEY, version)
  return url.href
}
