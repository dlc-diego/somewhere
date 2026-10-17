import { expect, test, type Page } from '@playwright/test'

const heart = (page: Page) => page.getByRole('button', { name: 'A heart for Val', exact: true })

test('searches stay compact and labeled in all modes without globe buttons', async ({ page }) => {
  await page.goto('/')
  await expect(
    page.getByRole('button', { name: /^(Zoom in|Zoom out|Reset globe view)$/ }),
  ).toHaveCount(0)
  for (const mode of ['Countries', 'Capitals', 'Flags', 'Shapes']) {
    await page
      .getByRole('combobox', { name: 'Game mode', exact: true })
      .selectOption({ label: mode })
    await expect(
      page.getByRole('combobox', {
        name: mode === 'Capitals' ? 'Search for a capital' : 'Search for a country',
        exact: true,
      }),
    ).toBeVisible()
    await expect(
      page.getByText(/Where do you think|Which capital do you think|Which country does this flag/),
    ).toHaveCount(0)
  }
})

test('a long hold beats, blooms from the heart, and resets without changing the game', async ({
  page,
  isMobile,
}) => {
  await page.goto('/')
  const target = heart(page)
  const backdrop = page.locator('.val-heart-backdrop')
  const saved = await page.evaluate(() => localStorage.getItem('somewhere.round.v1'))
  if (isMobile) await target.tap()
  else await target.click()
  await page.waitForTimeout(750)
  await expect(backdrop).toHaveCount(0)

  const box = (await target.boundingBox())!
  const x = box.x + box.width / 2
  const y = box.y + box.height / 2
  const touch = isMobile ? await page.context().newCDPSession(page) : null
  if (touch)
    await touch.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x, y }] })
  else {
    await page.mouse.move(x, y)
    await page.mouse.down()
  }
  await expect(target).toHaveClass(/is-beating/)
  if (touch) await touch.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] })
  else await page.mouse.up()

  await expect(target.locator('svg')).toHaveCSS('animation-name', /val-heartbeat/)
  await expect(backdrop).toHaveAttribute('aria-hidden', 'true')
  await expect(backdrop).toHaveCSS('pointer-events', 'none')
  await expect(backdrop).toHaveCSS('background-color', 'rgb(233, 133, 94)')
  // Seek the real CSS animation to check its first beat and fully expanded frame.
  const sizes = await backdrop.evaluate((node) => {
    const animation = node.getAnimations()[0]
    animation.pause()
    animation.currentTime = 100
    const before = getComputedStyle(node).clipPath
    animation.currentTime = 2100
    const style = getComputedStyle(node)
    return {
      before,
      after: style.clipPath,
      x: parseFloat(style.getPropertyValue('--heart-x')),
      y: parseFloat(style.getPropertyValue('--heart-y')),
      radius: Number(style.clipPath.match(/^circle\(([\d.]+)px/)?.[1]),
      width: innerWidth,
      height: innerHeight,
    }
  })
  await target.locator('svg').evaluate((node) => {
    const tint = node
      .getAnimations()
      .find(
        (animation) =>
          animation instanceof CSSAnimation && animation.animationName === 'val-heart-tint',
      )!
    tint.pause()
    tint.currentTime = 2100
  })
  await expect(target.locator('svg')).toHaveCSS('color', 'rgb(255, 249, 235)')
  expect(sizes.before).toMatch(/^circle\(0px/)
  expect(sizes.after).not.toBe(sizes.before)
  expect(sizes.x).toBeCloseTo(x)
  expect(sizes.y).toBeCloseTo(y)
  expect(sizes.radius).toBeGreaterThanOrEqual(
    Math.hypot(Math.max(x, sizes.width - x), Math.max(y, sizes.height - y)),
  )
  // The background never captures input, and gameplay remains the same round.
  await page.getByRole('combobox', { name: /^Search for a / }).fill('Japan')
  await expect(page.getByRole('listbox').getByRole('option', { name: /Japan/ })).toBeVisible()
  await expect(backdrop).toHaveCount(0, { timeout: 5000 })
  await expect(target).not.toHaveClass(/is-beating/)
  expect(await page.evaluate(() => localStorage.getItem('somewhere.round.v1'))).toBe(saved)
  if (touch) await touch.detach()
})

test('keyboard holds work, early release and dragging cancel, and reduced motion stays still', async ({
  page,
}) => {
  await page.goto('/')
  const target = heart(page)
  const backdrop = page.locator('.val-heart-backdrop')
  await target.focus()
  await page.keyboard.down('Space')
  await page.waitForTimeout(200)
  await page.keyboard.up('Space')
  await page.waitForTimeout(600)
  await expect(backdrop).toHaveCount(0)
  const box = (await target.boundingBox())!
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2)
  await page.mouse.down()
  await page.mouse.move(box.x + box.width + 20, box.y)
  await page.mouse.up()
  await page.waitForTimeout(750)
  await expect(backdrop).toHaveCount(0)

  await page.emulateMedia({ reducedMotion: 'reduce' })
  await target.focus()
  await page.keyboard.down('Enter')
  await expect(target).toHaveClass(/is-beating/)
  await page.keyboard.up('Enter')
  await expect(target.locator('svg')).toHaveCSS('animation-name', 'none')
  await expect(backdrop).toHaveCSS('animation-name', 'none')
  await expect(backdrop).toHaveCSS('clip-path', 'none')
  await expect(backdrop).toHaveCSS('opacity', '0.2')
  await expect(backdrop).toHaveCount(0, { timeout: 5000 })

  // It can be discovered again after resetting, without a reload.
  await page.emulateMedia({ reducedMotion: 'no-preference' })
  await page.keyboard.down('Space')
  await expect(target).toHaveClass(/is-beating/)
  await page.keyboard.up('Space')
  await expect(backdrop).toHaveCount(1)
})

test('heart wave covers the whole screen after viewport growth and rotation', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 560 })
  await page.goto('/')
  await heart(page).focus()
  await page.keyboard.down('Space')
  const backdrop = page.locator('.val-heart-backdrop')
  await expect(backdrop).toHaveCount(1)
  await page.keyboard.up('Space')
  await backdrop.evaluate((node) => {
    const animation = node.getAnimations()[0]
    animation.pause()
    animation.currentTime = 2100
  })
  // Browser chrome/keyboard dismissal can enlarge the viewport after a hold starts.
  // Check rendered geometry rather than the dimensions saved at activation.
  for (const viewport of [
    { width: 390, height: 1040 },
    { width: 1040, height: 390 },
    { width: 390, height: 1040 },
  ]) {
    await page.setViewportSize(viewport)
    const coverage = await backdrop.evaluate((node) => {
      const rect = node.getBoundingClientRect()
      const style = getComputedStyle(node)
      return {
        width: rect.width,
        height: rect.height,
        radius: Number(style.clipPath.match(/^circle\(([\d.]+)px/)?.[1]),
        x: Math.min(rect.width, Math.max(0, parseFloat(style.getPropertyValue('--heart-x')))),
        y: Math.min(rect.height, Math.max(0, parseFloat(style.getPropertyValue('--heart-y')))),
        viewportWidth: innerWidth,
        viewportHeight: innerHeight,
      }
    })
    expect(coverage.width).toBeGreaterThanOrEqual(coverage.viewportWidth)
    expect(coverage.height).toBeGreaterThanOrEqual(coverage.viewportHeight)
    expect(coverage.radius).toBeGreaterThanOrEqual(
      Math.hypot(
        Math.max(coverage.x, coverage.width - coverage.x),
        Math.max(coverage.y, coverage.height - coverage.y),
      ),
    )
  }
  await expect(backdrop).toHaveCount(0, { timeout: 5000 })
})
