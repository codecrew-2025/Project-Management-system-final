export default function TaskRow({ task, studentName, onOpenDrive, onEdit }) {
  const badge = statusToBadge(task.status)

  return (
    <tr>
      <td style={{ fontWeight: 600, color: 'var(--text-head)' }}>{task.title}</td>
      <td style={{ color: 'var(--text-body)' }}>{studentName || 'Unassigned'}</td>
      <td style={{ color: 'var(--text-muted)' }}>{task.deadline ? formatDate(task.deadline) : 'TBD'}</td>
      <td><span className={`badge ${badge}`}>{statusLabel(task.status)}</span></td>
      <td style={{ width: 56 }}>
        {task.drive_folder_link ? (
          <button
            type="button"
            className="btn-outline"
            style={{ padding: '6px 10px', display: 'inline-flex', alignItems: 'center', gap: 8 }}
            onClick={() => onOpenDrive?.(task.drive_folder_link)}
            title="Open drive folder"
          >
            <span style={{ fontSize: '1rem' }}>📁</span>
            <span style={{ fontSize: '0.8rem' }}>Open</span>
          </button>
        ) : (
          <span style={{ color: 'var(--text-hint)' }}>—</span>
        )}
      </td>
      <td style={{ width: 80 }}>
        {onEdit ? (
          <button
            type="button"
            className="btn-outline"
            style={{ padding: '6px 10px', display: 'inline-flex', alignItems: 'center', gap: 6, borderColor: 'var(--royal-border)', color: 'var(--royal)' }}
            onClick={onEdit}
            title="Edit task"
          >
            <span style={{ fontSize: '0.9rem' }}>✏️</span>
            <span style={{ fontSize: '0.8rem', fontWeight: 600 }}>Edit</span>
          </button>
        ) : (
          <span style={{ color: 'var(--text-hint)' }}>—</span>
        )}
      </td>
    </tr>
  )
}

function statusToBadge(status) {
  if (status === 'completed') return 'badge-green'
  if (status === 'rejected') return 'badge-red'
  if (status === 'in_progress') return 'badge-amber'
  return 'badge-amber'
}

function statusLabel(status) {
  if (status === 'in_progress') return 'IN PROGRESS'
  return String(status || 'pending').toUpperCase()
}

function formatDate(value) {
  try {
    const d = new Date(value)
    return d.toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' })
  } catch {
    return String(value)
  }
}
