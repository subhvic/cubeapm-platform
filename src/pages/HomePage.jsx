import { useState, useMemo } from 'react'
import { AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, ReferenceLine } from 'recharts'
import { services, serviceSummary, serviceEdges, externalDependencies, fleetSeries } from '@/data/services'
import { statusForLatency, statusForErrorRate, statusColor } from '@/utils/status'
import PageBar from '@/components/layout/PageBar'

const BASE_TIME = new Date()

function chartData(series) {
  return series.map(d => {
    const t = new Date(BASE_TIME.getTime() - d.m * 60 * 1000)
    const hh = t.getHours().toString().padStart(2, '0')
    const mm = t.getMinutes().toString().padStart(2, '0')
    return { label: d.m === 0 ? 'now' : `-${d.m}m`, exactTime: `${hh}:${mm}`, value: d.value }
  })
}

function FleetTooltip({ active, payload, label, color, unit, formatVal }) {
  if (!active || !payload || !payload.length) return null
  const exactTime = payload[0]?.payload?.exactTime || ''
  const raw = payload[0]?.value
  const val = formatVal ? formatVal(raw) : raw
  return (
    <div style={{ background: 'var(--raised)', border: '1px solid var(--border-panel)', borderRadius: 6, padding: '5px 9px', fontSize: 11, lineHeight: '1.5' }}>
      <div style={{ color: 'var(--text-primary)', fontWeight: 600, marginBottom: 1 }}>{exactTime}</div>
      <div style={{ color: 'var(--text-muted)', fontSize: 10, marginBottom: 3 }}>{label}</div>
      <div style={{ color, fontWeight: 600 }}>{val}{unit}</div>
    </div>
  )
}

function FleetChart({ title, flag, flagType, value, unit, series, color, incidentAt, formatVal }) {
  const data = useMemo(() => chartData(series), [series])
  const gid = `fg_${title.replace(/\s/g, '')}`
  return (
    <div className="chart-card">
      <div className="clbl">{title} <span className={`flag ${flagType}`}>{flag}</span></div>
      <div className="cval">{value}<span className="u">{unit}</span></div>
      <div className="chart-host">
        <ResponsiveContainer width="100%" height="100%">
          <AreaChart data={data} margin={{ top: 6, right: 8, left: 0, bottom: 0 }}>
            <defs>
              <linearGradient id={gid} x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor={color} stopOpacity={0.28} />
                <stop offset="100%" stopColor={color} stopOpacity={0.02} />
              </linearGradient>
            </defs>
            <CartesianGrid strokeDasharray="3 3" stroke="var(--border-subtle)" vertical={false} />
            <XAxis dataKey="label" tick={{ fontSize: 10, fill: 'var(--text-muted)' }} tickLine={false} axisLine={{ stroke: 'var(--border-subtle)' }} interval={Math.floor(data.length / 4)} minTickGap={20} />
            <YAxis tick={{ fontSize: 10, fill: 'var(--text-muted)' }} tickLine={false} axisLine={false} width={30} tickFormatter={v => v >= 1000 ? `${+(v / 1000).toFixed(1)}k` : v} />
            <Tooltip content={<FleetTooltip color={color} unit={unit} formatVal={formatVal} />} />
            <Area type="monotone" dataKey="value" stroke={color} strokeWidth={1.8} fill={`url(#${gid})`} dot={false} activeDot={{ r: 3 }} />
          </AreaChart>
        </ResponsiveContainer>
      </div>
    </div>
  )
}

function SummaryStrip() {
  const s = serviceSummary
  const pills = [
    { cls: 'total', num: s.total, lbl: 'SERVICES', icon: <><rect x="3" y="4" width="18" height="6" rx="1"/><rect x="3" y="14" width="18" height="6" rx="1"/><circle cx="7" cy="7" r=".7"/><circle cx="7" cy="17" r=".7"/></> },
    { cls: 'critical', num: s.critical, lbl: 'CRITICAL', icon: <><path d="M12 3l9 17H3z"/><path d="M12 10v4M12 17v.01"/></> },
    { cls: 'warning', num: s.warning, lbl: 'WARNING', icon: <><path d="M6 10a6 6 0 1112 0c0 5 2 6 2 6H4s2-1 2-6"/><path d="M10 20a2 2 0 004 0"/></> },
    { cls: 'healthy', num: s.healthy, lbl: 'HEALTHY', icon: <path d="M20 6L9 17l-5-5"/> },
  ]
  return (
    <div className="summary-strip">
      {pills.map(p => (
        <div key={p.cls} className={`summary-pill ${p.cls}`}>
          <div>
            <div className="num">{p.num}</div>
            <div className="lbl">{p.lbl}</div>
          </div>
          <div className="icon-wrap">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">{p.icon}</svg>
          </div>
        </div>
      ))}
    </div>
  )
}

function Onboarding({ onDismiss }) {
  const Item = ({ done, label, onClick }) => (
    <div className={`tier-item${done ? ' done' : ''}`}>
      <span className="chk">
        {done && <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M20 6L9 17l-5-5"/></svg>}
      </span>
      {onClick ? <a onClick={onClick}>{label}</a> : label}
    </div>
  )
  return (
    <div className="onboard">
      <div className="onboard-head">
        <div className="onboard-title">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M12 2l1.6 5.4L19 9l-5.4 1.6L12 16l-1.6-5.4L5 9l5.4-1.6z"/></svg>
          Get the most out of CubeAPM
        </div>
        <button className="onboard-dismiss" onClick={onDismiss} aria-label="Dismiss">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M18 6L6 18M6 6l12 12"/></svg>
        </button>
      </div>
      <div className="onboard-tiers">
        <div className="tier">
          <div className="tier-name">Basic</div>
          <Item done label="Instrument your first service" />
          <Item done label="View live service topology" />
        </div>
        <div className="tier">
          <div className="tier-name">Core</div>
          <Item label="Set your first SLO" />
          <Item label="Create an alert rule (2 of 7 services covered)" />
        </div>
        <div className="tier">
          <div className="tier-name">Full platform</div>
          <Item done label="Connect a synthetic monitor" />
          <Item label="Correlate logs with traces" />
        </div>
      </div>
    </div>
  )
}

function DetailTable({ onServiceClick }) {
  return (
    <div className="panel">
      <div className="panel-head">All services <span className="hint">Sorted by severity - critical first</span></div>
      <table>
        <thead>
          <tr>
            <th style={{ textAlign: 'left' }}>Service</th>
            <th className="sortable">RPM<span className="arrow">▾</span></th>
            <th className="sortable">Latency p90<span className="arrow">▾</span></th>
            <th className="sortable">Latency Avg</th>
            <th className="sortable">Error Rate</th>
          </tr>
        </thead>
        <tbody>
          {services.map(s => {
            const latS = statusForLatency(s.latencyP90)
            const errS = statusForErrorRate(s.errorRatePct)
            return (
              <tr key={s.id} onClick={() => onServiceClick(s.id)}>
                <td>
                  <div className="svc-name">
                    <span className={`status-dot ${s.status}`} title={`Status: ${s.status}`} />
                    {s.name}
                    <span className="svc-lang">{s.language}</span>
                    <span className={`badge ${s.status}`}>{s.status}</span>
                  </div>
                </td>
                <td>{s.rpm >= 1000 ? (s.rpm / 1000).toFixed(2) + 'K' : s.rpm.toFixed(2)}</td>
                <td className={latS === 'critical' ? 'val-critical' : latS === 'warning' ? 'val-warning' : ''}>{s.latencyP90} ms</td>
                <td>{s.latencyAvg} ms</td>
                <td>
                  <span className="cell-bar">
                    <span className="track">
                      <span className="fill" style={{ width: `${Math.min(100, s.errorRatePct * 12)}%`, background: statusColor(errS) }} />
                    </span>
                    <span className={errS === 'critical' ? 'val-critical' : errS === 'warning' ? 'val-warning' : ''}>{s.errorRatePct}%</span>
                  </span>
                </td>
              </tr>
            )
          })}
        </tbody>
      </table>
    </div>
  )
}

function HealthTab() {
  const buckets = 36
  const seriesFor = (status, seed) => {
    let s = seed
    const rnd = () => { s = (s * 9301 + 49297) % 233280; return s / 233280 }
    return Array.from({ length: buckets }, (_, i) => {
      const recent = i > buckets - 8
      if (status === 'critical') return recent ? 'critical' : (rnd() < 0.3 ? 'warning' : 'healthy')
      if (status === 'warning') return recent ? 'warning' : (rnd() < 0.15 ? 'warning' : 'healthy')
      return 'healthy'
    })
  }
  return (
    <div className="panel">
      <div className="panel-head">Health history <span className="hint">Last 1 hour · {buckets} buckets</span></div>
      {services.map((s, idx) => {
        const blocks = seriesFor(s.status, idx * 7 + 3)
        return (
          <div className="health-row" key={s.id}>
            <div className="name">
              <span className={`status-dot ${s.status}`} title={`Status: ${s.status}`} />
              {s.name}
            </div>
            <div className="health-strip">
              {blocks.map((st, i) => (
                <div key={i} className="health-block" style={{ background: statusColor(st), opacity: st === 'healthy' ? 0.5 : 1 }} title={`Status: ${st}`} />
              ))}
            </div>
          </div>
        )
      })}
    </div>
  )
}

function GraphTab() {
  const pos = {
    'payment-service': [50, 18], 'order-service': [22, 18], 'shipment-service': [78, 18],
    'notify-service': [22, 44], 'search-service': [50, 44], 'analytics-service': [78, 44],
    'demo-nodejs-service': [50, 64], 'redis.0': [50, 88], 'mysql.cubedemo': [20, 88],
    'mongodb.cubedemo': [64, 88], 'api.twilio.com': [84, 88], 'maps.googleapis.com': [34, 100],
    'email.ap-south-1.amazonaws.com': [98, 100],
  }
  return (
    <div className="panel">
      <div className="panel-head">Service graph <span className="hint">Node color = status · red edges trace the incident path</span></div>
      <div className="graph-wrap">
        <svg style={{ position: 'absolute', inset: 0, width: '100%', height: '100%' }}>
          {serviceEdges.map(([a, b], i) => {
            const pa = pos[a], pb = pos[b]
            if (!pa || !pb) return null
            const crit = a === 'payment-service' || b === 'payment-service' || b === 'redis.0'
            return <line key={i} x1={`${pa[0]}%`} y1={`${pa[1]}%`} x2={`${pb[0]}%`} y2={`${pb[1]}%`} stroke={crit ? 'rgba(239,68,68,.4)' : 'var(--border-panel)'} strokeWidth="1.5" />
          })}
        </svg>
        {[...services, ...externalDependencies].map(n => {
          const p = pos[n.id]
          if (!p) return null
          const dep = !!n.type && !services.find(s => s.id === n.id)
          return (
            <div key={n.id} className={`graph-node ${dep ? 'dep' : n.status}`} style={{ left: `${p[0]}%`, top: `${p[1]}%` }}>
              {n.name}
            </div>
          )
        })}
      </div>
    </div>
  )
}

export default function HomePage({ selectService, timeRange, setTimeRange }) {
  const [homeTab, setHomeTab] = useState('detail')
  const [onboardOpen, setOnboardOpen] = useState(true)

  return (
    <>
      <PageBar timeRange={timeRange} setTimeRange={setTimeRange}>
        <span>CubeAPM</span>
        <span className="sep">/</span>
        <span className="current">Home</span>
      </PageBar>
      <div className="home-scroll">
      {onboardOpen && <Onboarding onDismiss={() => setOnboardOpen(false)} />}
      <SummaryStrip />
      <div className="charts-row">
        <FleetChart title="Throughput" flag="stable" flagType="ok" value="5.7" unit=" rpm" series={fleetSeries.rpm} color="#3B82F6" formatVal={v => (v / 1000).toFixed(1) + 'K'} />
        <FleetChart title="Errors / min" flag="▲ spiking" flagType="crit" value="44" unit="/min" series={fleetSeries.errorsPerMin} color="#EF4444" incidentAt={22} formatVal={v => Math.round(v)} />
        <FleetChart title="Fleet p90 latency" flag="▲ elevated" flagType="crit" value="390" unit="ms" series={fleetSeries.p90} color="#F59E0B" incidentAt={22} formatVal={v => Math.round(v)} />
      </div>
      <div style={{ marginBottom: 12 }}>
        <div className="tabbar">
          {['detail', 'health', 'graph'].map(t => (
            <div key={t} className={`tab${homeTab === t ? ' active' : ''}`} onClick={() => setHomeTab(t)}>
              {t === 'detail' ? 'Detail' : t === 'health' ? 'Health' : 'Service Graph'}
            </div>
          ))}
        </div>
      </div>
      {homeTab === 'detail' && <DetailTable onServiceClick={selectService} />}
      {homeTab === 'health' && <HealthTab />}
      {homeTab === 'graph' && <GraphTab />}
      </div>
    </>
  )
}
