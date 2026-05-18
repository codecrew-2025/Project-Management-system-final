import { useEffect, useState } from 'react'
import { useNavigate, useLocation, Link } from 'react-router-dom'
import { resetPassword } from '../lib/api'
import '../assets/login.css'

export default function ResetPassword() {
  const navigate = useNavigate()
  const { search } = useLocation()
  const params = new URLSearchParams(search)
  const initialToken = params.get('token') || ''

  const [token, setToken] = useState(initialToken)
  const [newPassword, setNewPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)
  const [msg, setMsg] = useState({ text: '', type: '' })

  useEffect(() => { setError('') }, [token, newPassword, confirmPassword])

  async function handleSubmit(e) {
    e.preventDefault()
    if (!token) return setError('Reset token is required.')
    if (!newPassword) return setError('New password is required.')
    if (newPassword.length < 6) return setError('Password must be at least 6 characters.')
    if (newPassword !== confirmPassword) return setError('Passwords do not match.')

    setLoading(true)
    try {
      const res = await resetPassword({ token, newPassword })
      setMsg({ text: res?.message || 'Password updated successfully.', type: 'ok' })
      setTimeout(() => navigate('/'), 1200)
    } catch (err) {
      setMsg({ text: err.message || 'Unable to reset password.', type: 'err' })
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="page">
      <div className="login-card">
        <div className="logo">
          <svg viewBox="0 0 28 28" fill="none">
            <rect x="2" y="2" width="10" height="10" rx="2" fill="#1a3faa"/>
            <rect x="16" y="2" width="10" height="10" rx="2" fill="#7b9aed"/>
            <rect x="2" y="16" width="10" height="10" rx="2" fill="#7b9aed"/>
            <rect x="16" y="16" width="10" height="10" rx="2" fill="#1a3faa"/>
          </svg>
          <span>ProjectFlow</span>
        </div>

        <h1 className="title">Set a New Password</h1>
        <p className="subtitle">Enter a new password to finish resetting your account.</p>

        <form onSubmit={handleSubmit} noValidate>
          

          <div className="field">
            <label htmlFor="new">New Password</label>
            <input id="new" type="password" value={newPassword} onChange={e => setNewPassword(e.target.value)} />
          </div>

          <div className="field">
            <label htmlFor="confirm">Confirm Password</label>
            <input id="confirm" type="password" value={confirmPassword} onChange={e => setConfirmPassword(e.target.value)} />
          </div>

          {error && <div className="error" style={{ marginBottom: 8 }}>{error}</div>}

          <button type="submit" className="btn" disabled={loading}>{loading ? 'Updating…' : 'Update Password'}</button>

          {msg.text && (
            <div className={`msg ${msg.type}`} style={{ marginTop: '1rem' }}>
              <span>{msg.text}</span>
            </div>
          )}
        </form>

        <p className="footer-text" style={{ marginTop: '2rem' }}>
          Remembered? <Link to="/" className="link">Sign in</Link>
        </p>
      </div>
      <footer className="page-footer">© 2026 ProjectFlow &nbsp;·&nbsp; Project Management System</footer>
    </div>
  )
}
