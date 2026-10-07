// Weigh-ins written from somewhere other than the body-weight sheet: the Coach intake ("what do
// you weigh today?") and a chat message like "106.2 kg this morning".
//
// Both write exactly what the sheet writes — one entry per calendar day, in the profile's unit,
// `{ d, w, t }`, the list kept in date order — so the chart, the goal line and the Coach's own
// weigh-in series cannot tell where an entry came from.
//
// Reading a weight out of free text is deliberately conservative. "3 sets of 10", "I did 60 kg
// on bench" and "my goal is 90 kg" must never become a weigh-in, so a number only counts with
// a unit or a weigh-in word right beside it, a lift or goal word anywhere disqualifies the
// message, and the result is always shown back for a yes before anything is written.
import { todayISO } from './format.js'

// The range a human body weight can be, per unit. Outside it the number is something else.
const RANGE = { kg: [25, 350], lb: [55, 770] }

const UNIT_WORD = '(kg|kgs|kilos?|kilograms?|lb|lbs|pounds?)'
const NUM = '(\\d{2,3}(?:[.,]\\d{1,2})?)'
// A number with its unit right after it: "106.2 kg", "106,2kg", "234 lbs".
const WITH_UNIT = new RegExp(`(?:^|[^\\d.,])${NUM}\\s*${UNIT_WORD}\\b`, 'i')
// A weigh-in word, then a bare number: "weighed 106.2", "weight: 106", "bw 106.4", "I'm at 106".
const AFTER_WORD = new RegExp(`\\b(?:weigh(?:ed|ing|s)?(?:\\s+in)?|weight|bw|body\\s*weight|scale(?:\\s+says)?)\\b[^\\d]{0,12}${NUM}(?!\\s*(?:x|×|reps?|sets?|min|sec|%))`, 'i')
// Anything that makes a number about training or a target rather than today's body weight.
// Lift words match as prefixes ("benched", "squatting", "rows"); the rest are whole words.
const NOT_A_WEIGH_IN = /\b(?:bench|squat|deadlift|press|row|curl|lift|dumbbell|barbell|kettlebell|plate)|\b(?:sets?|reps?|x\s*\d|goal|target|want to|aim|lose|lost|gain(?:ed)?|drop(?:ped)?|by (?:jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)\w*|yesterday|last week)\b|×/i

const unitOf = word => (/^(lb|lbs|pounds?)$/i.test(word || '') ? 'lb' : /^(kg|kgs|kilos?|kilograms?)$/i.test(word || '') ? 'kg' : null)
const round1 = n => Math.round(n * 10) / 10
// Exact, not units.js's convertWeight: that one rounds to what can be loaded on a bar, which is
// right for a lift and wrong for a body weight read off a scale.
const KG_PER_LB = 0.45359237
const convert = (n, from, to) => (from === to ? n : from === 'lb' ? n * KG_PER_LB : n / KG_PER_LB)

/**
 * Today's body weight in a message, in the profile's unit — or null when there is none to be
 * sure of. `{ w, given, unit }`: `w` is what would be stored, `given` what the person typed
 * (number and unit) so the confirmation can quote them, `unit` the profile's.
 */
export function parseWeighIn(text, profileUnit = 'kg') {
  const s = String(text || '')
  if (!s.trim() || s.length > 400) return null
  if (NOT_A_WEIGH_IN.test(s)) return null
  let m = WITH_UNIT.exec(s)
  let raw, typedUnit
  if (m) { raw = m[1]; typedUnit = unitOf(m[2]) } else {
    m = AFTER_WORD.exec(s)
    if (!m) return null
    raw = m[1]; typedUnit = null
  }
  const n = Number(raw.replace(',', '.'))
  if (!Number.isFinite(n)) return null
  const unit = profileUnit === 'lb' ? 'lb' : 'kg'
  const from = typedUnit || unit
  if (n < RANGE[from][0] || n > RANGE[from][1]) return null
  const w = round1(convert(n, from, unit))
  return { w, given: `${raw.replace(',', '.')} ${from}`, unit }
}

/**
 * Whether the message is nothing but the weigh-in — so logging it is the whole answer and the
 * Coach need not be asked anything. Anything with a question or more than a few words left
 * over is still sent on to the Coach after the weight is logged.
 */
export function isOnlyWeighIn(text) {
  const rest = String(text || '')
    .replace(new RegExp(`${NUM}\\s*${UNIT_WORD}?`, 'gi'), ' ')
    .replace(/\b(i'?m|i am|am|is|was|my|me|at|on|the|today|this|morning|evening|now|currently|weigh(?:ed|ing|s)?|in|weight|bw|body|scale|says|just|new|weigh-in|log|logged|please|kg|lbs?)\b/gi, ' ')
    .replace(/[^\p{L}\p{N}?]+/gu, ' ')
    .trim()
  return !rest.includes('?') && rest.split(/\s+/).filter(Boolean).length <= 2
}

/**
 * Record a weigh-in inside a store update — the same write the body-weight sheet makes. A day
 * that already has one is corrected rather than doubled.
 */
export function recordWeighIn(s, w, iso = todayISO()) {
  const n = round1(Number(w))
  if (!(n > 0)) return false
  s.bodyweight = s.bodyweight || []
  const ex = s.bodyweight.find(b => b.d === iso)
  if (ex) { ex.w = n; ex.t = Date.now() } else s.bodyweight.push({ d: iso, w: n, t: Date.now() })
  s.bodyweight.sort((a, b) => (a.d < b.d ? -1 : 1))
  return true
}

/** The change since the previous weigh-in before `iso`, for the confirmation line. */
export function deltaSincePrevious(bodyweight, w, iso = todayISO()) {
  const prev = [...(bodyweight || [])].filter(b => b.d < iso).pop()
  return prev ? { delta: round1(w - prev.w), since: prev.d } : null
}
