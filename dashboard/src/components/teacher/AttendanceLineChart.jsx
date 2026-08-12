// Dependency-free SVG line chart - no recharts/d3. A smooth line with a
// coloured gradient area fill underneath, plus a coloured dot per day
// (green/amber/red against the same 90%/75% thresholds used elsewhere on
// this page) so a bad day pops out even at a glance.

function formatDayLabel(dateStr) {
  const date = new Date(`${dateStr}T00:00:00`)
  return date.toLocaleDateString([], { weekday: 'short', day: 'numeric', month: 'short' })
}

function pointColor(percentage) {
  if (percentage === null || percentage === undefined) return '#6d7481'
  if (percentage >= 90) return '#4ade80'
  if (percentage >= 75) return '#f2b354'
  return '#f26d63'
}

const WIDTH = 640
const HEIGHT = 220
const PAD_LEFT = 34
const PAD_RIGHT = 14
const PAD_TOP = 16
const PAD_BOTTOM = 30
const PLOT_W = WIDTH - PAD_LEFT - PAD_RIGHT
const PLOT_H = HEIGHT - PAD_TOP - PAD_BOTTOM

const GRID_LINES = [0, 25, 50, 75, 100]

function xForIndex(index, count) {
  if (count <= 1) return PAD_LEFT + PLOT_W / 2
  return PAD_LEFT + (index / (count - 1)) * PLOT_W
}

function yForValue(value) {
  const clamped = Math.max(0, Math.min(100, value ?? 0))
  return PAD_TOP + PLOT_H - (clamped / 100) * PLOT_H
}

// Smooth path through points using simple cubic bezier segments (Catmull-
// Rom style control points) rather than straight lines between dots.
function buildSmoothPath(points) {
  if (points.length === 0) return ''
  if (points.length === 1) return `M ${points[0].x} ${points[0].y}`

  let d = `M ${points[0].x} ${points[0].y}`
  for (let i = 0; i < points.length - 1; i += 1) {
    const p0 = points[i === 0 ? i : i - 1]
    const p1 = points[i]
    const p2 = points[i + 1]
    const p3 = points[i + 2 < points.length ? i + 2 : i + 1]

    const c1x = p1.x + (p2.x - p0.x) / 6
    const c1y = p1.y + (p2.y - p0.y) / 6
    const c2x = p2.x - (p3.x - p1.x) / 6
    const c2y = p2.y - (p3.y - p1.y) / 6

    d += ` C ${c1x} ${c1y}, ${c2x} ${c2y}, ${p2.x} ${p2.y}`
  }
  return d
}

export default function AttendanceLineChart({ data }) {
  if (!data || data.length === 0) {
    return <p className="table-helper-text">No sessions in this date range.</p>
  }

  const points = data.map((day, index) => ({
    x: xForIndex(index, data.length),
    y: yForValue(day.percentage),
    day,
  }))

  const linePath = buildSmoothPath(points)
  const areaPath = `${linePath} L ${points[points.length - 1].x} ${PAD_TOP + PLOT_H} L ${points[0].x} ${PAD_TOP + PLOT_H} Z`

  // Thin every-Nth label out on wide ranges so they don't collide.
  const labelStride = Math.ceil(data.length / 10)

  return (
    <div className="attendance-line-chart">
      <svg
        viewBox={`0 0 ${WIDTH} ${HEIGHT}`}
        preserveAspectRatio="xMidYMid meet"
        role="img"
        aria-label="Daily attendance percentage"
      >
        <defs>
          <linearGradient id="attendance-area-fill" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#a855f7" stopOpacity="0.45" />
            <stop offset="45%" stopColor="#6fa8dc" stopOpacity="0.28" />
            <stop offset="100%" stopColor="#6fa8dc" stopOpacity="0.02" />
          </linearGradient>
          <linearGradient id="attendance-line-stroke" x1="0" y1="0" x2="1" y2="0">
            <stop offset="0%" stopColor="#a855f7" />
            <stop offset="55%" stopColor="#6fa8dc" />
            <stop offset="100%" stopColor="#4fb99a" />
          </linearGradient>
        </defs>

        {/* Gridlines + y-axis labels */}
        {GRID_LINES.map((value) => (
          <g key={value}>
            <line
              x1={PAD_LEFT}
              x2={WIDTH - PAD_RIGHT}
              y1={yForValue(value)}
              y2={yForValue(value)}
              className="attendance-line-chart-grid"
            />
            <text x={PAD_LEFT - 8} y={yForValue(value) + 3} textAnchor="end" className="attendance-line-chart-axis-label">
              {value}
            </text>
          </g>
        ))}

        {/* Gradient area under the line */}
        <path d={areaPath} fill="url(#attendance-area-fill)" stroke="none" />

        {/* The line itself */}
        <path d={linePath} fill="none" stroke="url(#attendance-line-stroke)" strokeWidth={2.75} strokeLinecap="round" />

        {/* Coloured points + day labels */}
        {points.map(({ x, y, day }, index) => (
          <g key={day.date}>
            <title>
              {`${formatDayLabel(day.date)}: ${day.percentage === null ? 'No data' : `${day.percentage}% (${day.present} present, ${day.late} late, ${day.absent} absent)`}`}
            </title>
            <circle cx={x} cy={y} r={5} fill={pointColor(day.percentage)} stroke="var(--surface)" strokeWidth={1.5} />
            {index % labelStride === 0 && (
              <text x={x} y={HEIGHT - 8} textAnchor="middle" className="attendance-line-chart-axis-label">
                {new Date(`${day.date}T00:00:00`).getDate()}
              </text>
            )}
          </g>
        ))}
      </svg>

      <div className="attendance-line-chart-legend">
        <span><i style={{ background: '#4ade80' }} />90%+</span>
        <span><i style={{ background: '#f2b354' }} />75-89%</span>
        <span><i style={{ background: '#f26d63' }} />Below 75%</span>
      </div>
    </div>
  )
}