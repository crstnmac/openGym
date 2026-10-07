// Body measurements — waist, hips, chest and the other tape-measure sites, logged next to body
// weight. A scale cannot tell fat lost from muscle gained; the waist and the hips can.
//
// Stored as `S.measures`: one entry per calendar day, `{ d, t, v: { waist: 82.5, hips: 96 } }`,
// the list kept in date order. `v` holds only the sites measured that day, always in
// centimetres. Unlike body weight, nothing converts when the profile's unit changes: the
// profile's weight unit only picks how a length is shown (kg → cm, lb → in), so switching back
// and forth never rounds a measurement away.
//
// An entry has the `{ d, t }` shape of a weigh-in, so a sync merges it by day, the later edit
// winning (sync-merge.js, mergeBodyweight).
import { todayISO } from './format.js'

/** The sites, in the order they are asked for: top of the body to the bottom. */
export const SITES = ['neck', 'shoulders', 'chest', 'waist', 'hips', 'arm', 'forearm', 'thigh', 'calf']

const CM_PER_IN = 2.54
// What a tape can read on a person, in cm. Outside it the number is a typo, not a measurement.
const RANGE = [5, 250]

const round1 = n => Math.round(n * 10) / 10

/** The length unit a profile shows: its own choice (Settings), until made the weight unit's —
 *  inches for a profile that logs in pounds. */
export const lengthUnitOf = S => (S?.lengthUnit === 'in' || S?.lengthUnit === 'cm' ? S.lengthUnit : S?.unit === 'lb' ? 'in' : 'cm')

/** The sites the profile tracks, in SITES order: all of them until Settings picks some. */
export const trackedSites = S => {
  const pick = Array.isArray(S?.measureSites) ? SITES.filter(k => S.measureSites.includes(k)) : null
  return pick && pick.length ? pick : SITES
}

/** Centimetres → what the profile shows (`lu` is 'cm' or 'in'), to one decimal. */
export const toDisplay = (cm, lu) => (lu === 'in' ? round1(cm / CM_PER_IN) : round1(cm))

/** What was typed, in the shown length unit → centimetres, to two decimals (kept finer than
 *  the display so a value typed in inches reads back as typed). */
export const fromDisplay = (n, lu) => Math.round((lu === 'in' ? n * CM_PER_IN : n) * 100) / 100

/** Whether a typed value is one a tape could have read, in the shown length unit. */
export function validLength(n, lu) {
  const cm = fromDisplay(Number(n), lu)
  return Number.isFinite(cm) && cm >= RANGE[0] && cm <= RANGE[1]
}

const cleanValues = v => {
  const out = {}
  for (const k of SITES) {
    const n = Number(v?.[k])
    if (Number.isFinite(n) && n >= RANGE[0] && n <= RANGE[1]) out[k] = Math.round(n * 100) / 100
  }
  return out
}

/**
 * Record measurements inside a store update. `values` is `{ site: cm }`; sites not in it are left
 * as they were, so a day can be filled in over several visits. A day that already has an entry
 * is corrected rather than doubled. Returns whether anything was written.
 */
export function recordMeasures(s, values, iso = todayISO()) {
  const v = cleanValues(values)
  if (!Object.keys(v).length) return false
  s.measures = s.measures || []
  const ex = s.measures.find(m => m.d === iso)
  if (ex) { ex.v = { ...ex.v, ...v }; ex.t = Date.now() } else s.measures.push({ d: iso, t: Date.now(), v })
  s.measures.sort((a, b) => (a.d < b.d ? -1 : 1))
  return true
}

/** Remove one site from a day; the day goes with it when it was the last. */
export function removeMeasure(s, iso, site) {
  const ex = (s.measures || []).find(m => m.d === iso)
  if (!ex?.v || !(site in ex.v)) return false
  const { [site]: _gone, ...rest } = ex.v
  if (Object.keys(rest).length) { ex.v = rest; ex.t = Date.now() } else s.measures = s.measures.filter(m => m.d !== iso)
  return true
}

/** Every reading of one site, oldest first: `[{ d, t, cm }]`. */
export function siteSeries(measures, site) {
  const out = []
  for (const m of Array.isArray(measures) ? measures : []) {
    const cm = Number(m?.v?.[site])
    if (m?.d && Number.isFinite(cm) && cm > 0) out.push({ d: m.d, t: m.t || new Date(m.d).getTime(), cm })
  }
  return out.sort((a, b) => (a.d < b.d ? -1 : a.d > b.d ? 1 : 0))
}

/** The latest reading of one site, with the change from the reading before it (cm, null for a
 *  first one): `{ d, cm, delta }` or null. */
export function latestOf(measures, site) {
  const s = siteSeries(measures, site)
  if (!s.length) return null
  const last = s[s.length - 1]
  return { d: last.d, cm: last.cm, delta: s.length > 1 ? Math.round((last.cm - s[s.length - 2].cm) * 100) / 100 : null }
}

/** The sites with at least one reading, in SITES order. */
export const sitesLogged = measures => SITES.filter(k => siteSeries(measures, k).length)

/** Waist ÷ hips from the latest reading of each, to two decimals, or null until both exist.
 *  Under about 0.9 (men) / 0.85 (women) is the usual healthy range; the app shows the number and
 *  leaves the reading of it alone. */
export function waistHipRatio(measures) {
  const w = latestOf(measures, 'waist'), h = latestOf(measures, 'hips')
  return w && h ? Math.round((w.cm / h.cm) * 100) / 100 : null
}
