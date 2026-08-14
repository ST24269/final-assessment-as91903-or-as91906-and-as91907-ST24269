import useReveal from '../hooks/useReveal'

// A component rather than a bare hook so it can be used inside .map().
export default function Reveal({
  as: Tag = 'div',
  className = '',
  delay = 0,
  style,
  children,
  ...rest
}) {
  const ref = useReveal()

  return (
    <Tag
      ref={ref}
      className={`reveal ${className}`.trim()}
      style={delay ? { ...style, '--reveal-delay': `${delay}ms` } : style}
      {...rest}
    >
      {children}
    </Tag>
  )
}
