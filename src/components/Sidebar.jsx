import { useState, useEffect, useRef, useCallback } from 'react'
import { useNavigate } from 'react-router-dom'
import { getNotifications, markNotificationsRead } from '../lib/api'
import '../assets/dashboard.css'

const Logo = () => (
  <svg viewBox="0 0 32 32" fill="none" xmlns="http://www.w3.org/2000/svg">
    <path d="M10 6C10 4.89543 10.8954 4 12 4H22C23.1046 4 24 4.89543 24 6V11C24 12.1046 23.1046 13 22 13H12C10.8954 13 10 12.1046 10 11V6Z" fill="#fff"/>
    <path d="M10 16C10 14.8954 10.8954 14 12 14H17C18.1046 14 19 14.8954 19 16V26C19 27.1046 18.1046 28 17 28H12C10.8954 28 10 27.1046 10 26V16Z" fill="rgba(255,255,255,0.6)"/>
    <circle cx="23" cy="21" r="5" fill="#fff" fillOpacity="0.4" />
  </svg>
)

const Icons = {
  Overview: <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="3" width="7" height="7"></rect><rect x="14" y="3" width="7" height="7"></rect><rect x="14" y="14" width="7" height="7"></rect><rect x="3" y="14" width="7" height="7"></rect></svg>,
  'All Projects': <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"></path></svg>,
  Teams: <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"></path><circle cx="9" cy="7" r="4"></circle><path d="M23 21v-2a4 4 0 0 0-3-3.87"></path><path d="M16 3.13a4 4 0 0 1 0 7.75"></path></svg>,
  Analytics: <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="18" y1="20" x2="18" y2="10"></line><line x1="12" y1="20" x2="12" y2="4"></line><line x1="6" y1="20" x2="6" y2="14"></line></svg>,
  Reports: <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"></path><polyline points="14 2 14 8 20 8"></polyline><line x1="16" y1="13" x2="8" y2="13"></line><line x1="16" y1="17" x2="8" y2="17"></line><polyline points="10 9 9 9 8 9"></polyline></svg>,
  Settings: <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="3"></circle><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z"></path></svg>,
  Dashboard: <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="3" width="7" height="9"></rect><rect x="14" y="3" width="7" height="5"></rect><rect x="14" y="12" width="7" height="9"></rect><rect x="3" y="16" width="7" height="5"></rect></svg>,
  'My Projects': <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"></path></svg>,
  'My Project': <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"></path></svg>,
  Students: <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M22 10v6M2 10l10-5 10 5-10 5z"></path><path d="M6 12v5c3 3 9 3 12 0v-5"></path></svg>,
  'Team members': <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M22 10v6M2 10l10-5 10 5-10 5z"></path><path d="M6 12v5c3 3 9 3 12 0v-5"></path></svg>,
  Schedule: <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="4" width="18" height="18" rx="2" ry="2"></rect><line x1="16" y1="2" x2="16" y2="6"></line><line x1="8" y1="2" x2="8" y2="6"></line><line x1="3" y1="10" x2="21" y2="10"></line></svg>,
  Submissions: <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M4 12v8a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-8"></path><polyline points="16 6 12 2 8 6"></polyline><line x1="12" y1="2" x2="12" y2="15"></line></svg>,
  Workspace: <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="2" y="3" width="20" height="14" rx="2" ry="2"></rect><line x1="8" y1="21" x2="16" y2="21"></line><line x1="12" y1="17" x2="12" y2="21"></line></svg>,
  Tasks: <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M9 11l3 3L22 4"></path><path d="M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11"></path></svg>,
  Messages: <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"></path></svg>,
}

const defaultIcon = <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10"></circle><line x1="12" y1="16" x2="12" y2="12"></line><line x1="12" y1="8" x2="12.01" y2="8"></line></svg>

const EMPTY_NOTIFICATION_CONTEXT = {}

const BellIcon = () => (
  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9"/>
    <path d="M13.73 21a2 2 0 0 1-3.46 0"/>
  </svg>
)

export default function Sidebar({ mode = 'expanded', role, userName, userInitials, userSub, navItems, activeNav, onNavChange, onToggleMode, notificationContext = EMPTY_NOTIFICATION_CONTEXT }) {
  const navigate = useNavigate()
  const [internalIndex, setInternalIndex] = useState(0)
  const [notifs, setNotifs] = useState([])
  const bellRef = useRef(null)

  const activeIndex = activeNav !== undefined ? activeNav : internalIndex
  const setActive = onNavChange || setInternalIndex

  const isMini = mode === 'mini'
  const isHidden = mode === 'hidden'

  const roleKey = role ? role.toLowerCase() : null
  const unreadCount = notifs.filter(n => !n.read).length

  // Poll notifications every 8 seconds
  const fetchNotifs = useCallback(async () => {
    if (!roleKey) return
    try {
      const data = await getNotifications(roleKey, notificationContext)
      setNotifs(data)
    } catch {
      // silently fail
    }
  }, [notificationContext, roleKey])

  useEffect(() => {
    fetchNotifs()
    const interval = setInterval(fetchNotifs, 8000)
    return () => clearInterval(interval)
  }, [fetchNotifs])

  async function openNotificationsPage() {
    if (unreadCount > 0 && roleKey) {
      try {
        await markNotificationsRead(roleKey, notificationContext)
        setNotifs(prev => prev.map(n => ({ ...n, read: true })))
      } catch {}
    }
    navigate('/notifications')
  }

  function logout() {
    sessionStorage.removeItem('pf_user')
    localStorage.removeItem('pf_user')
    navigate('/')
  }

  return (
    <nav className="sidebar" style={{
      width: isHidden ? 0 : isMini ? 68 : 260,
      opacity: isHidden ? 0 : 1,
      transition: 'width 0.3s cubic-bezier(0.4, 0, 0.2, 1), opacity 0.2s',
      overflow: 'visible',
      minWidth: isHidden ? 0 : isMini ? 68 : 260,
      padding: isHidden ? 0 : isMini ? '32px 14px' : '32px 20px',
      margin: 0,
    }}>
      {/* Logo row + bell + toggle */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: isMini ? 'center' : 'space-between', paddingBottom: 24, marginBottom: 24, borderBottom: '1px solid rgba(255,255,255,0.08)', gap: 8, whiteSpace: 'nowrap' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, overflow: 'hidden' }}>
          <button
            onClick={() => onToggleMode && onToggleMode()}
            title={isMini ? 'Expand sidebar' : 'Collapse sidebar'}
            style={{
              background: 'rgba(255,255,255,0.1)',
              border: '1px solid rgba(255,255,255,0.2)',
              cursor: 'pointer',
              color: 'rgba(255,255,255,0.9)',
              padding: '6px',
              borderRadius: '8px',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              transition: 'all 0.2s ease',
            }}
            onMouseOver={(e) => e.currentTarget.style.background = 'rgba(255,255,255,0.2)'}
            onMouseOut={(e) => e.currentTarget.style.background = 'rgba(255,255,255,0.1)'}
          >
            {isMini ? (
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="3" width="18" height="18" rx="2" ry="2"></rect><line x1="9" y1="3" x2="9" y2="21"></line></svg>
            ) : (
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="3" width="18" height="18" rx="2" ry="2"></rect><line x1="15" y1="3" x2="15" y2="21"></line></svg>
            )}
          </button>
          {!isMini && (
            <>
              <div className="logo-icon" style={{ flexShrink: 0 }}><Logo /></div>
              <span className="logo-text" style={{ paddingRight: 8 }}>ProjectFlow</span>
            </>
          )}
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 2, flexShrink: 0 }}>
          {/* Notification Bell — hide when mini */}
          {!isMini && (
            <div ref={bellRef} style={{ position: 'relative' }}>
              <button
                onClick={openNotificationsPage}
                title="Notifications"
                style={{
                  background: 'none',
                  border: 'none',
                  cursor: 'pointer',
                  color: 'rgba(255,255,255,0.8)',
                  padding: '6px',
                  borderRadius: 8,
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  transition: 'background 0.2s',
                  position: 'relative',
                }}
              >
                <BellIcon />
                {unreadCount > 0 && (
                  <span style={{
                    position: 'absolute',
                    top: 2,
                    right: 2,
                    width: 16,
                    height: 16,
                    borderRadius: '50%',
                    background: '#FF5630',
                    color: '#fff',
                    fontSize: '0.6rem',
                    fontWeight: 700,
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    lineHeight: 1,
                    border: '1.5px solid var(--royal-dark)',
                  }}>
                    {unreadCount > 9 ? '9+' : unreadCount}
                  </span>
                )}
              </button>

            </div>
          )}


        </div>
      </div>

      {/* Role badge — hide when mini */}
      {!isMini && (
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '0 4px 14px', marginBottom: 12, borderBottom: '1px solid rgba(255,255,255,0.08)' }}>
          <div className="user-avatar">{userInitials}</div>
          <div className="user-info">
            <span className="user-name" title={userName}>{userName}</span>
            <span className="user-role">{userSub}</span>
          </div>
        </div>
      )}

      {/* Role badge — hide when mini */}
      {!isMini && (
        <div className="sidebar-role-badge">
          <span className="dot"></span>
          <span>{roleKey === 'student' ? 'Team member' : role}</span>
        </div>
      )}

      <ul className="nav-list">
        {navItems.map((item, i) => (
          <li
            key={i}
            className={`nav-item${i === activeIndex ? ' active' : ''}`}
            onClick={() => setActive(i)}
            title={isMini ? item.label : ''}
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: isMini ? 'center' : 'flex-start',
              gap: '14px',
              padding: isMini ? '12px 10px' : '12px 14px',
              cursor: 'pointer',
              whiteSpace: 'nowrap',
            }}
          >
            <span className="nav-icon" style={{ display: 'flex', alignItems: 'center', flexShrink: 0 }}>
              {Icons[item.label] || defaultIcon}
            </span>
            {!isMini && (
              <span style={{ fontSize: '0.95rem', fontWeight: i === activeIndex ? 600 : 500, whiteSpace: 'nowrap' }}>
                {item.label}
              </span>
            )}
          </li>
        ))}
      </ul>

      <div className="sidebar-user" style={{ justifyContent: isMini ? 'center' : 'flex-start', flexDirection: 'column', alignItems: 'stretch', gap: 16 }}>
        {!isMini && (
          <button onClick={logout} title="Logout" style={{
            display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
            width: '100%', padding: '10px', borderRadius: 8,
            background: 'rgba(255,86,48,0.1)', color: '#FF5630',
            border: '1px solid rgba(255,86,48,0.2)', cursor: 'pointer',
            fontWeight: 600, transition: 'all 0.2s'
          }}
          onMouseOver={(e) => e.currentTarget.style.background = 'rgba(255,86,48,0.2)'}
          onMouseOut={(e) => e.currentTarget.style.background = 'rgba(255,86,48,0.1)'}
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
              <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"></path>
              <polyline points="16 17 21 12 16 7"></polyline>
              <line x1="21" y1="12" x2="9" y2="12"></line>
            </svg>
            Logout
          </button>
        )}
        {isMini && (
          <button onClick={logout} title="Logout" style={{
            background: 'none', color: '#FF5630', border: 'none', cursor: 'pointer', padding: '8px',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            borderRadius: 8, transition: 'background 0.2s'
          }}
          onMouseOver={(e) => e.currentTarget.style.background = 'rgba(255,86,48,0.1)'}
          onMouseOut={(e) => e.currentTarget.style.background = 'none'}
          >
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
              <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"></path>
              <polyline points="16 17 21 12 16 7"></polyline>
              <line x1="21" y1="12" x2="9" y2="12"></line>
            </svg>
          </button>
        )}
      </div>
    </nav>
  )
}

