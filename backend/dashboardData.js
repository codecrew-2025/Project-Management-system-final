export const dashboardData = {
  director: {
    profile: { name: '', role: 'Director', subtitle: 'Director', initials: 'DR' },
    header: { title: 'Director Overview', subtitle: '' },
    kpis: [
      { icon: '📁', bg: '#eef2ff', color: '#1a3faa', value: '0', label: 'Total Projects', trend: 'up', trendTxt: '' },
      { icon: '👥', bg: '#e0f2fe', color: '#0369a1', value: '0', label: 'Active Students', trend: 'up', trendTxt: '' },
      { icon: '✔', bg: '#dcfce7', color: '#15803d', value: '0', label: 'Completed', trend: 'up', trendTxt: '' },
      { icon: '⚠', bg: '#fee2e2', color: '#b91c1c', value: '0', label: 'At Risk', trend: 'down', trendTxt: '' },
    ],
    projects: [],
    departments: [
      { name: 'Computer Science', pct: 0, color: '#1a3faa' },
      { name: 'Electronics', pct: 0, color: '#0369a1' },
      { name: 'IT', pct: 0, color: '#8b5cf6' },
    ],
    activities: [],
    userDistribution: [
      { name: 'Students', value: 0, fill: '#0052CC' },
      { name: 'Coordinators', value: 0, fill: '#36B37E' },
    ],
    alerts: {
      sections: [],
      history: [],
      notifications: [],
    },
  },
  coordinator: {
    profile: { name: '', role: 'Coordinator', subtitle: '', initials: '' },
    header: { title: 'Coordinator Dashboard', subtitle: '' },
    kpis: [
      { icon: '📁', bg: '#eef2ff', color: '#1a3faa', value: '0', label: 'My Projects', trend: 'up', trendTxt: 'Active' },
      { icon: '🎓', bg: '#e0f2fe', color: '#0369a1', value: '0', label: 'My Students', trend: 'up', trendTxt: '' },
      { icon: '✔', bg: '#dcfce7', color: '#15803d', value: '0', label: 'Tasks Done', trend: 'up', trendTxt: '' },
      { icon: '⏳', bg: '#fef9c3', color: '#a16207', value: '0', label: 'Pending Reviews', trend: 'down', trendTxt: '' },
    ],
    projects: [],
    reviews: [],
    schedule: [],
    alerts: {
      sections: [],
      history: [],
      notifications: [],
    },
  },
  student: {
    profile: {
      name: '',
      role: 'Student',
      subtitle: '',
      initials: '',
    },
    header: {
      title: 'My Workspace',
      subtitle: '',
    },
    kpis: [],
    project: {
      title: '',
      status: '',
      desc: '',
      coordinator: '',
      deadline: '',
      teamSize: '',
      department: '',
      progress: 0,
      milestones: [],
    },
    tasks: [],
    announcements: [],
    submissions: [],
    messages: [],
  },
}