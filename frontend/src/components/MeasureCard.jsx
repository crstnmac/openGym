import { useState } from 'react'
import { t } from '../lib/i18n.js'
import { fmtNum } from '../lib/format.js'
import { lengthUnitOf, trackedSites, toDisplay, siteSeries, latestOf, waistHipRatio } from '../lib/measurements.js'
import { measureName } from '../lib/measure-names.js'
import LineChart from './LineChart.jsx'
import Icon from './Icon.jsx'
import { Button, SelectRow } from './ui.jsx'

// Tape measurements (lib/measurements.js): the card follows one site at a time, newest reading
// and its change on top, the chart below. Lengths are stored in cm and shown in the profile's
// length unit. A site with a fall is not coloured good or bad — for a waist it is, for a chest
// it may not be, and the app does not know which the person is after.
// `onLog` / `onAll` open the log and history sheets: the screens pass them, so this card does not
// import the sheets itself.
export default function MeasureCard({ S, onLog, onAll, h = 140 }) {
  const lu = lengthUnitOf(S)
  const sites = trackedSites(S).filter(k => siteSeries(S.measures, k).length)
  const [pick, setPick] = useState(null)
  const site = sites.includes(pick) ? pick : sites.includes('waist') ? 'waist' : sites[0]
  const pts = site ? siteSeries(S.measures, site).map(p => ({ t: p.t, y: toDisplay(p.cm, lu), d: p.d })) : []
  const last = site ? latestOf(S.measures, site) : null
  const ratio = waistHipRatio(S.measures)
  return <div className="card">
    <div className="row between bw-head" style={{ marginBottom: 8 }}>
      <h2 style={{ margin: 0 }}>{t('Measurements')}</h2>
      <div className="row" style={{ gap: 8 }}>
        <Button size="sm" icon="plus" onClick={onLog}>{t('Log')}</Button>
      </div>
    </div>
    {site ? <>
      <div className="sect-b" style={{ marginBottom: 10 }}>
        <SelectRow title={t('Site')} sheetTitle={t('Site')} value={site} onChange={setPick}
          options={sites.map(k => ({ value: k, label: measureName(k) }))} />
      </div>
      <div className="row between" style={{ alignItems: 'baseline' }}>
        <b style={{ fontSize: '1.4rem' }}>{fmtNum(toDisplay(last.cm, lu))} {lu}</b>
        {last.delta != null && fmtNum(Math.abs(toDisplay(Math.abs(last.delta), lu))) !== fmtNum(0) && <span className="small muted row" style={{ gap: 2 }}>
          <Icon name={last.delta > 0 ? 'arrowUp' : 'arrowDown'} style={{ fontSize: 12 }} />{fmtNum(toDisplay(Math.abs(last.delta), lu))} {lu}</span>}
      </div>
      <div className="chart"><LineChart points={pts} h={h} unit={lu} /></div>
      {ratio != null && <div className="small muted" style={{ marginTop: 4 }}>{t('Waist-to-hip ratio {0}', ratio.toFixed(2))}</div>}
      <div className="row" style={{ justifyContent: 'flex-end', marginTop: 4 }}>
        <Button size="sm" variant="ghost" trailingIcon="chevronRight" onClick={onAll}>{t('All measurements')}</Button>
      </div>
    </> : <div className="empty"><div className="ico"><Icon name="scale" /></div>{t('No measurements yet. Log your waist, hips and more to follow them over time.')}</div>}
  </div>
}
