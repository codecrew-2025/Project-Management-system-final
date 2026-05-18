export const directorDashboardFallback = {
  profile: {
    name: 'Dr. Rajesh Mehta',
    role: 'Director',
    subtitle: 'Director',
    initials: 'DR',
  },
  header: {
    title: 'Director Overview',
    subtitle: 'Tuesday, 15 April 2026 · Academic Year 2025–26',
  },
  kpis: [
    { icon: '📁', bg: '#eef2ff', color: '#1a3faa', value: '48', label: 'Total Projects', trend: 'up', trendTxt: '↑ 12%' },
    { icon: '👥', bg: '#e0f2fe', color: '#0369a1', value: '312', label: 'Active Students', trend: 'up', trendTxt: '↑ 8%' },
    { icon: '✔', bg: '#dcfce7', color: '#15803d', value: '29', label: 'Completed', trend: 'up', trendTxt: '↑ 5%' },
    { icon: '⚠', bg: '#fee2e2', color: '#b91c1c', value: '7', label: 'At Risk', trend: 'down', trendTxt: '+2 this week' },
  ],
  projects: [
    { name: 'AI Healthcare Monitor', coord: 'Dr. Priya S.', n: 6, pct: 78, color: '#16a34a', dl: 'Jun 30', badge: 'badge-green', status: 'On Track' },
    { name: 'Smart Campus IoT', coord: 'Prof. Arjun V.', n: 8, pct: 52, color: '#d97706', dl: 'May 15', badge: 'badge-amber', status: 'At Risk' },
    { name: 'Blockchain Voting', coord: 'Dr. Meena K.', n: 4, pct: 91, color: '#16a34a', dl: 'Apr 28', badge: 'badge-green', status: 'On Track' },
    { name: 'NLP Sentiment Tool', coord: 'Prof. Ravi T.', n: 5, pct: 33, color: '#dc2626', dl: 'Apr 20', badge: 'badge-red', status: 'Delayed' },
    { name: 'E-Commerce Platform', coord: 'Dr. Latha R.', n: 7, pct: 65, color: '#16a34a', dl: 'Jul 10', badge: 'badge-green', status: 'On Track' },
  ],
  departments: [
    { name: 'Computer Science', pct: 72, color: '#1a3faa' },
    { name: 'Electronics', pct: 58, color: '#0369a1' },
    { name: 'Mechanical', pct: 41, color: '#d97706' },
    { name: 'Civil', pct: 85, color: '#16a34a' },
    { name: 'IT', pct: 66, color: '#8b5cf6' },
  ],
  activities: [
    { dot: '#0052CC', text: 'AI Healthcare Monitor — Phase 2 report submitted', time: '2h ago' },
    { dot: '#FF5630', text: 'NLP Sentiment Tool — missed milestone', time: '5h ago' },
    { dot: '#36B37E', text: '3 students joined Smart Campus IoT', time: 'Yesterday' },
    { dot: '#FFAB00', text: 'Blockchain Voting — demo scheduled Apr 28', time: '2d ago' },
    { dot: '#6554C0', text: 'Budget review meeting — May 5', time: '2d ago' },
  ],
  userDistribution: [
    { name: 'Students', value: 312, fill: '#0052CC' },
    { name: 'Coordinators', value: 48, fill: '#36B37E' },
  ],
  alerts: {
    sections: [],
    history: [],
    notifications: [],
  },
}

export const coordinatorDashboardFallback = {
  profile: {
    name: 'Dr. Priya Sharma',
    role: 'Coordinator',
    subtitle: 'Coordinator',
    initials: 'PS',
  },
  header: {
    title: 'Coordinator Dashboard',
    subtitle: 'Tuesday, 15 April 2026 · 3 Active Projects',
  },
  kpis: [
    { icon: '📁', bg: '#eef2ff', color: '#1a3faa', value: '3', label: 'My Projects', trend: 'up', trendTxt: 'Active' },
    { icon: '🎓', bg: '#e0f2fe', color: '#0369a1', value: '19', label: 'My Students', trend: 'up', trendTxt: '↑ 3' },
    { icon: '✔', bg: '#dcfce7', color: '#15803d', value: '11', label: 'Tasks Done', trend: 'up', trendTxt: '80%' },
    { icon: '⏳', bg: '#fef9c3', color: '#a16207', value: '4', label: 'Pending Reviews', trend: 'down', trendTxt: 'Due soon' },
  ],
  projects: [
    { title: 'AI Healthcare Monitor', badge: 'badge-green', status: 'On Track', desc: 'Deep learning model for real-time patient vitals anomaly detection using LSTM networks.', n: 6, dl: 'Jun 30', pct: 78, color: '#16a34a' },
    { title: 'Smart Campus IoT', badge: 'badge-amber', status: 'At Risk', desc: 'IoT-based automation of campus resources and energy optimization system.', n: 8, dl: 'May 15', pct: 52, color: '#d97706' },
    { title: 'Blockchain Voting', badge: 'badge-green', status: 'On Track', desc: 'Decentralized tamper-proof student election management on blockchain.', n: 5, dl: 'Apr 28', pct: 91, color: '#16a34a' },
  ],
  reviews: [
    { dot: '#d97706', name: 'Aanya Singh', task: 'Phase 2 Report (AI Healthcare)', time: 'Due today' },
    { dot: '#1a3faa', name: 'Rohit Pillai', task: 'Hardware Integration Demo', time: 'Apr 17' },
    { dot: '#0369a1', name: 'Kavitha R.', task: 'Smart Contract Testing', time: 'Apr 18' },
    { dot: '#dc2626', name: 'Team IoT-B', task: 'Algorithm Design Doc', time: 'Overdue' },
  ],
  schedule: [
    { day: '15', mon: 'APR', title: 'Phase 2 Review — AI Healthcare', loc: '2:00 PM · Conference Room B' },
    { day: '17', mon: 'APR', title: 'IoT Hardware Demo', loc: '10:30 AM · Lab 204' },
    { day: '18', mon: 'APR', title: 'Blockchain Code Review', loc: '3:00 PM · Online (Meet)' },
  ],
  alerts: {
    sections: [],
    history: [],
    notifications: [],
  },
}

export const studentDashboardFallback = {
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
}