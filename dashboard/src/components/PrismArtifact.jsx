// Glass cubes with RGB channel-split edges. The only colour on the public site.

// One isometric cube, drawn as three faces.
function Cube({ x, y, size, opacity = 1 }) {
  const w = size
  const h = size * 0.58 // isometric foreshortening
  const d = size * 0.46 // vertical extrusion

  const top = `${x},${y} ${x + w / 2},${y + h / 2} ${x},${y + h} ${x - w / 2},${y + h / 2}`
  const left = `${x - w / 2},${y + h / 2} ${x},${y + h} ${x},${y + h + d} ${x - w / 2},${y + h / 2 + d}`
  const right = `${x + w / 2},${y + h / 2} ${x},${y + h} ${x},${y + h + d} ${x + w / 2},${y + h / 2 + d}`

  return (
    // currentColor lets the same shape be reused for each colour channel.
    // Different stroke opacities per face make it read as a lit solid.
    <g opacity={opacity}>
      <polygon points={left} fill="#000000" stroke="currentColor" strokeWidth="1.25" strokeOpacity="0.4" />
      <polygon points={right} fill="#000000" stroke="currentColor" strokeWidth="1.25" strokeOpacity="0.62" />
      <polygon points={top} fill="#000000" stroke="currentColor" strokeWidth="1.25" strokeOpacity="0.95" />
    </g>
  )
}

// Spaced wider than the exact isometric step, or the four cubes line up
// edge-to-edge and merge into one slab.
const CLUSTER = [
  { x: 300, y: 88, size: 175 },
  { x: 176, y: 170, size: 175 },
  { x: 424, y: 170, size: 175 },
  { x: 300, y: 252, size: 175 },
  { x: 158, y: 372, size: 118, opacity: 0.55 },
  { x: 446, y: 396, size: 96, opacity: 0.4 },
]

export default function PrismArtifact({ className = '' }) {
  return (
    <svg
      className={`prism-artifact ${className}`.trim()}
      viewBox="0 0 600 620"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      aria-hidden="true"
      focusable="false"
    >
      {/* Offset copies of the cluster, blended additively for the colour fringing. */}
      <g className="prism-channel prism-channel-red" style={{ '--channel': 'var(--prism-red)' }}>
        {CLUSTER.map((cube, i) => (
          <Cube key={`r${i}`} {...cube} />
        ))}
      </g>
      <g className="prism-channel prism-channel-cyan" style={{ '--channel': 'var(--prism-cyan)' }}>
        {CLUSTER.map((cube, i) => (
          <Cube key={`c${i}`} {...cube} />
        ))}
      </g>
      <g className="prism-channel prism-channel-lime" style={{ '--channel': 'var(--prism-lime)' }}>
        {CLUSTER.map((cube, i) => (
          <Cube key={`l${i}`} {...cube} />
        ))}
      </g>

      {/* The cluster itself, on top. */}
      <g className="prism-core">
        {CLUSTER.map((cube, i) => (
          <Cube key={`k${i}`} {...cube} />
        ))}
      </g>
    </svg>
  )
}
