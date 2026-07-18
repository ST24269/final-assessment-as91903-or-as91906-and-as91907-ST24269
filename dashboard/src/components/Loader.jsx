import TagoLogo from './TagoLogo'

const SIZE_CLASS = {
  sm: 'loader-card-sm',
  md: 'loader-card-md',
  lg: 'loader-card-lg',
}

export default function Loader({
  title = 'Loading Tago',
  subtitle = 'Preparing your workspace',
  size = 'md',
  className = '',
}) {
  const sizeClass = SIZE_CLASS[size] || SIZE_CLASS.md

  return (
    <div className={`loader-screen ${className}`.trim()} role="status" aria-live="polite">
      <section className={`loader-card ${sizeClass}`}>
        <div className="loader-card-top">
          <span className="loader-mark" aria-hidden="true">
            <TagoLogo size={20} />
          </span>
          <div className="loader-copy">
            <h1>{title}</h1>
            <p>{subtitle}</p>
          </div>
        </div>

        <div className="loader-progress" aria-hidden="true">
          <span />
        </div>

        <div className="loader-skeleton" aria-hidden="true">
          <span />
          <span />
          <span />
        </div>
      </section>
    </div>
  )
}
