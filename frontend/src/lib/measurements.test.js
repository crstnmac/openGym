import { describe, expect, it } from 'vitest'
import { SITES, lengthUnitOf, trackedSites, toDisplay, fromDisplay, validLength, recordMeasures, removeMeasure, siteSeries, latestOf, sitesLogged, waistHipRatio } from './measurements.js'
import { mergeBodyweight } from './sync-merge.js'

describe('units — stored in cm, shown by the profile', () => {
  it('follows the weight unit until a length unit is chosen', () => {
    expect(lengthUnitOf({ unit: 'kg' })).toBe('cm')
    expect(lengthUnitOf({ unit: 'lb' })).toBe('in')
    expect(lengthUnitOf({ unit: 'kg', lengthUnit: 'in' })).toBe('in')
    expect(lengthUnitOf({ unit: 'lb', lengthUnit: 'cm' })).toBe('cm')
    expect(lengthUnitOf({ unit: 'lb', lengthUnit: 'furlong' })).toBe('in')
    expect(lengthUnitOf(undefined)).toBe('cm')
  })
  it('converts to and from inches', () => {
    expect(toDisplay(81.28, 'in')).toBe(32)
    expect(toDisplay(81.3, 'cm')).toBe(81.3)
    expect(fromDisplay(32, 'in')).toBe(81.28)
    expect(fromDisplay(81.3, 'cm')).toBe(81.3)
  })
  it('a value typed in inches reads back as typed', () => {
    expect(toDisplay(fromDisplay(34.5, 'in'), 'in')).toBe(34.5)
  })
  it('rejects what a tape cannot read', () => {
    expect(validLength(82, 'cm')).toBe(true)
    expect(validLength(0, 'cm')).toBe(false)
    expect(validLength(2, 'cm')).toBe(false)
    expect(validLength(900, 'cm')).toBe(false)
    expect(validLength(33, 'in')).toBe(true)
    expect(validLength(150, 'in')).toBe(false)
    expect(validLength('', 'cm')).toBe(false)
    expect(validLength(NaN, 'cm')).toBe(false)
  })
})

describe('trackedSites', () => {
  it('is every site until Settings picks some', () => {
    expect(trackedSites({})).toEqual(SITES)
    expect(trackedSites({ measureSites: null })).toEqual(SITES)
    expect(trackedSites({ measureSites: [] })).toEqual(SITES)
  })
  it('keeps the picked ones in body order and drops unknown names', () => {
    expect(trackedSites({ measureSites: ['hips', 'bogus', 'waist'] })).toEqual(['waist', 'hips'])
    expect(trackedSites({ measureSites: ['bogus'] })).toEqual(SITES)
  })
})

describe('recordMeasures', () => {
  it('adds a day, in date order', () => {
    const s = { measures: [] }
    expect(recordMeasures(s, { waist: 82 }, '2026-09-02')).toBe(true)
    recordMeasures(s, { waist: 83 }, '2026-09-01')
    expect(s.measures.map(m => m.d)).toEqual(['2026-09-01', '2026-09-02'])
    expect(s.measures[1].v).toEqual({ waist: 82 })
  })
  it('works on a profile with no list yet', () => {
    const s = {}
    expect(recordMeasures(s, { hips: 96 }, '2026-09-01')).toBe(true)
    expect(s.measures).toHaveLength(1)
  })
  it('a second visit on the same day adds sites and corrects ones, never doubles the day', () => {
    const s = { measures: [] }
    recordMeasures(s, { waist: 82, hips: 96 }, '2026-09-01')
    recordMeasures(s, { waist: 81.5, chest: 101 }, '2026-09-01')
    expect(s.measures).toHaveLength(1)
    expect(s.measures[0].v).toEqual({ waist: 81.5, hips: 96, chest: 101 })
  })
  it('writes nothing for an empty or nonsensical set', () => {
    const s = { measures: [] }
    expect(recordMeasures(s, {}, '2026-09-01')).toBe(false)
    expect(recordMeasures(s, { waist: 0, hips: NaN, chest: 'x', bogus: 80, calf: 9999 }, '2026-09-01')).toBe(false)
    expect(s.measures).toEqual([])
  })
  it('keeps the valid sites and drops the rest of a mixed set', () => {
    const s = { measures: [] }
    recordMeasures(s, { waist: 82, hips: 0, bogus: 80 }, '2026-09-01')
    expect(s.measures[0].v).toEqual({ waist: 82 })
  })
})

describe('removeMeasure', () => {
  it('drops one site and keeps the day', () => {
    const s = { measures: [{ d: '2026-09-01', t: 1, v: { waist: 82, hips: 96 } }] }
    expect(removeMeasure(s, '2026-09-01', 'waist')).toBe(true)
    expect(s.measures[0].v).toEqual({ hips: 96 })
  })
  it('drops the day with its last site', () => {
    const s = { measures: [{ d: '2026-09-01', t: 1, v: { waist: 82 } }] }
    removeMeasure(s, '2026-09-01', 'waist')
    expect(s.measures).toEqual([])
  })
  it('does nothing for a site or day that is not there', () => {
    const s = { measures: [{ d: '2026-09-01', t: 1, v: { waist: 82 } }] }
    expect(removeMeasure(s, '2026-09-01', 'hips')).toBe(false)
    expect(removeMeasure(s, '2026-09-09', 'waist')).toBe(false)
    expect(removeMeasure({}, '2026-09-01', 'waist')).toBe(false)
  })
})

describe('reading a site back', () => {
  const measures = [
    { d: '2026-09-15', t: 3, v: { waist: 80, hips: 95 } },
    { d: '2026-09-01', t: 1, v: { waist: 83 } },
    { d: '2026-09-08', t: 2, v: { waist: 81.5, chest: 100 } },
  ]
  it('a site’s series is oldest first and skips days without it', () => {
    expect(siteSeries(measures, 'waist').map(p => p.cm)).toEqual([83, 81.5, 80])
    expect(siteSeries(measures, 'chest').map(p => p.d)).toEqual(['2026-09-08'])
    expect(siteSeries(measures, 'calf')).toEqual([])
  })
  it('latest carries the change from the reading before it', () => {
    expect(latestOf(measures, 'waist')).toEqual({ d: '2026-09-15', cm: 80, delta: -1.5 })
    expect(latestOf(measures, 'chest')).toEqual({ d: '2026-09-08', cm: 100, delta: null })
    expect(latestOf(measures, 'calf')).toBeNull()
  })
  it('lists the logged sites top of the body first', () => {
    expect(sitesLogged(measures)).toEqual(['chest', 'waist', 'hips'])
  })
  it('survives missing or malformed data', () => {
    expect(siteSeries(undefined, 'waist')).toEqual([])
    expect(siteSeries([null, {}, { d: '2026-09-01' }, { d: '2026-09-02', v: { waist: 'x' } }], 'waist')).toEqual([])
    expect(sitesLogged(null)).toEqual([])
  })
})

describe('waist-to-hip ratio', () => {
  it('uses the latest of each', () => {
    const m = [{ d: '2026-09-01', t: 1, v: { waist: 90, hips: 100 } }, { d: '2026-09-08', t: 2, v: { waist: 85 } }]
    expect(waistHipRatio(m)).toBe(0.85)
  })
  it('is null until both are measured', () => {
    expect(waistHipRatio([{ d: '2026-09-01', t: 1, v: { waist: 90 } }])).toBeNull()
    expect(waistHipRatio([])).toBeNull()
  })
})

describe('syncing across devices', () => {
  it('measurements merge by day, the later edit winning, like weigh-ins', () => {
    const a = [{ d: '2026-09-01', t: 5, v: { waist: 82 } }]
    const b = [{ d: '2026-09-01', t: 9, v: { waist: 81 } }, { d: '2026-09-02', t: 1, v: { hips: 96 } }]
    const out = mergeBodyweight(a, b)
    expect(out.map(m => m.d)).toEqual(['2026-09-01', '2026-09-02'])
    expect(out[0].v.waist).toBe(81)
  })
})
