'use client'

import { useActionState } from 'react'
import { signIn, type LoginState } from '@/app/login/actions'

const initialLoginState: LoginState = { error: null }

export function LoginForm() {
  const [state, formAction, isPending] = useActionState(signIn, initialLoginState)

  return <form className="auth-form" action={formAction}><label htmlFor="email">Email</label><input id="email" name="email" type="email" autoComplete="email" required /><label htmlFor="password">Password</label><input id="password" name="password" type="password" autoComplete="current-password" required />{state.error && <p className="form-error" role="alert">{state.error}</p>}<button className="primary-button" disabled={isPending}>{isPending ? 'Signing in…' : 'Sign in'}</button></form>
}
