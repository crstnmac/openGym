import { describe, expect, it } from 'vitest'
import { recordBodyFat, removeBodyFat, lastBodyFat, bodyFatDelta, tapeFromMeasures, navyBodyFatPct } from './bodyfat.js'
import { mergeBodyweight } from './sync-merge.js'

describe('recordBodyFat', () => {
  it('adds a reading per day, in date order, with its method', () => {
    const s = { bodyfat: [] }
    expect(recordBodyFat(s, 18.46, 'navy', '2026-09-02')).toBe(true)
    recordBodyFat(s, 19, 'manual', '2026-09-01')
    expect(s.bodyfat.map(b => b.d)).toEqual(['2026-09-01', '2026-09-02'])
    expect(s.bodyfat[1]).toMatchObject({ pct: 18.5, m: 'navy' })
  })
  it('works on a profile with no list yet, and corrects a day instead of doubling it', () => {
    const s = {}
    recordBodyFat(s, 20, 'manual', '2026-09-01')
    recordBodyFat(s, 19.2, 'jp3', '2026-09-01')
    expect(s.bodyfat).toHaveLength(1)
    expect(s.bodyfat[0]).toMatchObject({ pct: 19.2, m: 'jp3' })
  })
  it('writes nothing for a value no body has', () => {
    const s = { bodyfat: [] }
    for (const v of [0, -3, 80, 200, NaN, 'x', null, undefined]) expect(recordBodyFat(s, v, 'manual', '2026-09-01')).toBe(false)
    expect(s.bodyfat).toEqual([])
  })
})

describe('reading the log back', () => {
  const S = { bodyfat: [{ d: '2026-09-01', pct: 20 }, { d: '2026-09-08', pct: 19.4 }, null, { d: '2026-09-09', pct: 'x' }] }
  it('the newest valid reading, and the change from the one before', () => {
    expect(lastBodyFat(S)).toEqual({ d: '2026-09-08', pct: 19.4 })
    expect(bodyFatDelta(S)).toBe(-0.6)
  })
  it('nothing logged, or a malformed profile, is null', () => {
    expect(lastBodyFat({})).toBeNull()
    expect(lastBodyFat(undefined)).toBeNull()
    expect(bodyFatDelta({ bodyfat: [{ d: '2026-09-01', pct: 20 }] })).toBeNull()
  })
  it('removing a day', () => {
    const s = { bodyfat: [{ d: '2026-09-01', pct: 20 }] }
    expect(removeBodyFat(s, '2026-09-02')).toBe(false)
    expect(removeBodyFat(s, '2026-09-01')).toBe(true)
    expect(s.bodyfat).toEqual([])
  })
})

describe('the tape method starts from the measurements', () => {
  const measures = [
    { d: '2026-09-01', t: 1, v: { neck: 38, waist: 90, hips: 100 } },
    { d: '2026-09-08', t: 2, v: { waist: 86 } },
  ]
  it('takes the latest reading of each site, in cm', () => {
    expect(tapeFromMeasures(measures)).toEqual({ neck: 38, waist: 86, hip: 100 })
    expect(tapeFromMeasures([])).toEqual({ neck: null, waist: null, hip: null })
  })
  it('feeds the Navy formula', () => {
    const pct = navyBodyFatPct(tapeFromMeasures(measures), 180, 'male', 'cm')
    expect(pct).toBeGreaterThan(10)
    expect(pct).toBeLessThan(25)
  })
  it('is null until the site the sex needs is measured', () => {
    expect(navyBodyFatPct({ neck: 38, waist: 86, hip: null }, 165, 'female', 'cm')).toBeNull()
    expect(navyBodyFatPct({ neck: null, waist: 86, hip: 100 }, 165, 'male', 'cm')).toBeNull()
  })
})

describe('syncing', () => {
  it('readings merge by day, the later edit winning, like weigh-ins', () => {
    const out = mergeBodyweight([{ d: '2026-09-01', t: 5, pct: 20 }], [{ d: '2026-09-01', t: 9, pct: 19 }, { d: '2026-09-02', t: 1, pct: 19.5 }])
    expect(out.map(b => b.pct)).toEqual([19, 19.5])
  })
})
