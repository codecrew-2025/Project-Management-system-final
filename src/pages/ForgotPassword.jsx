import { useState } from 'react'
import { Link } from 'react-router-dom'
import { forgotPassword } from '../lib/api'
import '../assets/login.css'

export default function ForgotPassword() {
  const [email, setEmail] = useState('')
  const [msg, setMsg] = useState({ text: '', type: '' })
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  function handleSubmit(e) {
    e.preventDefault()
    if (!email) {
      setError('Email is required.')
      return
    } else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      setError('Enter a valid email.')
      return
    }

    setLoading(true)
    ;(async () => {
      try {
        const res = await forgotPassword({ email })
        setMsg({ text: res?.message || 'If that email exists, a reset link was sent.', type: 'ok' })
      } catch (err) {
        setMsg({ text: err.message || 'Unable to send reset link.', type: 'err' })
      } finally {
        setLoading(false)
      }
    })()
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

        <h1 className="title">Reset Account Password</h1>
        <p className="subtitle">Enter your email address and we'll send you a link to reset your password.</p>

        <form onSubmit={handleSubmit} noValidate>
          <div className="field">
            <label htmlFor="email">Email</label>
            <input
              type="email" id="email" value={email}
              onChange={e => { setEmail(e.target.value); setError('') }}
              placeholder="you@example.com" autoComplete="email"
              className={error ? 'err' : ''}
            />
            {error && <span className="error">{error}</span>}
          </div>

          <button type="submit" className="btn" disabled={loading}>{loading ? 'Sending link…' : 'Send Reset Link'}</button>
          
          {msg.text && (
            <div className={`msg ${msg.type}`} style={{marginTop: '1rem'}}>
              {msg.type === 'ok' ? (
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"></path><polyline points="22 4 12 14.01 9 11.01"></polyline></svg>
              ) : (
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10"></circle><line x1="12" y1="8" x2="12" y2="12"></line><line x1="12" y1="16" x2="12.01" y2="16"></line></svg>
              )}
              <span>{msg.text}</span>
            </div>
          )}
        </form>

        <p className="footer-text" style={{marginTop: '2rem'}}>
          Remember your password? <Link to="/" className="link">Sign in</Link>
        </p>
      </div>
      <footer className="page-footer">© 2026 ProjectFlow &nbsp;·&nbsp; Project Management System</footer>
    </div>
  )
}