import { describe, expect, it } from 'vitest'
import { distanceKm, formatDistance, temperatureFor } from './geo'

describe('great-circle distances', () => {
  it('returns zero at identical coordinates', () => {
    expect(distanceKm({ lat: 46, lng: 2 }, { lat: 46, lng: 2 })).toBe(0)
  })
  it('matches the known London–New York distance', () => {
    const london = { lat: 51.5074, lng: -0.1278 }
    const nyc = { lat: 40.7128, lng: -74.006 }
    expect(distanceKm(london, nyc)).toBeCloseTo(5570.23, 0)
    expect(distanceKm(nyc, london)).toBe(distanceKm(london, nyc))
  })
  it('takes the short route across the date line', () => {
    expect(distanceKm({ lat: 0, lng: 179 }, { lat: 0, lng: -179 })).toBeCloseTo(222.39, 1)
  })
  it('handles antipodes and poles without NaN', () => {
    expect(distanceKm({ lat: 0, lng: 0 }, { lat: 0, lng: 180 })).toBeCloseTo(20015.11, 1)
    expect(distanceKm({ lat: 90, lng: 0 }, { lat: 90, lng: 120 })).toBeLessThan(0.000001)
  })
})

describe('temperature and display', () => {
  it.each([
    [999, 'hot'],
    [1000, 'warm'],
    [2999, 'warm'],
    [3000, 'cool'],
    [6999, 'cool'],
    [7000, 'cold'],
  ])('classifies %s km as %s', (distance, expected) => {
    expect(temperatureFor(Number(distance))).toBe(expected)
  })
  it('requires an exact country match, not a rounded distance of zero, to win', () => {
    expect(temperatureFor(0)).toBe('hot')
    expect(temperatureFor(0, true)).toBe('found')
    expect(formatDistance(0.3)).toBe('<1')
    expect(formatDistance(1234.6)).toBe('1,235')
  })
  it('gives shared borders the hottest feedback regardless of center distance, without granting a win', () => {
    expect(temperatureFor(15000, false, true)).toBe('adjacent')
    expect(temperatureFor(500, false, true)).toBe('adjacent')
    expect(temperatureFor(0, true, true)).toBe('found')
  })
})
