import React from 'react'
import '../assets/dashboard.css'

export default function CoordinatorModal({ coordinator, projects = [], projectStudents = [], students = [], onClose }) {
  if (!coordinator) return null

  const coordProjects = projects.filter(p => p.coordinator_id === coordinator.id || p.coordinator_email === coordinator.email)
  const studentMap = Object.fromEntries((students || []).map(s => [s.id || s.email, s]))

  return (
    <div className="coordinator-modal-backdrop">
      <div className="coordinator-modal">
        <div className="coordinator-modal-head">
          <div>
            <div className="coordinator-modal-title">{coordinator.name}</div>
            <div className="coordinator-modal-sub">{coordinator.email}</div>
          </div>
          <div>
            <button className="btn-outline" onClick={onClose}>Close</button>
          </div>
        </div>

        {coordProjects.length === 0 ? (
          <div className="coordinator-empty">No projects assigned to this coordinator.</div>
        ) : (
          <div className="coordinator-project-list">
            {coordProjects.map((p) => {
              const members = projectStudents.filter(ps => ps.project_id === p.id)
              return (
                <div key={p.id} className="coordinator-project">
                  <div className="coordinator-project-head">
                    <div className="coordinator-project-title">{p.title || p.name}</div>
                    <div className="coordinator-project-meta">
                      <div className="progress-small">
                        <div className="progress-track"><div className="progress-fill" style={{ width: `${p.pct || 0}%`, background: p.status === 'completed' ? '#16a34a' : 'var(--royal)' }} /></div>
                        <div className="progress-label">{p.pct || 0}% complete</div>
                      </div>
                      <div className="coordinator-status">{p.status || 'Active'}</div>
                    </div>
                  </div>

                  <div className="coordinator-project-body">
                    <div className="coordinator-project-students">
                      <div className="coordinator-section-label">Students</div>
                      {members.length === 0 ? (
                        <div className="coordinator-empty-small">No students assigned</div>
                      ) : (
                        <ul className="coordinator-student-list">
                          {members.map((m) => {
                            const s = studentMap[m.student_id] || studentMap[m.student_email] || { name: m.student_name || m.student_email }
                            return (
                              <li key={m.student_id || m.student_email} className="coordinator-student-item">
                                <div className="coordinator-student-name">{s.name || s.email}</div>
                                <div className="coordinator-student-email">{s.email || m.student_email}</div>
                              </li>
                            )
                          })}
                        </ul>
                      )}
                    </div>
                    <div className="coordinator-project-details">
                      <div className="coordinator-section-label">Project Details</div>
                      <div><strong>Deadline:</strong> {p.deadline || 'TBD'}</div>
                      <div><strong>Students:</strong> {p.studentCount || members.length || 0}</div>
                      <div><strong>Tasks:</strong> {p.taskCount || 0}</div>
                    </div>
                  </div>
                </div>
              )
            })}
          </div>
        )}
      </div>
    </div>
  )
}
