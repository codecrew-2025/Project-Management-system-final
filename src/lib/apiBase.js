// In production, set VITE_API_URL to your backend (e.g., https://backend.railway.app/api).
// In development, Vite proxy handles /api → localhost:3001.
// For now, use localhost backend or set VITE_API_URL env var.
const API_BASE = import.meta.env.VITE_API_URL || '/api'
export default API_BASE
