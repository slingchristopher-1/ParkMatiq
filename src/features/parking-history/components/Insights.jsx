import { useState, useEffect } from 'react'
import { periodRanges, spendByBucket, inRange } from '../../../utils/periods'
import {
  promptStats, stopLag, zoneUsage, cheaperAlternatives, totalDifference,
} from '../../../utils/insights'
import { loadZones } from '../../../utils/zones'
import { getPrompts } from '../../../services/storage'
import { formatEuro } from '../../../services/tariffs'

// The history screen reads as one argument: what you spent, where you spent it,
// where you could have spent less, then how well the app itself did. The last
// two are about the app rather than the money, so they sit at the end.
export default function Insights({ sessions }) {
  const prompts = getPrompts()
  const [period, setPeriod] = useState('week')
  const [alternatives, setAlternatives] = useState([])

  const ranges = periodRanges(period)
  const current = sessions.filter(s => inRange(s, ranges.current))
  const previous = sessions.filter(s => inRange(s, ranges.previous))

  const cur = spendByBucket(sessions, period, ranges.current)
  const prev = spendByBucket(sessions, period, ranges.previous)
  const diff = cur.sum - prev.sum
  const diffPct = prev.sum > 0 ? Math.round(Math.abs(diff / prev.sum) * 100) : 0
  const maxBar = Math.max(1, ...cur.totals, ...prev.totals)

  const usage = zoneUsage(current)
  const promptsNow = promptStats(prompts.filter(p => inRange(p, ranges.current)))
  const promptsPrev = promptStats(prompts.filter(p => inRange(p, ranges.previous)))
  const lag = stopLag(current)

  // The zone polygons load asynchronously, so the suggestion fills in after the
  // rest of the screen. No cheaper neighbour means no card at all.
  useEffect(() => {
    let live = true
    loadZones().then(data => {
      if (!live || !data) return
      setAlternatives(cheaperAlternatives(usage, data, { limit: 4 }))
    })
    return () => { live = false }
  }, [period, sessions])

  const totalVisits = usage.reduce((a, z) => a + z.visits, 0)
  const totalSpend = usage.reduce((a, z) => a + z.spend, 0)

  return (
    <>
      <div className="insight-head">
        <span className="insight-title">Uitgaven</span>
        <div className="seg">
          <button
            className={`seg-opt${period === 'week' ? ' act' : ''}`}
            onClick={() => setPeriod('week')}
          >Week</button>
          <button
            className={`seg-opt${period === 'month' ? ' act' : ''}`}
            onClick={() => setPeriod('month')}
          >Maand</button>
        </div>
      </div>

      <div className="insight-card">
        <div className="spend-head">
          <div>
            <span className="insight-sub">{ranges.currentLabel}</span>
            <span className="spend-total">{formatEuro(cur.sum)}</span>
          </div>
          <div className="spend-compare">
            <span className="insight-sub">t.o.v. {ranges.previousLabel}</span>
            <span className={`spend-delta${diff > 0 ? ' up' : diff < 0 ? ' down' : ''}`}>
              {diff === 0 ? '▶' : diff > 0 ? '▲' : '▼'} {diffPct}%
            </span>
            <span className="insight-sub">
              {formatEuro(prev.sum)} · {ranges.comparisonNote}
            </span>
          </div>
        </div>

        <div className="bar-wrap">
          {cur.labels.map((label, i) => (
            <div key={label} className="bar-col">
              <div className="bar-pair">
                <div
                  className="bar-prev"
                  style={{ height: `${Math.max(3, (prev.totals[i] || 0) / maxBar * 68)}px` }}
                />
                <div
                  className="bar-cur"
                  style={{ height: `${Math.max(3, cur.totals[i] / maxBar * 68)}px` }}
                />
              </div>
              <span className="bar-label">{label}</span>
            </div>
          ))}
        </div>

        <div className="bar-legend">
          <span><i className="swatch cur" />{ranges.currentLabel}</span>
          <span><i className="swatch prev" />{ranges.previousLabel}</span>
        </div>
      </div>

      {usage.length > 0 && (
        <>
          <span className="insight-title">Waar je parkeert</span>
          <div className="insight-card">
            {usage.slice(0, 4).map((z, i) => (
              <div key={z.key} className="zone-row">
                <span className={`zone-rank${i === 0 ? ' first' : ''}`}>{i + 1}</span>
                <div className="zone-body">
                  <div className="zone-line">
                    <span className="zone-name">{z.label}</span>
                    <span className="insight-sub">
                      {z.visits} bezoek{z.visits === 1 ? '' : 'en'} · {formatEuro(z.spend)}
                    </span>
                  </div>
                  <div className="zone-track">
                    <div className="zone-fill" style={{ width: `${(z.visits / usage[0].visits) * 100}%` }} />
                  </div>
                </div>
              </div>
            ))}
            <div className="insight-total">
              <span className="insight-sub">
                {usage.length} zone{usage.length === 1 ? '' : 's'} · {totalVisits} bezoek{totalVisits === 1 ? '' : 'en'}
              </span>
              <span className="insight-total-figure">{formatEuro(totalSpend)}</span>
            </div>
          </div>
        </>
      )}

      {alternatives.length > 0 && (
        <>
          <span className="insight-title">Waar je had kunnen parkeren</span>

          <div className="saved-card">
            <div className="saved-info">
              <span className="saved-label">Had je kunnen besparen · {ranges.currentLabel.toLowerCase()}</span>
              <span className="saved-amount">{formatEuro(totalDifference(alternatives))}</span>
              <span className="saved-sub">
                dezelfde uren in de goedkopere zone ernaast · {alternatives.length} zone
                {alternatives.length === 1 ? '' : 's'}
              </span>
            </div>
            <div className="saved-icon">
              <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M3 17l6-6 4 4 7-7"/><path d="M17 8h4v4"/></svg>
            </div>
          </div>

          <div className="insight-card">
            <div className="alt-head">
              <span>Zone → goedkopere buurzone</span>
              <span>Je had bespaard</span>
            </div>
            {alternatives.map(({ usage: z, alt }) => (
              <div key={z.key} className="alt-row">
                <div>
                  <span className="zone-name">{z.label} → {alt.label}</span>
                  <span className="alt-rates">
                    {formatEuro(alt.hereRate)}/u → {formatEuro(alt.rate)}/u ·{' '}
                    {alt.metres === 0 ? 'grenst eraan' : `${alt.metres} m`}
                  </span>
                </div>
                <div className="alt-figure">
                  <span className="alt-saved">{formatEuro(alt.difference)}</span>
                  <span className="insight-sub">{z.visits} bezoek{z.visits === 1 ? '' : 'en'}</span>
                </div>
              </div>
            ))}
            <div className="insight-total">
              <span className="insight-sub">
                Schatting: dezelfde uren, ander tarief. Buurzones kunnen andere betaalde tijden hebben.
              </span>
            </div>
          </div>
        </>
      )}

      <span className="insight-title">Meldingen opgevolgd</span>
      <div className="insight-card">
        <PromptRow label="Startmeldingen" cur={promptsNow.start} prev={promptsPrev.start} />
        <PromptRow label="Stopmeldingen" cur={promptsNow.stop} prev={promptsPrev.stop} last />
      </div>

      {lag.count > 0 && (
        <>
          <span className="insight-title">Nadat je wegreed</span>
          <div className="insight-card">
            <p className="lag-line">
              Je stopte <strong>{lag.count}</strong> sessie{lag.count === 1 ? '' : 's'} gemiddeld{' '}
              <strong>{lag.median} min</strong> nadat je wegreed.
            </p>
            <span className="insight-sub">
              Niet in euro’s — we weten niet wanneer je het zelf gemerkt zou hebben.
            </span>
          </div>
        </>
      )}
    </>
  )
}

function PromptRow({ label, cur, prev, last }) {
  const delta = cur.pct !== null && prev.pct !== null ? cur.pct - prev.pct : null
  return (
    <div className={`prompt-row${last ? ' last' : ''}`}>
      <div>
        <span className="zone-name">{label}</span>
        <span className="insight-sub">
          {cur.prompts ? `${cur.acted} van ${cur.prompts}` : 'nog geen'}
        </span>
      </div>
      <div className="prompt-figure">
        <span className="prompt-pct">{cur.pct === null ? '—' : `${cur.pct}%`}</span>
        {delta !== null && (
          <span className={`prompt-delta${delta > 0 ? ' up' : delta < 0 ? ' down' : ''}`}>
            {delta > 0 ? '+' : ''}{delta} pt
          </span>
        )}
      </div>
    </div>
  )
}
