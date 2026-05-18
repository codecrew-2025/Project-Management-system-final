// Fallback handler for unmatched routes - return 404
export default function handler(req, res) {
  res.status(404).json({ message: 'API route not found. Backend deployment needed.' })
}

