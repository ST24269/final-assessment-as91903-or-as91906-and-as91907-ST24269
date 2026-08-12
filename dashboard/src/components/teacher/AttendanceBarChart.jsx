// Dependency-free SVG bar chart - no recharts/d3, just plain SVG so this
// stays consistent with the rest of the dashboard (no new chart library).
// Renders one bar per day in `data`, coloured by the same present/late/
// absent thresholds as the status badges elsewhere on this page.

function formatDayLabel(dateStr) {
  const date = new Date(`${dateStr}T00:00:00`)
  return date.toLocaleDateString([], { weekday: 'short', day: 'numeric', month: 'short' })
}

function barColor(percentage) {
  if (percentage === null || percentage === undefined) return 'var(--text-soft)'
  if (percentage >= 90) return 'var(--green)'
  if (percentage >= 75) return 'var(--amber)'
  return 'var(--red)'
}

const BAR_WIDTH = 26
const BAR_GAP = 14
const CHART_HEIGHT = 130
const LABEL_HEIGHT = 28

export default function AttendanceBarChart({ data }) {
  if (!data || data.length === 0) {
    return <p className="table-helper-text">No sessions in this date range.</p>
  }

  const slot = BAR_WIDTH + BAR_GAP
  const viewWidth = data.length * slot + BAR_GAP
  const viewHeight = CHART_HEIGHT + LABEL_HEIGHT

  return (
    <div className="attendance-bar-chart">
      <svg
        viewBox={`0 0 ${viewWidth} ${viewHeight}`}
        preserveAspectRatio="xMidYMid meet"
        role="img"
        aria-label="Daily attendance percentage"
      >
        {/* baseline */}
        <line x1={0} y1={CHART_HEIGHT} x2={viewWidth} y2={CHART_HEIGHT} className="attendance-bar-chart-axis" />

        {data.map((day, index) => {
          const pct = day.percentage ?? 0
          const barHeight = Math.max((pct / 100) * (CHART_HEIGHT - 6), day.percentage === null ? 0 : 3)
          const x = index * slot + BAR_GAP

          return (
            <g key={day.date}>
              <title>
                {`${formatDayLabel(day.date)}: ${day.percentage === null ? 'No data' : `${day.percentage}% (${day.present} present, ${day.late} late, ${day.absent} absent)`}`}
              </title>
              <rect
                x={x}
                y={CHART_HEIGHT - barHeight}
                width={BAR_WIDTH}
                height={barHeight}
                rx={4}
                fill={barColor(day.percentage)}
              />
              <text
                x={x + BAR_WIDTH / 2}
                y={CHART_HEIGHT + 18}
                textAnchor="middle"
                className="attendance-bar-chart-label"
              >
                {new Date(`${day.date}T00:00:00`).getDate()}
              </text>
            </g>
          )
        })}
      </svg>
    </div>
  )
}