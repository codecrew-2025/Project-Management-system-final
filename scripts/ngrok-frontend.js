import ngrok from 'ngrok'

const port = Number(process.env.NGROK_PORT || process.env.FRONTEND_PORT || process.env.VITE_PORT || 5173)
const proto = process.env.NGROK_PROTO || 'http'
const authToken = process.env.NGROK_AUTHTOKEN || process.env.NGROK_TOKEN

async function main() {
  console.log(`Starting ngrok tunnel to localhost:${port}...`)
  if (authToken) {
    console.log('Configuring ngrok auth token...')
    await ngrok.authtoken(authToken)
  }
  const url = await ngrok.connect({ addr: port, proto })
  console.log('\n=== ngrok tunnel ready ===')
  console.log(`Frontend public URL: ${url}`)
  console.log(`
Use this URL in your .env as FRONTEND_URL=${url}
Then restart your backend so password reset links are generated with the public URL.`)
  console.log('If you want the backend to use this URL automatically, set NGROK_URL to the same value.')
}

main().catch((err) => {
  console.error('ngrok tunnel failed:', err)
  process.exit(1)
})
