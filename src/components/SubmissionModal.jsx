import { useEffect, useMemo, useState } from 'react'
import Modal from './Modal'

export default function SubmissionModal({ isOpen, submission, task, student, module, project, onClose, onReview }) {
  const [comment, setComment] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    if (!isOpen) return
    setSubmitting(false)
    setError('')
    setComment(submission?.coordinator_comment || '')
  }, [isOpen, submission])

  const meta = useMemo(() => {
    const when = submission?.submitted_at ? new Date(submission.submitted_at) : null
    return {
      submittedAt: when ? when.toLocaleString('en-IN', { dateStyle: 'medium', timeStyle: 'short' }) : '—',
    }
  }, [submission])

  async function submit(review_status) {
    if (!submission?.id) return
    setSubmitting(true)
    setError('')

    try {
      await onReview?.({
        submission_id: submission.id,
        review_status,
        coordinator_comment: comment,
      })
      onClose?.()
    } catch (e) {
      setError(e?.message || 'Unable to submit review.')
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <Modal isOpen={isOpen} title="Review Submission" onClose={onClose} width={760}>
      {error && (
        <div style={{ background: '#FFEBE6', border: '1px solid #FF5630', borderRadius: 8, padding: '10px 14px', color: '#BF2600', fontSize: '0.875rem', fontWeight: 600, marginBottom: 12 }}>
          {error}
        </div>
      )}

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: 12, marginBottom: 12 }}>
        <Info label="Team member" value={student?.name || submission?.student_name || submission?.student_email || '—'} />
        <Info label="Project" value={project?.title || submission?.project_title || '—'} />
        <Info label="Module" value={module?.name || submission?.module_name || '—'} />
        <Info label="Task" value={task?.title || submission?.task_title || submission?.task || submission?.title || '—'} />
        <Info label="Submitted At" value={meta.submittedAt} />
        <Info label="Status" value={String(submission?.review_status || 'pending').toUpperCase()} />
      </div>

      <div style={{ display: 'flex', gap: 10, alignItems: 'center', marginBottom: 12 }}>
        <a
          className="btn-outline"
          href={submission?.drive_link || '#'}
          target="_blank"
          rel="noreferrer"
          style={{ pointerEvents: submission?.drive_link ? 'auto' : 'none', opacity: submission?.drive_link ? 1 : 0.6 }}
        >
          Open Drive Link
        </a>
        <span style={{ fontSize: '0.85rem', color: 'var(--text-muted)' }}>{submission?.drive_link ? '' : 'No drive link provided.'}</span>
      </div>

      <div style={{ display: 'grid', gap: 10, marginBottom: 12 }}>
        <LinkRow label="GitHub Link" href={submission?.github_link || submission?.pr_link || ''} emptyText="No GitHub link provided." />
        <LinkRow label="Screenshot" href={submission?.screenshot_link || ''} emptyText="No screenshot link provided." />
        <LinkRow label="Video Demo" href={submission?.video_link || ''} emptyText="No video link provided." />
      </div>

      <div style={{ marginBottom: 12 }}>
        <label style={{ display: 'block', fontSize: '0.8rem', fontWeight: 700, color: 'var(--text-head)', marginBottom: 6 }}>Team member note</label>
        <div style={{ background: 'var(--page-bg)', border: '1px solid var(--royal-border)', borderRadius: 10, padding: 12, color: 'var(--text-body)', fontSize: '0.9rem', lineHeight: 1.6 }}>
          {submission?.note || '—'}
        </div>
      </div>

      <div>
        <label style={{ display: 'block', fontSize: '0.8rem', fontWeight: 700, color: 'var(--text-head)', marginBottom: 6 }}>Coordinator Comment</label>
        <textarea
          rows={4}
          value={comment}
          onChange={(e) => setComment(e.target.value)}
          placeholder="Add your review notes..."
          style={{
            width: '100%',
            padding: '10px 12px',
            borderRadius: 10,
            border: '1px solid var(--royal-border)',
            outline: 'none',
            fontFamily: 'inherit',
          }}
        />
      </div>

      <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10, marginTop: 16 }}>
        <button className="btn-outline" type="button" onClick={onClose} disabled={submitting}>Cancel</button>
      </div>
    </Modal>
  )
}

function Info({ label, value }) {
  return (
    <div style={{ border: '1px solid var(--royal-border)', borderRadius: 10, padding: 12, background: '#fff' }}>
      <div style={{ fontSize: '0.72rem', color: 'var(--text-hint)', textTransform: 'uppercase', letterSpacing: '0.06em', fontWeight: 800, marginBottom: 4 }}>{label}</div>
      <div style={{ fontSize: '0.92rem', color: 'var(--text-head)', fontWeight: 700, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{value}</div>
    </div>
  )
}

function LinkRow({ label, href, emptyText }) {
  const hasLink = Boolean(href)

  return (
    <div style={{ border: '1px solid var(--royal-border)', borderRadius: 10, padding: 12, background: '#fff' }}>
      <div style={{ fontSize: '0.72rem', color: 'var(--text-hint)', textTransform: 'uppercase', letterSpacing: '0.06em', fontWeight: 800, marginBottom: 6 }}>{label}</div>
      {hasLink ? (
        <a href={href} target="_blank" rel="noreferrer" style={{ color: 'var(--royal)', fontWeight: 700, wordBreak: 'break-all' }}>
          Open {label}
        </a>
      ) : (
        <div style={{ fontSize: '0.92rem', color: 'var(--text-muted)', fontWeight: 600 }}>{emptyText}</div>
      )}
    </div>
  )
}
