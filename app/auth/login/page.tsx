import { AuthForm } from '@/components/auth/AuthForm'

export default function LoginPage() {
  return (
    <main className="auth-page">
      <h1 className="auth-page__title">ChordViewer</h1>
      <h2 className="auth-page__subtitle">Sign in</h2>
      <AuthForm mode="login" />
    </main>
  )
}
