import { describe, expect, it } from 'vitest'
import { parseWeighIn, isOnlyWeighIn, recordWeighIn, deltaSincePrevious } from './weigh-in.js'

describe('parseWeighIn — what counts as today’s body weight', () => {
  it.each([
    ['106.2 kg', 106.2],
    ['106.2kg this morning', 106.2],
    ['106,2 kg', 106.2],
    ['weighed 106.4 today', 106.4],
    ['weight: 105', 105],
    ['bw 104.8', 104.8],
    ['Morning weigh-in 106.7 kg', 106.7],
    ['scale says 103.9', 103.9],
    ['I’m 106 kilos now', 106]
  ])('%s → %s kg', (text, w) => {
    expect(parseWeighIn(text, 'kg')?.w).toBe(w)
  })

  it('converts a weight typed in the other unit', () => {
    expect(parseWeighIn('234 lbs', 'kg')).toEqual({ w: 106.1, given: '234 lb', unit: 'kg' })
    expect(parseWeighIn('106 kg', 'lb')?.w).toBe(233.7)
    expect(parseWeighIn('106.7 kg this morning', 'kg')?.w).toBe(106.7)
  })

  it.each([
    'did 3 sets of 10 push-ups',
    'benched 60 kg for 5',
    'my goal is 90 kg',
    'I want to lose 15 kg',
    'squat 100 kg felt heavy',
    'I lost 2 kg this week',
    'was 108 kg yesterday',
    '45 minutes walk today',
    'how should I train for 12 weeks?',
    'I weigh 5000 kg',            // out of any human range
    'weight 12',                  // too small to be a body weight
    ''
  ])('%s → not a weigh-in', text => {
    expect(parseWeighIn(text, 'kg')).toBeNull()
  })
})

describe('isOnlyWeighIn — whether the Coach still needs asking', () => {
  it.each(['106.2 kg', 'weighed 106.2 this morning', 'I’m at 105.8kg today', 'bw 104.8'])('%s is only a weigh-in', t => {
    expect(isOnlyWeighIn(t)).toBe(true)
  })
  it.each([
    '106.2 kg — should I eat less on rest days?',
    '106 kg today, knees felt sore on lunges, swap them for something else'
  ])('%s carries more than the weight', t => {
    expect(isOnlyWeighIn(t)).toBe(false)
  })
})

describe('recordWeighIn — the same write as the body-weight sheet', () => {
  it('adds one entry per day, corrects a second one that day, keeps date order', () => {
    const s = { bodyweight: [{ d: '2026-10-09', w: 106, t: 1 }] }
    recordWeighIn(s, 106.7, '2026-10-07')
    recordWeighIn(s, 106.24, '2026-10-07')
    expect(s.bodyweight.map(b => [b.d, b.w])).toEqual([['2026-10-07', 106.2], ['2026-10-09', 106]])
  })
  it('creates the list when a profile has none, and refuses nonsense', () => {
    const s = {}
    expect(recordWeighIn(s, 0, '2026-10-07')).toBe(false)
    expect(recordWeighIn(s, 106.7, '2026-10-07')).toBe(true)
    expect(s.bodyweight).toHaveLength(1)
  })
  it('reports the change since the previous weigh-in', () => {
    const bw = [{ d: '2026-10-01', w: 107.2 }, { d: '2026-10-07', w: 106.7 }]
    expect(deltaSincePrevious(bw, 106.2, '2026-10-08')).toEqual({ delta: -0.5, since: '2026-10-07' })
    expect(deltaSincePrevious([], 106.2, '2026-10-08')).toBeNull()
  })
})
