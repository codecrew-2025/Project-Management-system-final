import { useState, useEffect } from 'react'
import { createProject, createTask, submitStudentWork, sendStudentMessage } from '../lib/api'
import { generateProjectReportPdf } from '../lib/reportPdf'

/* ── Slide-in Panel Drawer ─────────────────────────── */
export default function ActionModal({ isOpen, onClose, actionName, actionPayload, onSuccess, taskOptions = [] }) {
  const [phase, setPhase] = useState('idle') // idle | submitting | done
  const [error, setError] = useState('')

  useEffect(() => {
    if (isOpen) { setPhase('idle'); setError('') }
  }, [isOpen, actionName])

  if (!isOpen) return null

  const submitForm = async (e) => {
    if (e && e.preventDefault) e.preventDefault()
    setPhase('submitting')

    const formData = new FormData(e.target)
    const data = Object.fromEntries(formData.entries())
    let user = null
    try {
      const raw = sessionStorage.getItem('pf_user') || localStorage.getItem('pf_user')
      user = raw ? JSON.parse(raw) : null
    } catch {
      user = null
    }

    try {
      if (actionName === 'Create New Project') {
        await createProject(data)
      } else if (actionName === 'Create Task Issue') {
        await createTask(data)
      } else if (actionName === 'Submit Pull Request') {
        const selectedTaskOption = (Array.isArray(taskOptions) ? taskOptions : []).find(
          (opt) => String(opt?.value || '') === String(data.taskSelection || '')
        )
        const resolvedTaskTitle = selectedTaskOption?.label || data.taskSelection || data.task || data.title
        const resolvedTaskId = selectedTaskOption?.task_id || ''

        await submitStudentWork({
          student_id: user?.id,
          student_email: user?.email,
          task: resolvedTaskTitle,
          task_id: resolvedTaskId,
          title: resolvedTaskTitle,
          type: 'Pull Request',
          github_link: data.githubLink,
          screenshot_link: data.screenshotLink,
          video_link: data.videoLink || null,
          pr_link: data.githubLink,
          summary: data.summary,
        })
      } else if (actionName === 'Send Message') {
        await sendStudentMessage({
          student_id: user?.id,
          student_email: user?.email,
          to: data.to,
          message_type: data.messageType,
          subject: data.subject,
          message: data.message,
        })
      } else if (actionName === 'Export Report') {
        const reportMeta = {
          reportType: data.reportType,
          period: data.timePeriod,
          format: data.format,
          preparedBy: actionPayload?.preparedBy || 'ProjectFlow Director',
          generatedAt: new Date(),
          dashboard: actionPayload?.dashboard || {},
        }
        await generateProjectReportPdf(reportMeta)
      } else {
        // For non-API actions (Schedule Review, etc.)
        await new Promise(resolve => setTimeout(resolve, 900))
      }

      setPhase('done')
      setTimeout(() => {
        onClose()
        if (onSuccess) onSuccess()
      }, 1800)
    } catch (err) {
      console.error(err)
      setPhase('idle')
      setError(err.message || 'Something went wrong. Please try again.')
    }
  }

  return (
    <div style={overlay} onClick={e => e.target === e.currentTarget && onClose()}>
      <div style={panel}>
        {/* Header */}
        <div style={header}>
          <div>
            <span style={{ fontSize: '0.7rem', fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase', color: 'var(--royal)', display: 'block', marginBottom: '4px' }}>
              ProjectFlow
            </span>
            <h2 style={{ margin: 0, fontSize: '1.2rem', fontWeight: 700, color: 'var(--text-head)' }}>
              {actionName}
            </h2>
          </div>
          <button onClick={onClose} style={closeBtn}>
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
          </button>
        </div>

        {/* Body */}
        <div style={body}>
          {phase === 'done' ? (
            <div style={successBox}>
              <div style={checkCircle}>
                <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
                  <polyline points="20 6 9 17 4 12"/>
                </svg>
              </div>
              <h3 style={{ margin: '16px 0 8px', color: 'var(--text-head)', fontWeight: 700 }}>Done!</h3>
              <p style={{ margin: 0, fontSize: '0.9rem', color: 'var(--text-muted)', lineHeight: 1.5 }}>
                {actionName === 'Create New Project'
                  ? 'Project created. The coordinator has been notified.'
                  : actionName === 'Create Task Issue'
                  ? 'Task assigned. The team member will see it on their dashboard.'
                  : 'Action completed and logged successfully.'}
              </p>
            </div>
          ) : (
            <>
              {error && (
                <div style={{ background: '#FFEBE6', border: '1px solid #FF5630', borderRadius: 6, padding: '10px 14px', color: '#BF2600', fontSize: '0.875rem', fontWeight: 500, marginBottom: 4 }}>
                  ⚠ {error}
                </div>
              )}
              <PanelContent actionName={actionName} phase={phase} onSubmit={submitForm} onClose={onClose} taskOptions={taskOptions} />
            </>
          )}
        </div>
      </div>
    </div>
  )
}

/* ── Per-action panel content ───────────────────────── */
function PanelContent({ actionName, phase, onSubmit, onClose, taskOptions }) {
  const isLoading = phase === 'submitting'

  // Director: Create New Project
  if (actionName === 'Create New Project') {
    return (
      <Form title="New Project" onSubmit={onSubmit} onClose={onClose} loading={isLoading} submitLabel="Create Project">
        <Field name="title" label="Project Title" placeholder="e.g. AI-Based Attendance System" required />
        <Field name="coordinator" label="Assigned Coordinator" placeholder="Coordinator name or email" required />
        <Row>
          <Field name="department" label="Department" placeholder="e.g. CSE" />
          <Field name="deadline" label="Deadline" type="date" />
        </Row>
        <Field name="description" label="Description" textarea placeholder="Brief description of project scope and goals..." />
      </Form>
    )
  }

  // Director: Export Report
  if (actionName === 'Export Report') {
    return (
      <Form title="Export Project Report" onSubmit={onSubmit} onClose={onClose} loading={isLoading} submitLabel="Export PDF">
        <SelectField name="reportType" label="Report Type" options={['Project Summary', 'Team member Progress', 'Department Overview', 'KPI Report']} />
        <SelectField name="timePeriod" label="Time Period" options={['Current Semester', 'Last 30 Days', 'Last Quarter', 'All Time']} />
        <SelectField name="format" label="Format" options={['PDF', 'Excel (.xlsx)', 'CSV']} />
        <Note>The report will be generated and downloaded to your device.</Note>
      </Form>
    )
  }

  // Coordinator: Create Task Issue
  if (actionName === 'Create Task Issue') {
    return (
      <Form title="Create Sprint Issue" onSubmit={onSubmit} onClose={onClose} loading={isLoading} submitLabel="Create Issue">
        <Field name="title" label="Issue Title" placeholder="e.g. Implement login module" required />
        <Row>
          <SelectField name="priority" label="Priority" options={['High', 'Medium', 'Low']} />
          <SelectField name="type" label="Type" options={['Task', 'Bug', 'Feature', 'Review']} />
        </Row>
        <Field name="student" label="Assign To (Team member)" placeholder="Team member name or roll number" required />
        <Field name="dueDate" label="Due Date" type="date" />
        <Field name="description" label="Description" textarea placeholder="Describe what needs to be done..." />
      </Form>
    )
  }

  // Coordinator: Schedule Review
  if (actionName === 'Schedule Review') {
    return (
      <Form title="Schedule Project Review" onSubmit={onSubmit} onClose={onClose} loading={isLoading} submitLabel="Schedule">
        <Field label="Review Title" placeholder="e.g. Phase 1 Progress Review" />
        <Row>
          <Field label="Date" type="date" />
          <Field label="Time" type="time" />
        </Row>
        <Field label="Location / Link" placeholder="Room 204 or https://meet.link..." />
        <SelectField label="Project" options={['Smart Campus App', 'ML Grade Predictor', 'E-Learning Platform']} />
        <Field label="Agenda" textarea placeholder="Topics to cover in the review..." />
      </Form>
    )
  }

  // Student: Submit Pull Request
  if (actionName === 'Submit Pull Request') {
    const assignedTasks = Array.isArray(taskOptions) ? taskOptions.filter((o) => o?.label && o?.value) : []

    return (
      <Form title="Daily Work Submission" onSubmit={onSubmit} onClose={onClose} loading={isLoading} submitLabel="Submit Daily Work" submitDisabled={assignedTasks.length === 0}>
        <Field name="title" label="Pull Request Title" placeholder="e.g. Feature: Complete Login UI" required />
        <Field name="branch" label="Branch Name" placeholder="e.g. feature/login-module" />
        <Field name="githubLink" label="GitHub Link" placeholder="https://github.com/your-repo/pull/123" required />
        <Field name="screenshotLink" label="Screenshot Link" placeholder="https://drive.google.com/... or image URL" required />
        <Field name="videoLink" label="Video Demo Link" placeholder="https://drive.google.com/... or YouTube link" />
        <SelectField name="taskSelection" label="Assigned Task" options={assignedTasks.length > 0 ? assignedTasks : [{ label: 'No assigned task', value: '' }]} required={assignedTasks.length > 0} />
        {assignedTasks.length === 0 && (
          <Note>No task is assigned to your account yet. You can submit work only after a task is assigned.</Note>
        )}
        <Field name="summary" label="Summary of Changes" textarea placeholder="Briefly describe what you built or fixed..." required />
      </Form>
    )
  }

  // Student: Send Message
  if (actionName === 'Send Message') {
    return (
      <Form title="Message Coordinator" onSubmit={onSubmit} onClose={onClose} loading={isLoading} submitLabel="Send Message">
        <Field name="to" label="To" placeholder="Coordinator name" defaultValue="Coordinator" required />
        <SelectField name="messageType" label="Message Type" options={['General Query', 'Request Extension', 'Report Issue', 'Request Meeting']} required />
        <Field name="subject" label="Subject" placeholder="e.g. Clarification on Phase 2 requirements" required />
        <Field name="message" label="Message" textarea placeholder="Write your message here..." required />
      </Form>
    )
  }

  // Fallback generic
  return (
    <Form title="Confirm Action" onSubmit={onSubmit} onClose={onClose} loading={isLoading} submitLabel="Confirm">
      <Note>Proceeding with: <strong>{actionName}</strong>. This action will be logged in the audit trail.</Note>
    </Form>
  )
}

/* ── Reusable mini-components ─────────────────────── */
function Form({ children, onSubmit, onClose, loading, submitLabel, submitDisabled = false }) {
  return (
    <form onSubmit={onSubmit} style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: '20px', overflowY: 'auto', paddingRight: '4px' }}>
        {children}
      </div>
      <div style={{ display: 'flex', gap: '12px', justifyContent: 'flex-end', marginTop: '32px', paddingTop: '20px', borderTop: '1px solid var(--royal-border)' }}>
        <button type="button" className="btn-outline" onClick={onClose} disabled={loading} style={{ padding: '10px 20px' }}>Cancel</button>
        <button type="submit" className="btn-primary" disabled={loading || submitDisabled} style={{ padding: '10px 24px', minWidth: '130px' }}>
          {loading ? (
            <span style={{ display: 'flex', alignItems: 'center', gap: '8px', justifyContent: 'center' }}>
              <Spinner /> Processing...
            </span>
          ) : submitLabel}
        </button>
      </div>
    </form>
  )
}

function Field({ name, label, placeholder, type = 'text', textarea, defaultValue, required }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
      <label style={{ fontSize: '0.8rem', fontWeight: 600, color: 'var(--text-head)', letterSpacing: '0.02em' }}>{label}</label>
      {textarea ? (
        <textarea
          name={name}
          defaultValue={defaultValue}
          placeholder={placeholder}
          rows={3}
          style={inputStyle}
          required={required}
        />
      ) : (
        <input name={name} defaultValue={defaultValue} type={type} placeholder={placeholder} style={inputStyle} required={required} />
      )}
    </div>
  )
}

function SelectField({ name, label, options, required }) {
  const normalizedOptions = (options || []).map((option) => {
    if (option && typeof option === 'object') {
      return {
        label: String(option.label || option.value || ''),
        value: String(option.value || option.label || ''),
      }
    }

    return {
      label: String(option || ''),
      value: String(option || ''),
    }
  })

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '6px', flex: 1 }}>
      <label style={{ fontSize: '0.8rem', fontWeight: 600, color: 'var(--text-head)', letterSpacing: '0.02em' }}>{label}</label>
      <select name={name} style={{ ...inputStyle, cursor: 'pointer' }} required={required}>
        {normalizedOptions.map((option, i) => <option key={i} value={option.value}>{option.label}</option>)}
      </select>
    </div>
  )
}

function Row({ children }) {
  return <div style={{ display: 'flex', gap: '16px' }}>{children}</div>
}

function Note({ children }) {
  return (
    <div style={{ background: 'var(--royal-faint)', border: '1px solid var(--royal-border)', borderRadius: '6px', padding: '12px 16px', fontSize: '0.875rem', color: 'var(--text-body)', lineHeight: 1.5 }}>
      {children}
    </div>
  )
}

function Spinner() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" style={{ animation: 'spin 0.8s linear infinite' }}>
      <path d="M12 2v4M12 18v4M4.93 4.93l2.83 2.83M16.24 16.24l2.83 2.83M2 12h4M18 12h4M4.93 19.07l2.83-2.83M16.24 7.76l2.83-2.83"/>
    </svg>
  )
}

/* ── Styles ──────────────────────────────────────────── */
const overlay = {
  position: 'fixed', inset: 0,
  backgroundColor: 'rgba(9, 30, 66, 0.5)',
  backdropFilter: 'blur(4px)',
  zIndex: 9999,
  display: 'flex', alignItems: 'center', justifyContent: 'center',
}

const panel = {
  background: '#fff',
  width: '100%', maxWidth: '520px',
  maxHeight: '90vh',
  borderRadius: '12px',
  boxShadow: '0 24px 48px -8px rgba(9, 30, 66, 0.35)',
  display: 'flex', flexDirection: 'column',
  overflow: 'hidden',
  animation: 'fadeSlideUp 0.3s cubic-bezier(0.2, 0.8, 0.2, 1)',
}

const header = {
  display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start',
  padding: '24px 28px 20px',
  borderBottom: '1px solid var(--royal-border)',
}

const body = {
  padding: '28px',
  flex: 1,
  overflowY: 'auto',
}

const closeBtn = {
  background: 'none', border: 'none', cursor: 'pointer',
  color: 'var(--text-hint)', padding: '4px', borderRadius: '6px',
  display: 'flex', alignItems: 'center', justifyContent: 'center',
  transition: 'background 0.2s, color 0.2s',
}

const successBox = {
  display: 'flex', flexDirection: 'column', alignItems: 'center',
  padding: '40px 20px', textAlign: 'center',
}

const checkCircle = {
  width: '64px', height: '64px', borderRadius: '50%',
  background: 'var(--green)',
  display: 'flex', alignItems: 'center', justifyContent: 'center',
}

const inputStyle = {
  width: '100%', padding: '10px 14px',
  background: 'var(--page-bg)',
  border: '1.5px solid var(--royal-border)',
  borderRadius: '6px',
  fontSize: '0.9rem',
  fontFamily: 'inherit',
  color: 'var(--text-head)',
  outline: 'none',
  resize: 'vertical',
  transition: 'border-color 0.2s',
}
