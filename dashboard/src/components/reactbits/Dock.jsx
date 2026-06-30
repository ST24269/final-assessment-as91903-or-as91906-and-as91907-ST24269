import { useMemo, useRef } from 'react'
import { motion, useMotionValue, useSpring, useTransform } from 'motion/react'
import './Dock.css'

function DockItem({
  children,
  className = '',
  onClick,
  mouseX,
  spring,
  distance,
  magnification,
  baseItemSize,
  label,
}) {
  const ref = useRef(null)
  const mouseDistance = useTransform(mouseX, (value) => {
    const rect = ref.current?.getBoundingClientRect() ?? {
      x: 0,
      width: baseItemSize,
    }

    return value - rect.x - (baseItemSize / 2)
  })
  const targetSize = useTransform(mouseDistance, [-distance, 0, distance], [baseItemSize, magnification, baseItemSize])
  const size = useSpring(targetSize, spring)

  const handleKeyDown = (event) => {
    if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault()
      onClick?.()
    }
  }

  return (
    <motion.div
      ref={ref}
      style={{
        width: size,
        height: size,
      }}
      onClick={onClick}
      className={`dock-item ${className}`.trim()}
      tabIndex={0}
      role="button"
      aria-label={label}
      onKeyDown={handleKeyDown}
    >
      {children}
      <span className="dock-label" role="tooltip">{label}</span>
    </motion.div>
  )
}

function DockIcon({ children, className = '' }) {
  return <div className={`dock-icon ${className}`.trim()}>{children}</div>
}

export default function Dock({
  items,
  className = '',
  spring = { mass: 0.1, stiffness: 150, damping: 12 },
  magnification = 66,
  distance = 190,
  panelHeight = 64,
  dockHeight = 178,
  baseItemSize = 46,
}) {
  const mouseX = useMotionValue(Infinity)
  const isHovered = useMotionValue(0)
  const maxHeight = useMemo(
    () => Math.max(dockHeight, magnification + (magnification / 2) + 4),
    [dockHeight, magnification],
  )
  const heightRow = useTransform(isHovered, [0, 1], [panelHeight, maxHeight])
  const height = useSpring(heightRow, spring)

  return (
    <motion.div style={{ height, scrollbarWidth: 'none' }} className="dock-outer">
      <motion.div
        onMouseMove={({ pageX }) => {
          isHovered.set(1)
          mouseX.set(pageX)
        }}
        onMouseLeave={() => {
          isHovered.set(0)
          mouseX.set(Infinity)
        }}
        className={`dock-panel ${className}`.trim()}
        style={{ height: panelHeight }}
        role="toolbar"
        aria-label="Application dock"
      >
        {items.map((item) => (
          <DockItem
            key={item.label}
            onClick={item.onClick}
            className={item.className}
            mouseX={mouseX}
            spring={spring}
            distance={distance}
            magnification={magnification}
            baseItemSize={baseItemSize}
            label={item.label}
          >
            <DockIcon>{item.icon}</DockIcon>
          </DockItem>
        ))}
      </motion.div>
    </motion.div>
  )
}
