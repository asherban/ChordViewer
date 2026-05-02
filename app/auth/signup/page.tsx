import { AuthForm } from '@/components/auth/AuthForm'

export default function SignupPage() {
  return (
    <main className="auth-page">
      <h1 className="auth-page__title">ChordViewer</h1>
      <h2 className="auth-page__subtitle">Create account</h2>
      <AuthForm mode="signup" />
    </main>
  )
}
