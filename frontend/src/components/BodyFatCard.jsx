import { t } from '../lib/i18n.js'
import { fmtNum, fmtDate } from '../lib/format.js'
import { lastBodyFat, bodyFatDelta } from '../lib/bodyfat.js'
import LineChart from './LineChart.jsx'
import Icon from './Icon.jsx'
import { Button } from './ui.jsx'

// Body fat next to body weight (lib/bodyfat.js): the newest reading and its change in %-points,
// and the curve. A fall is not coloured good or bad, the same as a measurement. `onLog` opens the
// log sheet; the screens pass it, so this card does not import the sheets itself.
export default function BodyFatCard({ S, onLog, h = 130 }) {
  const last = lastBodyFat(S)
  const delta = bodyFatDelta(S)
  const pts = (S.bodyfat || []).filter(b => b?.d && Number(b.pct) > 0).slice(-30)
    .map(b => ({ t: b.t || new Date(b.d).getTime(), y: b.pct, d: b.d }))
  return <div className="card">
    <div className="row between bw-head" style={{ marginBottom: 6 }}>
      <h2 style={{ margin: 0 }}>{t('Body fat')}</h2>
      <div className="row" style={{ gap: 8 }}>
        <Button size="sm" icon="plus" onClick={onLog}>{t('Log')}</Button>
      </div>
    </div>
    {last ? <>
      <div className="row" style={{ gap: 8, alignItems: 'baseline' }}>
        <div className="big">{fmtNum(last.pct)} <span className="muted" style={{ fontSize: '1rem' }}>%</span></div>
        {!!delta && <span className="small row muted" style={{ gap: 2, fontWeight: 500 }}>
          <Icon name={delta > 0 ? 'arrowUp' : 'arrowDown'} style={{ fontSize: 12 }} />{fmtNum(Math.abs(delta))}
        </span>}
        <span className="dim small" style={{ marginInlineStart: 'auto' }}>{fmtDate(last.d, true)}</span>
      </div>
      <div className="chart" style={{ marginTop: 8 }}><LineChart points={pts} h={h} unit="%" /></div>
    </> : <div className="muted small">{t('No readings yet. Log a tape, caliper or manual reading to start the curve.')}</div>}
  </div>
}
