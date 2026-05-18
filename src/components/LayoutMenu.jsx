import { useState, useEffect, useRef } from 'react'
import '../assets/dashboard.css'

export default function LayoutMenu({ sidebarMode, setSidebarMode }) {
  const [isOpen, setIsOpen] = useState(false)
  const menuRef = useRef(null)

  useEffect(() => {
    function handleClickOutside(event) {
      if (menuRef.current && !menuRef.current.contains(event.target)) {
        setIsOpen(false)
      }
    }
    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [])

  const toggleSidebar = (mode) => {
    setSidebarMode(mode)
    setIsOpen(false)
  }

  const toggleFullscreen = () => {
    if (!document.fullscreenElement) {
      document.documentElement.requestFullscreen().catch(err => {
        console.error(`Error attempting to enable full-screen mode: ${err.message}`)
      })
    } else {
      document.exitFullscreen()
    }
    setIsOpen(false)
  }

  return (
    <div className="layout-menu-container" ref={menuRef} style={{ position: 'relative' }}>
      <button 
        className="btn-layout-toggle"
        onClick={() => setIsOpen(!isOpen)}
        title="Dashboard Settings"
        style={{
          background: isOpen ? 'var(--royal-faint)' : 'none',
          border: 'none',
          cursor: 'pointer',
          color: 'var(--text-body)',
          padding: '8px 12px',
          borderRadius: '6px',
          fontSize: '1.25rem',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          transition: 'all 0.2s',
          marginLeft: '8px'
        }}
      >
        ⋮
      </button>

      {isOpen && (
        <div className="layout-dropdown" style={{
          position: 'absolute',
          top: 'calc(100% + 8px)',
          right: 0,
          width: '220px',
          background: '#fff',
          borderRadius: '12px',
          boxShadow: '0 12px 32px rgba(9, 30, 66, 0.15)',
          border: '1px solid var(--royal-border)',
          zIndex: 1000,
          padding: '8px 0',
          animation: 'fadeSlideUp 0.2s ease-out'
        }}>
          <div style={{ padding: '8px 16px', fontSize: '0.7rem', fontWeight: 700, color: 'var(--text-hint)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
            Sidebar Mode
          </div>
          <MenuButton 
            active={sidebarMode === 'expanded'} 
            onClick={() => toggleSidebar('expanded')}
            icon="📱"
            label="Expanded Sidebar"
          />
          <MenuButton 
            active={sidebarMode === 'mini'} 
            onClick={() => toggleSidebar('mini')}
            icon="➖"
            label="Mini Sidebar"
          />
          <MenuButton 
            active={sidebarMode === 'hidden'} 
            onClick={() => toggleSidebar('hidden')}
            icon="🗔"
            label="Full Content (Zen Mode)"
          />

          <div style={{ height: '1px', background: 'var(--royal-border)', margin: '8px 0' }} />
          
          <MenuButton 
            onClick={toggleFullscreen}
            icon="🕂"
            label={document.fullscreenElement ? "Exit Fullscreen" : "Enter Fullscreen"}
          />
        </div>
      )}
    </div>
  )
}

function MenuButton({ active, onClick, icon, label }) {
  return (
    <button
      onClick={onClick}
      style={{
        width: '100%',
        display: 'flex',
        alignItems: 'center',
        gap: '12px',
        padding: '10px 16px',
        border: 'none',
        background: active ? 'var(--royal-faint)' : 'transparent',
        cursor: 'pointer',
        textAlign: 'left',
        transition: 'all 0.2s',
        color: active ? 'var(--royal)' : 'var(--text-body)',
        fontWeight: active ? 600 : 500,
        fontSize: '0.9rem'
      }}
      className="dropdown-item"
    >
      <span style={{ fontSize: '1.1rem' }}>{icon}</span>
      <span>{label}</span>
      {active && <span style={{ marginLeft: 'auto', fontSize: '0.8rem' }}>✓</span>}
    </button>
  )
}
