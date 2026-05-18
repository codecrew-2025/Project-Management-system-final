import { useEffect, useState, useCallback } from 'react'
import { fetchDashboard } from './api'

function getStoredUser() {
  try {
    const raw = sessionStorage.getItem('pf_user') || localStorage.getItem('pf_user')
    return raw ? JSON.parse(raw) : null
  } catch {
    return null
  }
}

export function useDashboardData(role, fallbackData, extraQuery = {}) {
  const [data, setData] = useState(fallbackData)

  const loadData = useCallback(async () => {
    try {
      const user = getStoredUser()
      const query =
        role === 'student'
          ? {
              studentEmail: user?.email,
              ...extraQuery,
            }
          : {}

      const nextData = await fetchDashboard(role, query)
      setData(nextData)
    } catch {
      setData(fallbackData)
    }
  }, [role, fallbackData, JSON.stringify(extraQuery)])

  useEffect(() => {
    loadData()
  }, [loadData])

  return [data, loadData]
}