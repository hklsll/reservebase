import { LoginForm } from '@/components/auth/login-form'

export const dynamic = 'force-dynamic'

export default function LoginPage() {
  return <main className="auth-page"><section className="auth-card"><p className="eyebrow">ReserveBase</p><h1>Sign in to your workspace</h1><p>Use the credentials provided by your organization administrator.</p><LoginForm /></section></main>
}
