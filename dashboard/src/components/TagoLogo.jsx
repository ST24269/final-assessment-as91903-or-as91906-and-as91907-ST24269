import tagoLogo from '../assets/tago-logo.png'
import tagoMark from '../assets/tago-mark.png'

export default function TagoLogo({
  showWord = false,
  className = '',
  markClassName = '',
}) {
  const imageSrc = showWord ? tagoLogo : tagoMark
  const imageAlt = showWord ? 'Tago' : ''

  return (
    <span className={`tago-logo ${className}`.trim()}>
      <span className={`tago-logo-mark ${showWord ? 'is-wordmark' : 'is-mark'} ${markClassName}`.trim()}>
        <img src={imageSrc} alt={imageAlt} />
      </span>
    </span>
  )
}
