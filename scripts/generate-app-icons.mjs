// Export the existing dark compass favicon as opaque Home Screen PNGs.
// Requires the project's Playwright dev dependency and its Chromium browser.
import { readFile, mkdir, writeFile } from 'node:fs/promises'
import { chromium } from '@playwright/test'

const root = new URL('../', import.meta.url)
const svg = await readFile(new URL('public/favicon-dark.svg', root), 'utf8')
const background = svg.match(/<rect[^>]+fill="(#[a-f\d]{6})"/i)?.[1]
if (!background) throw new Error('The dark favicon must have an opaque background color.')
const browser = await chromium.launch({
  executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE || undefined,
})
try {
  const page = await browser.newPage()
  for (const [size, path] of [
    [180, 'apple-touch-icon.png'],
    [192, 'icons/icon-192.png'],
    [512, 'icons/icon-512.png'],
  ]) {
    const data = await page.evaluate(
      async ({ svg, background, size }) => {
        const img = new Image()
        img.src = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`
        await img.decode()
        const canvas = document.createElement('canvas')
        canvas.width = canvas.height = size
        const ctx = canvas.getContext('2d', { alpha: false })
        if (!ctx) throw new Error('Canvas is unavailable.')
        // iOS applies its own corner mask, so export a complete opaque square.
        ctx.fillStyle = background
        ctx.fillRect(0, 0, size, size)
        ctx.drawImage(img, 0, 0, size, size)
        return canvas.toDataURL('image/png').split(',')[1]
      },
      { svg, background, size },
    )
    const destination = new URL(`public/${path}`, root)
    await mkdir(new URL('./', destination), { recursive: true })
    await writeFile(destination, Buffer.from(data, 'base64'))
    console.log(`Exported ${size}×${size} ${path}`)
  }
} finally {
  await browser.close()
}
