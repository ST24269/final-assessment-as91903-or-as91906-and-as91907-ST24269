export default function AppFooter({ className = '' }) {
  return (
    <footer className={`app-footer ${className}`}>
      <span>AttendRFID</span>
      <span>Secure attendance tracking for school teams</span>
    </footer>
  )
}
