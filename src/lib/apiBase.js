// In production (Vercel), calls go to the deployed backend URL.
// In development, Vite proxy handles /api → localhost:3001.
const API_BASE = import.meta.env.VITE_API_URL || (import.meta.env.PROD ? '/_/backend/api' : '/api')
export default API_BASE
