export default function Card({ children, title, action }) {
  return (
    <section className="card">
      {(title || action) && (
        <div className="card-header">
          {title && <p className="card-title">{title}</p>}
          {action && <div className="card-action">{action}</div>}
        </div>
      )}
      {children}
    </section>
  )
}
