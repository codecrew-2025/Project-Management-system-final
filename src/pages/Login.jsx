import { useState } from 'react'
import { useNavigate, Link } from 'react-router-dom'
import { loginUser } from '../lib/api'
import '../assets/login.css'

export default function Login() {
  const navigate = useNavigate()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [showPw, setShowPw] = useState(false)
  const [remember, setRemember] = useState(false)
  const [errors, setErrors] = useState({})
  const [msg, setMsg] = useState({ text: '', type: '' })
  const [loading, setLoading] = useState(false)

  function validate() {
    const errs = {}
    if (!email) errs.email = 'Email is required.'
    else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) errs.email = 'Enter a valid email.'
    if (!password) errs.password = 'Password is required.'
    setErrors(errs)
    return Object.keys(errs).length === 0
  }

  async function handleSubmit(e) {
    e.preventDefault()
    if (!validate() || loading) return

    setLoading(true)
    try {
      const response = await loginUser({ email, password })
      sessionStorage.removeItem('pf_user')
      localStorage.removeItem('pf_user')

      const storage = remember ? localStorage : sessionStorage
      storage.setItem('pf_user', JSON.stringify(response.user))

      setMsg({ text: '✓ Signed in! Redirecting…', type: 'ok' })
      setTimeout(() => navigate(response.redirectPath || `/${response.user.role}`), 900)
    } catch (error) {
      setMsg({ text: error.message || 'Invalid email or password.', type: 'bad' })
      setErrors({
        email: 'Please check your credentials.',
        password: 'Please check your credentials.',
      })
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="page">
      <div className="login-card">

        {/* Logo */}
        <div className="logo">
          <svg viewBox="0 0 28 28" fill="none">
            <rect x="2" y="2" width="10" height="10" rx="2" fill="#1a3faa"/>
            <rect x="16" y="2" width="10" height="10" rx="2" fill="#7b9aed"/>
            <rect x="2" y="16" width="10" height="10" rx="2" fill="#7b9aed"/>
            <rect x="16" y="16" width="10" height="10" rx="2" fill="#1a3faa"/>
          </svg>
          <span>ProjectFlow</span>
        </div>

        <h1 className="title">Sign in to your account</h1>
        <p className="subtitle">Enter your credentials to access your dashboard</p>

        <form onSubmit={handleSubmit} noValidate>
          <div className="field">
            <label htmlFor="email">Email</label>
            <input
              type="email" id="email" value={email}
              onChange={e => { setEmail(e.target.value); setErrors(v => ({...v, email:''})) }}
              placeholder="you@example.com" autoComplete="email"
              className={errors.email ? 'err' : ''}
            />
            {errors.email && <span className="error">{errors.email}</span>}
          </div>

          <div className="field">
            <label htmlFor="password">Password</label>
            <div className="pw-wrap">
              <input
                type={showPw ? 'text' : 'password'} id="password" value={password}
                onChange={e => { setPassword(e.target.value); setErrors(v => ({...v, password:''})) }}
                placeholder="Enter your password" autoComplete="current-password"
                className={errors.password ? 'err' : ''}
              />
              <button type="button" className="pw-toggle" onClick={() => setShowPw(v => !v)} aria-label="Toggle password">
                <svg viewBox="0 0 20 20" fill="none">
                  {showPw
                    ? <><path d="M14 18.8A10 10 0 0 1 10 19.5C4.5 19.5 1 12 1 12a18 18 0 0 1 2.4-3.8M8.4 4.6A10 10 0 0 1 10 4.5C15.5 4.5 19 12 19 12a18 18 0 0 1-2 3" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/><path d="M1 1l18 18" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/></>
                    : <><path d="M1 10s3-6 9-6 9 6 9 6-3 6-9 6-9-6-9-6z" stroke="currentColor" strokeWidth="1.5"/><circle cx="10" cy="10" r="2.5" stroke="currentColor" strokeWidth="1.5"/></>
                  }
                </svg>
              </button>
            </div>
            {errors.password && <span className="error">{errors.password}</span>}
          </div>

          <div className="row">
            <label className="check-label" htmlFor="remember">
              <input type="checkbox" id="remember" checked={remember} onChange={e => setRemember(e.target.checked)} />
              <span className="box"></span>
              Remember me
            </label>
            <Link to="/forgot-password" className="link">Forgot password?</Link>
          </div>

          <button type="submit" className="btn" disabled={loading}>{loading ? 'Signing in…' : 'Sign In'}</button>
          {msg.text && (
            <div className={`msg ${msg.type}`}>
              {msg.type === 'ok' ? (
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"></path><polyline points="22 4 12 14.01 9 11.01"></polyline></svg>
              ) : (
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10"></circle><line x1="12" y1="8" x2="12" y2="12"></line><line x1="12" y1="16" x2="12.01" y2="16"></line></svg>
              )}
              <span>{msg.text}</span>
            </div>
          )}
        </form>

        <p className="footer-text">
          Need an account? Contact your Director or Coordinator.
        </p>
      </div>
      <footer className="page-footer">© 2026 ProjectFlow &nbsp;·&nbsp; Project Management System</footer>
    </div>
  )
}
