import { useEffect, useMemo, useState } from 'react'
import Modal from './Modal'
import { createProjectFull } from '../lib/coordinatorApi'

const DOMAIN_OPTIONS = ['Web Dev', 'ML', 'IoT', 'Mobile', 'Research', 'Other']

export default function CreateProjectModal({ isOpen, coordinator, coordinatorId, previousTeamMembers = [], coordinators = [], simpleMode = false, onClose, onCreated }) {
  const [step, setStep] = useState(1)
  const isSimpleMode = Boolean(simpleMode)
  const totalSteps = isSimpleMode ? 1 : 4

  // For director flow: select or enter coordinator
  const [selectedCoordinatorId, setSelectedCoordinatorId] = useState('')
  const [coordinatorInput, setCoordinatorInput] = useState('')

  // Step 1 — Details
  const [title, setTitle] = useState('')
  const [description, setDescription] = useState('')
  const [client, setClient] = useState('')
  const [domain, setDomain] = useState('Web Dev')
  const [customDomain, setCustomDomain] = useState('')
  const [startDate, setStartDate] = useState('')
  const [deadline, setDeadline] = useState('')

  // Step 2 — Team members
  const [entryStudents, setEntryStudents] = useState([])
  const [manualName, setManualName] = useState('')
  const [manualEmail, setManualEmail] = useState('')
  const [manualRollNo, setManualRollNo] = useState('')
  const [manualPhone, setManualPhone] = useState('')
  const [manualError, setManualError] = useState('')

  // Step 3 — Tasks  [{ id, title, student_email, deadline, description }]
  const [tasks, setTasks] = useState([])
  const [taskTitle, setTaskTitle] = useState('')
  const [taskStudent, setTaskStudent] = useState('')
  const [taskDeadline, setTaskDeadline] = useState('')
  const [taskDesc, setTaskDesc] = useState('')
  const [taskError, setTaskError] = useState('')
  const [editingTaskId, setEditingTaskId] = useState('')
  const [reviewEditingTaskId, setReviewEditingTaskId] = useState('')
  const [reviewTaskDraft, setReviewTaskDraft] = useState(null)
  const [reviewEditingMemberId, setReviewEditingMemberId] = useState('')
  const [reviewMemberDraft, setReviewMemberDraft] = useState(null)

  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState('')

  const allAssignedStudents = useMemo(
    () => entryStudents.filter((s) => s.checked),
    [entryStudents]
  )

  const normalizedPreviousTeamMembers = useMemo(() => {
    const rawMembers = Array.isArray(previousTeamMembers) ? previousTeamMembers : []

    const byEmail = new Map()
    rawMembers.forEach((member) => {
      const email = String(member?.email || '').trim().toLowerCase()
      if (!email || byEmail.has(email)) return

      byEmail.set(email, {
        id: `prev:${email}`,
        name: String(member?.name || '').trim() || email,
        email,
        roll_no: String(member?.roll_no || '').trim(),
        phone: String(member?.phone || '').trim() || null,
        checked: true,
        module_name: String(member?.module_name || '').trim(),
      })
    })

    return Array.from(byEmail.values())
  }, [previousTeamMembers])

  const taskAssignableStudents = useMemo(() => {
    const byEmail = new Map()

    for (const student of allAssignedStudents) {
      const email = String(student?.email || '').trim().toLowerCase()
      if (!email || byEmail.has(email)) continue
      byEmail.set(email, {
        ...student,
        name: String(student?.name || '').trim() || email,
        email,
      })
    }

    for (const member of normalizedPreviousTeamMembers) {
      const email = String(member?.email || '').trim().toLowerCase()
      if (!email || byEmail.has(email)) continue
      byEmail.set(email, {
        ...member,
        name: String(member?.name || '').trim() || email,
        email,
      })
    }

    return Array.from(byEmail.values())
  }, [allAssignedStudents, normalizedPreviousTeamMembers])

  useEffect(() => {
    if (!isOpen) return
    setStep(1)
    setSelectedCoordinatorId('')
    setCoordinatorInput('')
    setTitle(''); setDescription(''); setClient(''); setDomain('Web Dev'); setCustomDomain('')
    setStartDate(''); setDeadline('')
    setEntryStudents([])
    setManualName(''); setManualEmail(''); setManualRollNo(''); setManualPhone(''); setManualError('')
    setTasks([])
    setTaskTitle(''); setTaskStudent(''); setTaskDeadline(''); setTaskDesc(''); setTaskError(''); setEditingTaskId('')
    setReviewEditingTaskId(''); setReviewTaskDraft(null)
    setReviewEditingMemberId(''); setReviewMemberDraft(null)
    setSubmitting(false); setError('')

    if (coordinator) {
      const coordinatorValue = coordinator.id || coordinator.email || ''
      if (coordinatorValue) {
        if (Array.isArray(coordinators) && coordinators.length > 0) {
          const found = coordinators.find((c) => (c.id && c.id === coordinator.id) || (c.email && c.email === coordinator.email))
          setSelectedCoordinatorId(found ? (found.id || found.email) : coordinatorValue)
          setCoordinatorInput(found ? (found.name || found.email) : (coordinator.name || coordinator.email || ''))
        } else {
          setCoordinatorInput(coordinator.name || coordinator.email || '')
        }
      }
    }
  }, [isOpen])

  // Auto-select first assigned student when entering step 3
  useEffect(() => {
    if (step === 3 && taskAssignableStudents.length > 0 && !taskStudent) {
      setTaskStudent(taskAssignableStudents[0].email)
    }
  }, [step, taskAssignableStudents, taskStudent])

  function validateStep(nextStep) {
    setError('')
    if (nextStep === 2) {
      // Coordinator is always required
      if (!coordinatorInput.trim() && !selectedCoordinatorId) return setError('Coordinator name is required.'), false
      if (isSimpleMode) return true
      if (!client.trim()) return setError('Client is required.'), false
      if (!title.trim()) return setError('Project title is required.'), false
      if (!description.trim()) return setError('Project description is required.'), false
      if (!domain) return setError('Domain is required.'), false
      if (domain === 'Other' && !customDomain.trim()) return setError('Please specify the custom domain.'), false
      if (!startDate) return setError('Start date is required.'), false
      if (!deadline) return setError('Deadline is required.'), false
      if (new Date(deadline) <= new Date(startDate)) return setError('Deadline must be after start date.'), false
      return true
    }
    if (nextStep === 3) {
      if (isSimpleMode) return true
      if (taskAssignableStudents.length === 0) return setError('Assign at least 1 team member.'), false
      const missingModule = allAssignedStudents.find((s) => !String(s.module_name || '').trim())
      if (missingModule) return setError('Enter module for each checked team member.'), false
      return true
    }
    return true
  }

  function addManualStudent() {
    setManualError('')
    const name = String(manualName || '').trim()
    const email = String(manualEmail || '').trim().toLowerCase()
    const phone = String(manualPhone || '').trim()
    if (!name || !email) return setManualError('Enter both team member name and email.')
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return setManualError('Enter a valid email.')
    if (phone && !/^\+?[0-9\s()-]{7,20}$/.test(phone)) return setManualError('Enter a valid phone number.')
    if (entryStudents.some((s) => s.email === email)) return setManualError('Email already added.')
    setEntryStudents((prev) => [...prev, { id: `${email}:${Date.now()}`, name, email, roll_no: manualRollNo.trim(), phone: phone || null, checked: false, module_name: '' }])
    setManualName(''); setManualEmail(''); setManualRollNo(''); setManualPhone('')
  }

  function addTask() {
    setTaskError('')
    if (!taskTitle.trim()) return setTaskError('Task title is required.')
    if (!taskStudent) return setTaskError('Select a team member.')
    const student = taskAssignableStudents.find(s => s.email === taskStudent)
    const nextTask = {
      id: editingTaskId || `task-${Date.now()}`,
      title: taskTitle.trim(),
      description: taskDesc.trim(),
      student_email: taskStudent,
      student_name: student?.name || taskStudent,
      module_name: student?.module_name || '',
      deadline: taskDeadline || null,
    }

    setTasks((prev) => {
      if (!editingTaskId) return [...prev, nextTask]
      return prev.map((task) => (task.id === editingTaskId ? nextTask : task))
    })

    setTaskTitle(''); setTaskDesc(''); setTaskDeadline(''); setEditingTaskId('')
  }

  function editTask(taskId) {
    const task = tasks.find((item) => item.id === taskId)
    if (!task) return

    setEditingTaskId(task.id)
    setTaskTitle(task.title || '')
    setTaskStudent(task.student_email || '')
    setTaskDeadline(task.deadline || '')
    setTaskDesc(task.description || '')
    setTaskError('')
    setStep(3)
  }

  function deleteTask(taskId) {
    setTasks((prev) => prev.filter((task) => task.id !== taskId))
    setEditingTaskId((current) => (current === taskId ? '' : current))
    setReviewEditingTaskId((current) => (current === taskId ? '' : current))
    setReviewTaskDraft((current) => (current?.id === taskId ? null : current))
  }

  function editMember(memberId) {
    const member = entryStudents.find((item) => item.id === memberId)
    if (!member) return

    setReviewEditingMemberId(member.id)
    setReviewMemberDraft({
      id: member.id,
      name: member.name || '',
      email: member.email || '',
      roll_no: member.roll_no || '',
      phone: member.phone || '',
      module_name: member.module_name || '',
    })
  }

  function deleteMember(memberId) {
    const member = entryStudents.find((item) => item.id === memberId)
    if (!member) return

    setEntryStudents((prev) => prev.filter((item) => item.id !== memberId))
    setTasks((prev) => prev.filter((task) => String(task.student_email || '').toLowerCase() !== String(member.email || '').toLowerCase()))

    setTaskStudent((current) => (String(current || '').toLowerCase() === String(member.email || '').toLowerCase() ? '' : current))
    setEditingTaskId((current) => {
      const currentTask = tasks.find((task) => task.id === current)
      return currentTask && String(currentTask.student_email || '').toLowerCase() === String(member.email || '').toLowerCase()
        ? ''
        : current
    })
    setReviewEditingMemberId((current) => (current === memberId ? '' : current))
    setReviewMemberDraft((current) => (current?.id === memberId ? null : current))
  }

  function saveReviewMember() {
    if (!reviewEditingMemberId || !reviewMemberDraft) return

    const nextName = String(reviewMemberDraft.name || '').trim()
    const nextEmail = String(reviewMemberDraft.email || '').trim().toLowerCase()
    const nextRollNo = String(reviewMemberDraft.roll_no || '').trim()
    const nextPhone = String(reviewMemberDraft.phone || '').trim()
    const nextModule = String(reviewMemberDraft.module_name || '').trim()

    if (!nextName || !nextEmail) {
      setError('Member name and email are required.')
      return
    }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(nextEmail)) {
      setError('Enter a valid email.')
      return
    }

    setEntryStudents((prev) => prev.map((member) => member.id === reviewEditingMemberId ? {
      ...member,
      name: nextName,
      email: nextEmail,
      roll_no: nextRollNo,
      phone: nextPhone || null,
      module_name: nextModule,
    } : member))

    setTasks((prev) => prev.map((task) => {
      if (String(task.student_email || '').toLowerCase() !== String(reviewMemberDraft.email || '').toLowerCase()) return task
      return {
        ...task,
        student_email: nextEmail,
        student_name: nextName,
      }
    }))

    setReviewEditingMemberId('')
    setReviewMemberDraft(null)
    setError('')
  }

  function cancelReviewMemberEdit() {
    setReviewEditingMemberId('')
    setReviewMemberDraft(null)
    setError('')
  }

  function editReviewTask(taskId) {
    const task = tasks.find((item) => item.id === taskId)
    if (!task) return

    setReviewEditingTaskId(task.id)
    setReviewTaskDraft({
      id: task.id,
      title: task.title || '',
      description: task.description || '',
      student_email: task.student_email || '',
      deadline: task.deadline || '',
    })
  }

  function saveReviewTask() {
    if (!reviewEditingTaskId || !reviewTaskDraft) return

    const nextTitle = String(reviewTaskDraft.title || '').trim()
    const nextStudentEmail = String(reviewTaskDraft.student_email || '').trim().toLowerCase()
    const nextDeadline = String(reviewTaskDraft.deadline || '').trim()
    const student = taskAssignableStudents.find((item) => item.email === nextStudentEmail)

    if (!nextTitle) {
      setError('Task title is required.')
      return
    }
    if (!nextStudentEmail) {
      setError('Select a team member.')
      return
    }

    setTasks((prev) => prev.map((task) => task.id === reviewEditingTaskId ? {
      ...task,
      title: nextTitle,
      description: String(reviewTaskDraft.description || '').trim(),
      student_email: nextStudentEmail,
      student_name: student?.name || nextStudentEmail,
      module_name: student?.module_name || '',
      deadline: nextDeadline || null,
    } : task))

    setReviewEditingTaskId('')
    setReviewTaskDraft(null)
    setError('')
  }

  function cancelReviewTaskEdit() {
    setReviewEditingTaskId('')
    setReviewTaskDraft(null)
    setError('')
  }

  async function handleCreate() {
    if (submitting) return
    setError('')
    setSubmitting(true)
    try {
      const studentsPayload = allAssignedStudents.map((s) => ({
        student_name: String(s.name || '').trim(),
        student_email: String(s.email || '').trim().toLowerCase(),
        roll_no: String(s.roll_no || '').trim() || null,
        phone: String(s.phone || '').trim() || null,
        role: null,
        module_name: s.module_name || null,
        student_note: null,
        drive_folder_link: null,
        github_link: null,
      }))

      const manualProfiles = entryStudents
        .map((s) => ({ name: String(s.name || '').trim(), email: String(s.email || '').trim().toLowerCase(), role: 'student', phone: String(s.phone || '').trim() || null }))
        .filter((s) => s.name && s.email)

      // Resolve coordinator info: if this modal was opened by a coordinator, use that; otherwise use selectedCoordinatorId or coordinatorInput
      let payloadCoordinatorId = coordinatorId || null
      let payloadCoordinatorEmail = coordinator?.email || null
      let payloadCoordinatorName = coordinator?.name || 'Coordinator'

      if (!payloadCoordinatorId) {
        if (selectedCoordinatorId) {
          const sel = (coordinators || []).find(c => (c.id && c.id === selectedCoordinatorId) || (c.email && c.email === selectedCoordinatorId))
          if (sel) {
            payloadCoordinatorId = sel.id || null
            payloadCoordinatorEmail = sel.email || null
            payloadCoordinatorName = sel.name || sel.email || 'Coordinator'
          }
        } else if (coordinatorInput) {
          const input = String(coordinatorInput || '').trim()
          if (/@/.test(input)) {
            payloadCoordinatorEmail = input
            payloadCoordinatorName = input.split('@')[0]
          } else if (input) {
            payloadCoordinatorName = input
          }
        }
      }

      const created = await createProjectFull({
        userProfiles: [coordinator, ...manualProfiles].filter(Boolean),
        project: {
          coordinator_id: payloadCoordinatorId,
          coordinator_email: payloadCoordinatorEmail || null,
          coordinator_name: String(payloadCoordinatorName || 'Coordinator').trim(),
          title: title.trim(),
          description: description.trim(),
          client_notes: client.trim(),
          domain: domain === 'Other' && customDomain.trim() ? customDomain.trim() : domain,
          start_date: startDate,
          deadline,
        },
        students: studentsPayload,
        modules: [],
        tasks,
      })

      onCreated?.(created)
      onClose?.()
    } catch (e) {
      setError(e?.message || 'Unable to create project.')
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <Modal isOpen={isOpen} title="Create Project" onClose={onClose} width={960}>
      {error && (
        <div style={{ background: '#FFEBE6', border: '1px solid #FF5630', borderRadius: 8, padding: '10px 14px', color: '#BF2600', fontSize: '0.875rem', fontWeight: 600, marginBottom: 12 }}>
          {error}
        </div>
      )}

      {!isSimpleMode && <Stepper step={step} totalSteps={totalSteps} />}

      {/* ── Step 1: Details ── */}
      {step === 1 && (
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14 }}>
          <Field label="Client" required span>
            <input value={client} onChange={(e) => setClient(e.target.value)} style={inputStyle} placeholder="Client name or brief" />
          </Field>
          <Field label="Title" required>
            <input value={title} onChange={(e) => setTitle(e.target.value)} style={inputStyle} placeholder="e.g. Smart Campus App" />
          </Field>
              <Field label="Coordinator" required>
                <input
                  list="coordinator-list"
                  value={coordinatorInput}
                  onChange={(e) => {
                    const val = e.target.value;
                    setCoordinatorInput(val);
                    if (Array.isArray(coordinators) && coordinators.length > 0) {
                      const sel = coordinators.find((c) => c.name === val || c.email === val);
                      setSelectedCoordinatorId(sel ? (sel.id || sel.email) : '');
                    }
                  }}
                  style={inputStyle}
                  placeholder="Type or choose coordinator"
                  autoComplete="off"
                />
                {Array.isArray(coordinators) && coordinators.length > 0 && (
                  <datalist id="coordinator-list">
                    {coordinators.map((c) => (
                      <option key={c.id || c.email} value={c.name || c.email}>
                        {c.email !== c.name ? c.email : ''}
                      </option>
                    ))}
                  </datalist>
                )}
              </Field>
          <Field label="Domain" required>
            <select value={domain} onChange={(e) => { setDomain(e.target.value); if (e.target.value !== 'Other') setCustomDomain('') }} style={{ ...inputStyle, cursor: 'pointer' }}>
              {DOMAIN_OPTIONS.map((d) => <option key={d} value={d}>{d}</option>)}
            </select>
            {domain === 'Other' && (
              <input
                value={customDomain}
                onChange={(e) => setCustomDomain(e.target.value)}
                style={{ ...inputStyle, marginTop: 8 }}
                placeholder="Enter custom domain"
                autoFocus
              />
            )}
          </Field>
          <Field label="Start Date">
            <input type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)} style={inputStyle} />
          </Field>
          <Field label="Deadline" required>
            <input type="date" value={deadline} onChange={(e) => setDeadline(e.target.value)} style={inputStyle} />
          </Field>
          <Field label="Description" required span>
            <textarea value={description} onChange={(e) => setDescription(e.target.value)} style={{ ...inputStyle, minHeight: 90, resize: 'vertical' }} placeholder="Scope, deliverables, expectations" />
          </Field>
        </div>
      )}

      {/* ── Step 2: Assign Team Members ── */}
      {!isSimpleMode && step === 2 && (
        <div>
          <div style={{ marginBottom: 12, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <div style={{ fontWeight: 900, color: 'var(--text-head)', fontSize: '1rem' }}>Entry Team Members</div>
            <span className="badge badge-green">{allAssignedStudents.length} Assigned</span>
          </div>
          <div style={{ border: '1px solid var(--royal-border)', borderRadius: 12, padding: 12, background: '#fff' }}>
            <div style={{ fontSize: '0.85rem', color: 'var(--text-muted)', marginBottom: 10 }}>
              Add team member name, phone, and email. Check to assign and enter their module.
            </div>
            {manualError && <div style={{ color: 'var(--red)', fontWeight: 800, marginBottom: 10 }}>{manualError}</div>}
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr 1fr auto', gap: 10, alignItems: 'center' }}>
              <input value={manualName} onChange={(e) => setManualName(e.target.value)} style={inputStyle} placeholder="Team member name" />
              <input value={manualRollNo} onChange={(e) => setManualRollNo(e.target.value)} style={inputStyle} placeholder="ID" />
              <input value={manualPhone} onChange={(e) => setManualPhone(e.target.value)} style={inputStyle} placeholder="Phone number" />
              <input value={manualEmail} onChange={(e) => setManualEmail(e.target.value)} style={inputStyle} placeholder="Team member email" />
              <button type="button" className="btn-primary" onClick={addManualStudent} style={{ height: 42 }}>Add Team Member</button>
            </div>
            {entryStudents.length > 0 && (
              <div style={{ marginTop: 12, border: '1px solid var(--royal-border)', borderRadius: 12, overflow: 'hidden' }}>
                <div style={{ display: 'grid', gridTemplateColumns: '32px 1fr 1fr 1fr 1fr 1fr 90px', gap: 10, padding: '10px 12px', background: 'var(--page-bg)', fontWeight: 800, color: 'var(--text-head)', fontSize: '0.82rem' }}>
                  <span>Pick</span><span>Name</span><span>ID</span><span>Phone</span><span>Email</span><span>Module</span><span>Action</span>
                </div>
                <div style={{ maxHeight: 300, overflowY: 'auto' }}>
                  {entryStudents.map((s) => (
                    <div key={s.id} style={{ display: 'grid', gridTemplateColumns: '32px 1fr 1fr 1fr 1fr 1fr 90px', gap: 10, padding: '10px 12px', alignItems: 'center', borderTop: '1px solid var(--royal-border)' }}>
                      <input type="checkbox" checked={Boolean(s.checked)} onChange={(e) => setEntryStudents(prev => prev.map(x => x.id === s.id ? { ...x, checked: e.target.checked } : x))} />
                      <input value={s.name} onChange={(e) => setEntryStudents(prev => prev.map(x => x.id === s.id ? { ...x, name: e.target.value } : x))} style={inputStyle} placeholder="Name" />
                      <input value={s.roll_no || ''} onChange={(e) => setEntryStudents(prev => prev.map(x => x.id === s.id ? { ...x, roll_no: e.target.value } : x))} style={inputStyle} placeholder="ID" />
                      <input value={s.phone || ''} onChange={(e) => setEntryStudents(prev => prev.map(x => x.id === s.id ? { ...x, phone: e.target.value } : x))} style={inputStyle} placeholder="Phone" />
                      <input value={s.email} onChange={(e) => setEntryStudents(prev => prev.map(x => x.id === s.id ? { ...x, email: e.target.value.toLowerCase() } : x))} style={inputStyle} placeholder="Email" />
                      <input value={s.module_name} onChange={(e) => setEntryStudents(prev => prev.map(x => x.id === s.id ? { ...x, module_name: e.target.value } : x))} style={inputStyle} placeholder="Module" disabled={!s.checked} />
                      <button type="button" className="btn-outline" onClick={() => setEntryStudents(prev => prev.filter(x => x.id !== s.id))} style={{ padding: '6px 10px', borderColor: '#FF5630', color: '#BF2600' }}>Remove</button>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* ── Step 3: Tasks ── */}
      {!isSimpleMode && step === 3 && (
        <div>
          <div style={{ marginBottom: 12, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <div style={{ fontWeight: 900, color: 'var(--text-head)', fontSize: '1rem' }}>Assign Tasks</div>
            <span className="badge badge-amber">{tasks.length} Task{tasks.length !== 1 ? 's' : ''}</span>
          </div>

          <div style={{ border: '1px solid var(--royal-border)', borderRadius: 12, padding: 14, background: '#fff', marginBottom: 14 }}>
            <div style={{ fontSize: '0.85rem', color: 'var(--text-muted)', marginBottom: 12 }}>
              Add tasks for each assigned team member. Team members will see these in their dashboard.
            </div>
            {taskError && <div style={{ color: 'var(--red)', fontWeight: 800, marginBottom: 10 }}>{taskError}</div>}

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginBottom: 10 }}>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                <label style={{ fontSize: '0.78rem', fontWeight: 800, color: 'var(--text-head)' }}>Task Title <span style={{ color: 'var(--red)' }}>*</span></label>
                <input value={taskTitle} onChange={(e) => setTaskTitle(e.target.value)} style={inputStyle} placeholder="e.g. Build login page" />
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                <label style={{ fontSize: '0.78rem', fontWeight: 800, color: 'var(--text-head)' }}>Assign To <span style={{ color: 'var(--red)' }}>*</span></label>
                <select value={taskStudent} onChange={(e) => setTaskStudent(e.target.value)} style={{ ...inputStyle, cursor: 'pointer' }}>
                  <option value="">Select team member</option>
                  {taskAssignableStudents.map(s => (
                    <option key={s.email} value={s.email}>
                      {s.name}{s.module_name ? ` (${s.module_name})` : ''}{normalizedPreviousTeamMembers.some(m => m.email === s.email) && !allAssignedStudents.some(a => a.email === s.email) ? ' [previous]' : ''}
                    </option>
                  ))}
                </select>
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                <label style={{ fontSize: '0.78rem', fontWeight: 800, color: 'var(--text-head)' }}>Deadline</label>
                <input type="date" value={taskDeadline} onChange={(e) => setTaskDeadline(e.target.value)} style={inputStyle} />
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                <label style={{ fontSize: '0.78rem', fontWeight: 800, color: 'var(--text-head)' }}>Description</label>
                <input value={taskDesc} onChange={(e) => setTaskDesc(e.target.value)} style={inputStyle} placeholder="Optional details" />
              </div>
            </div>
          </div>

          {tasks.length > 0 && (
            <div style={{ border: '1px solid var(--royal-border)', borderRadius: 12, overflow: 'hidden' }}>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr auto', gap: 10, padding: '10px 14px', background: 'var(--page-bg)', fontWeight: 800, color: 'var(--text-head)', fontSize: '0.82rem' }}>
                <span>Task</span><span>Team Member</span><span>Deadline</span><span>Remove</span>
              </div>
              {tasks.map((t) => (
                <div key={t.id} style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr auto', gap: 10, padding: '10px 14px', alignItems: 'center', borderTop: '1px solid var(--royal-border)' }}>
                  <div>
                    <div style={{ fontWeight: 700, fontSize: '0.88rem', color: 'var(--text-head)' }}>{t.title}</div>
                    {t.description && <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>{t.description}</div>}
                  </div>
                  <div>
                    <div style={{ fontWeight: 600, fontSize: '0.85rem' }}>{t.student_name}</div>
                    <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>{t.module_name}</div>
                  </div>
                  <span style={{ fontSize: '0.82rem', color: 'var(--text-muted)' }}>{t.deadline || '—'}</span>
                  <button type="button" className="btn-outline" onClick={() => setTasks(prev => prev.filter(x => x.id !== t.id))} style={{ padding: '4px 10px', borderColor: '#FF5630', color: '#BF2600', fontSize: '0.78rem' }}>✕</button>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* ── Step 4: Review ── */}
      {!isSimpleMode && step === 4 && (
        <div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 12, marginBottom: 14 }}>
            <SummaryCard label="Client" value={client || '—'} />
            <SummaryCard label="Title" value={title || '—'} />
            <SummaryCard label="Domain" value={domain || '—'} />
            <SummaryCard label="Start" value={startDate || '—'} />
            <SummaryCard label="Deadline" value={deadline || '—'} />
            <SummaryCard label="Team members" value={`${allAssignedStudents.length}`} />
          </div>
          <div className="card" style={{ marginBottom: 14 }}>
            <div className="card-head"><h2 className="card-title">Assigned Team Members</h2></div>
            <table className="data-table">
              <thead><tr><th>Name</th><th>ID</th><th>Phone</th><th>Email</th><th>Module</th><th>Actions</th></tr></thead>
              <tbody>
                {allAssignedStudents.map((s) => (
                  <tr key={s.id}>
                    {reviewEditingMemberId === s.id ? (
                      <>
                        <td><input value={reviewMemberDraft?.name || ''} onChange={(e) => setReviewMemberDraft((prev) => ({ ...(prev || {}), name: e.target.value }))} style={inputStyle} /></td>
                        <td><input value={reviewMemberDraft?.roll_no || ''} onChange={(e) => setReviewMemberDraft((prev) => ({ ...(prev || {}), roll_no: e.target.value }))} style={inputStyle} /></td>
                        <td><input value={reviewMemberDraft?.phone || ''} onChange={(e) => setReviewMemberDraft((prev) => ({ ...(prev || {}), phone: e.target.value }))} style={inputStyle} /></td>
                        <td><input value={reviewMemberDraft?.email || ''} onChange={(e) => setReviewMemberDraft((prev) => ({ ...(prev || {}), email: e.target.value }))} style={inputStyle} /></td>
                        <td><input value={reviewMemberDraft?.module_name || ''} onChange={(e) => setReviewMemberDraft((prev) => ({ ...(prev || {}), module_name: e.target.value }))} style={inputStyle} /></td>
                        <td>
                          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                            <button type="button" className="btn-primary" onClick={saveReviewMember} style={{ padding: '6px 12px', fontSize: '0.78rem' }}>
                              Save
                            </button>
                            <button type="button" className="btn-outline" onClick={cancelReviewMemberEdit} style={{ padding: '6px 12px', fontSize: '0.78rem' }}>
                              Cancel
                            </button>
                            <button type="button" className="btn-outline" onClick={() => deleteMember(s.id)} style={{ padding: '6px 12px', borderColor: '#FF5630', color: '#BF2600', fontSize: '0.78rem' }}>
                              Delete
                            </button>
                          </div>
                        </td>
                      </>
                    ) : (
                      <>
                        <td style={{ fontWeight: 700 }}>{s.name}</td>
                        <td style={{ color: 'var(--text-muted)' }}>{s.roll_no || '—'}</td>
                        <td style={{ color: 'var(--text-muted)' }}>{s.phone || '—'}</td>
                        <td style={{ color: 'var(--text-muted)' }}>{s.email}</td>
                        <td>{s.module_name || '—'}</td>
                        <td>
                          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                            <button type="button" className="btn-outline" onClick={() => editMember(s.id)} style={{ padding: '6px 12px', fontSize: '0.78rem' }}>
                              Edit
                            </button>
                            <button type="button" className="btn-outline" onClick={() => deleteMember(s.id)} style={{ padding: '6px 12px', borderColor: '#FF5630', color: '#BF2600', fontSize: '0.78rem' }}>
                              Delete
                            </button>
                          </div>
                        </td>
                      </>
                    )}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {tasks.length > 0 && (
            <div className="card">
              <div className="card-head"><h2 className="card-title">Tasks</h2><span className="badge badge-amber">{tasks.length}</span></div>
              <table className="data-table">
                <thead><tr><th>Task</th><th>Team Member</th><th>Module</th><th>Deadline</th><th>Actions</th></tr></thead>
                <tbody>
                  {tasks.map((t) => (
                    <tr key={t.id}>
                      {reviewEditingTaskId === t.id ? (
                        <>
                          <td><input value={reviewTaskDraft?.title || ''} onChange={(e) => setReviewTaskDraft((prev) => ({ ...(prev || {}), title: e.target.value }))} style={inputStyle} /></td>
                          <td>
                            <select value={reviewTaskDraft?.student_email || ''} onChange={(e) => setReviewTaskDraft((prev) => ({ ...(prev || {}), student_email: e.target.value }))} style={{ ...inputStyle, cursor: 'pointer' }}>
                              <option value="">Select team member</option>
                              {taskAssignableStudents.map((s) => (
                                <option key={s.email} value={s.email}>
                                  {s.name}{s.module_name ? ` (${s.module_name})` : ''}
                                </option>
                              ))}
                            </select>
                          </td>
                          <td><input value={reviewTaskDraft?.description || ''} onChange={(e) => setReviewTaskDraft((prev) => ({ ...(prev || {}), description: e.target.value }))} style={inputStyle} placeholder="Description" /></td>
                          <td><input type="date" value={reviewTaskDraft?.deadline || ''} onChange={(e) => setReviewTaskDraft((prev) => ({ ...(prev || {}), deadline: e.target.value }))} style={inputStyle} /></td>
                          <td>
                            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                              <button type="button" className="btn-primary" onClick={saveReviewTask} style={{ padding: '6px 12px', fontSize: '0.78rem' }}>
                                Save
                              </button>
                              <button type="button" className="btn-outline" onClick={cancelReviewTaskEdit} style={{ padding: '6px 12px', fontSize: '0.78rem' }}>
                                Cancel
                              </button>
                              <button type="button" className="btn-outline" onClick={() => deleteTask(t.id)} style={{ padding: '6px 12px', borderColor: '#FF5630', color: '#BF2600', fontSize: '0.78rem' }}>
                                Delete
                              </button>
                            </div>
                          </td>
                        </>
                      ) : (
                        <>
                          <td style={{ fontWeight: 700 }}>{t.title}</td>
                          <td>{t.student_name}</td>
                          <td style={{ color: 'var(--text-muted)' }}>{t.module_name || '—'}</td>
                          <td style={{ color: 'var(--text-muted)' }}>{t.deadline || '—'}</td>
                          <td>
                            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                              <button type="button" className="btn-outline" onClick={() => editReviewTask(t.id)} style={{ padding: '6px 12px', fontSize: '0.78rem' }}>
                                Edit
                              </button>
                              <button type="button" className="btn-outline" onClick={() => deleteTask(t.id)} style={{ padding: '6px 12px', borderColor: '#FF5630', color: '#BF2600', fontSize: '0.78rem' }}>
                                Delete
                              </button>
                            </div>
                          </td>
                        </>
                      )}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      <div style={{ display: 'flex', justifyContent: 'space-between', gap: 10, marginTop: 16 }}>
        <button type="button" className="btn-outline" onClick={() => step === 1 ? onClose?.() : setStep(s => s - 1)} disabled={submitting}>
          {step === 1 ? 'Cancel' : 'Back'}
        </button>
        <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
          {!isSimpleMode && step === 3 && (
            <button type="button" className="btn-outline" onClick={addTask} disabled={submitting} style={{ minWidth: 140 }}>
              {editingTaskId ? 'Save Task Changes' : '+ Add Task'}
            </button>
          )}
          {isSimpleMode ? (
            <button type="button" className="btn-primary" onClick={handleCreate} disabled={submitting}>
              {submitting ? 'Creating…' : 'Create Project'}
            </button>
          ) : step < 4 ? (
            <button type="button" className="btn-primary" onClick={() => { if (validateStep(step + 1)) setStep(s => s + 1) }} disabled={submitting}>
              Next
            </button>
          ) : (
            <button type="button" className="btn-primary" onClick={handleCreate} disabled={submitting}>
              {submitting ? 'Creating…' : 'Confirm & Create'}
            </button>
          )}
        </div>
      </div>
    </Modal>
  )
}

function Stepper({ step, totalSteps = 4 }) {
  const items = totalSteps === 1 ? ['Details'] : ['Details', 'Assign Team Members', 'Tasks', 'Review']
  return (
    <div style={{ display: 'flex', gap: 10, marginBottom: 14, flexWrap: 'wrap' }}>
      {items.map((label, idx) => {
        const n = idx + 1
        const active = n === step
        const done = n < step
        return (
          <div key={label} style={{ display: 'inline-flex', alignItems: 'center', gap: 8, padding: '8px 12px', borderRadius: 999, border: '1px solid var(--royal-border)', background: active ? 'var(--royal-faint)' : '#fff', color: active ? 'var(--royal)' : done ? 'var(--text-head)' : 'var(--text-muted)', fontWeight: active ? 900 : 700, fontSize: '0.85rem' }}>
            <span style={{ width: 22, height: 22, borderRadius: '50%', background: done ? 'var(--green)' : active ? 'var(--royal)' : 'var(--royal-border)', color: '#fff', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', fontSize: '0.78rem', fontWeight: 900 }}>
              {done ? '✓' : n}
            </span>
            {label}
          </div>
        )
      })}
    </div>
  )
}

function Field({ label, required, children, span }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 6, gridColumn: span ? '1 / -1' : undefined }}>
      <label style={{ fontSize: '0.8rem', fontWeight: 800, color: 'var(--text-head)' }}>
        {label} {required ? <span style={{ color: 'var(--red)' }}>*</span> : null}
      </label>
      {children}
    </div>
  )
}

function SummaryCard({ label, value }) {
  return (
    <div style={{ border: '1px solid var(--royal-border)', borderRadius: 12, padding: 12, background: '#fff' }}>
      <div style={{ fontSize: '0.72rem', color: 'var(--text-hint)', textTransform: 'uppercase', letterSpacing: '0.06em', fontWeight: 900, marginBottom: 6 }}>{label}</div>
      <div style={{ fontSize: '0.95rem', color: 'var(--text-head)', fontWeight: 800, whiteSpace: 'pre-wrap', overflowWrap: 'anywhere' }}>{value}</div>
    </div>
  )
}

const inputStyle = {
  width: '100%',
  padding: '10px 12px',
  borderRadius: 10,
  border: '1px solid var(--royal-border)',
  outline: 'none',
  fontFamily: 'inherit',
  fontSize: '0.92rem',
}
