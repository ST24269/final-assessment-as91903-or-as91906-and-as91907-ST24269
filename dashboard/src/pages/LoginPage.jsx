import { Link } from 'react-router-dom'

const ROLES = [
  {
    label: 'Admin',
    path: '/login/admin',
    description: 'Manage students, classes, readers, attendance, and users.',
  },
  {
    label: 'Teacher',
    path: '/login/teacher',
    description: 'Start class sessions and manage attendance registers.',
  },
  {
    label: 'Student',
    path: '/login/student',
    description: 'View attendance status and history.',
  },
]

export default function LoginPage() {
  return (
    <main className="login-page">
      <section className="login-card login-card-wide" aria-label="Choose login type">
        <div className="login-brand">
          <div className="login-mark">AR</div>
          <div>
            <p>AttendRFID</p>
            <h1>Sign in</h1>
          </div>
        </div>

        <p className="login-intro">
          Choose the dashboard that matches your account.
        </p>

        <div className="login-role-grid">
          {ROLES.map((role) => (
            <Link key={role.path} to={role.path} className="login-role-link">
              <strong>{role.label}</strong>
              <span>{role.description}</span>
            </Link>
          ))}
        </div>
      </section>
    </main>
  )
}
