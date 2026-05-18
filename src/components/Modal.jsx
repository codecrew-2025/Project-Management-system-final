import { useEffect, useId, useRef } from 'react'

export default function Modal({
  isOpen,
  title,
  children,
  onClose,
  width = 720,
  variant = 'center', // center | drawer
}) {
  const titleId = useId()
  const containerRef = useRef(null)

  useEffect(() => {
    if (!isOpen) return

    function onKeyDown(e) {
      if (e.key === 'Escape') onClose?.()
    }

    document.addEventListener('keydown', onKeyDown)
    return () => document.removeEventListener('keydown', onKeyDown)
  }, [isOpen, onClose])

  useEffect(() => {
    if (!isOpen) return

    // Basic focus management: focus the modal container.
    const t = setTimeout(() => {
      containerRef.current?.focus?.()
    }, 0)

    return () => clearTimeout(t)
  }, [isOpen])

  if (!isOpen) return null

  const isDrawer = variant === 'drawer'

  return (
    <div
      style={styles.overlay}
      role="presentation"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onClose?.()
      }}
    >
      <style>{pulseCss}</style>
      <div
        ref={containerRef}
        tabIndex={-1}
        role="dialog"
        aria-modal="true"
        aria-labelledby={title ? titleId : undefined}
        style={{
          ...styles.panel,
          ...(isDrawer ? styles.drawer : styles.center),
          width: isDrawer ? Math.min(520, width) : Math.min(960, width),
        }}
      >
        <div style={styles.header}>
          <div style={{ minWidth: 0 }}>
            {title && (
              <h2 id={titleId} style={styles.title}>
                {title}
              </h2>
            )}
          </div>
          <button type="button" onClick={() => onClose?.()} style={styles.closeBtn} aria-label="Close">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
              <line x1="18" y1="6" x2="6" y2="18" />
              <line x1="6" y1="6" x2="18" y2="18" />
            </svg>
          </button>
        </div>
        <div style={styles.body}>{children}</div>
      </div>
    </div>
  )
}

export function SkeletonBlock({ height = 14, width = '100%', radius = 8, style }) {
  return (
    <div
      className="pf-skeleton"
      style={{
        height,
        width,
        borderRadius: radius,
        background: 'linear-gradient(90deg, #eef2f7 0%, #f6f7fb 40%, #eef2f7 100%)',
        backgroundSize: '200% 100%',
        animation: 'pfPulse 1.2s ease-in-out infinite',
        ...style,
      }}
    />
  )
}

const pulseCss = `
@keyframes pfPulse {
  0% { background-position: 0% 0%; opacity: 0.75; }
  50% { background-position: 100% 0%; opacity: 1; }
  100% { background-position: 0% 0%; opacity: 0.75; }
}
`

const styles = {
  overlay: {
    position: 'fixed',
    inset: 0,
    background: 'rgba(9, 30, 66, 0.55)',
    backdropFilter: 'blur(6px)',
    zIndex: 100000,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 18,
  },
  panel: {
    background: '#fff',
    borderRadius: 14,
    border: '1px solid var(--royal-border)',
    boxShadow: '0 24px 56px rgba(9,30,66,0.28)',
    maxHeight: 'calc(100vh - 36px)',
    overflow: 'hidden',
    outline: 'none',
    animation: 'fadeSlideUp 0.18s ease-out',
  },
  center: {
    alignSelf: 'center',
  },
  drawer: {
    alignSelf: 'stretch',
    marginLeft: 'auto',
    height: '100%',
    borderRadius: '14px 0 0 14px',
  },
  header: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 12,
    padding: '16px 18px',
    borderBottom: '1px solid var(--royal-border)',
    background: '#fff',
  },
  title: {
    margin: 0,
    fontSize: '1.05rem',
    fontWeight: 800,
    color: 'var(--text-head)',
    letterSpacing: '-0.01em',
    whiteSpace: 'nowrap',
    overflow: 'hidden',
    textOverflow: 'ellipsis',
  },
  closeBtn: {
    border: '1px solid var(--royal-border)',
    background: '#fff',
    borderRadius: 10,
    width: 36,
    height: 36,
    cursor: 'pointer',
    color: 'var(--text-muted)',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
    transition: 'all 0.15s ease',
  },
  body: {
    padding: 18,
    overflowY: 'auto',
    maxHeight: 'calc(100vh - 120px)',
  },
}
