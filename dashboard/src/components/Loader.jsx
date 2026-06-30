import { motion } from 'motion/react'

const SIZE_CLASS = {
  sm: 'loader-orbit-sm',
  md: 'loader-orbit-md',
  lg: 'loader-orbit-lg',
}

export default function Loader({
  title = 'Loading AttendRFID',
  subtitle = 'Preparing your workspace',
  size = 'md',
  className = '',
}) {
  const orbitClass = SIZE_CLASS[size] || SIZE_CLASS.md

  return (
    <div className={`loader-screen ${className}`.trim()} role="status" aria-live="polite">
      <motion.div
        className={`loader-orbit ${orbitClass}`}
        animate={{ scale: [1, 1.02, 1] }}
        transition={{ duration: 3.2, repeat: Infinity, ease: [0.4, 0, 0.2, 1] }}
      >
        <motion.span
          className="loader-ring loader-ring-outer"
          animate={{ rotate: 360 }}
          transition={{ duration: 3.4, repeat: Infinity, ease: 'linear' }}
        />
        <motion.span
          className="loader-ring loader-ring-middle"
          animate={{ rotate: -360 }}
          transition={{ duration: 4.2, repeat: Infinity, ease: 'linear' }}
        />
        <motion.span
          className="loader-ring loader-ring-inner"
          animate={{ rotate: 360 }}
          transition={{ duration: 2.6, repeat: Infinity, ease: 'linear' }}
        />
        <span className="loader-core" />
      </motion.div>

      <motion.div
        className="loader-copy"
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.2, duration: 0.5, ease: [0.4, 0, 0.2, 1] }}
      >
        <motion.h1
          animate={{ opacity: [0.95, 0.68, 0.95] }}
          transition={{ duration: 2.8, repeat: Infinity, ease: [0.4, 0, 0.6, 1] }}
        >
          {title}
        </motion.h1>
        <p>{subtitle}</p>
      </motion.div>
    </div>
  )
}
