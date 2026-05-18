# ProjectFlow Local Development

## Mobile access via ngrok

If you want to open the app from your phone without LAN setup, use ngrok to expose the frontend server.

1. Start the backend in one terminal:
```powershell
cd backend
npm install
npm start
```

2. Start the frontend in another terminal:
```powershell
cd .
npm install
npm run dev
```

3. Start the ngrok tunnel in a third terminal:
```powershell
npm run tunnel
```

If ngrok reports an auth token error, you need to sign up and install a token:
```powershell
npm install -g ngrok
ngrok authtoken <YOUR_TOKEN>
```

If your terminal already defines `PORT` for another service, run:
```powershell
$Env:NGROK_PORT=5173; npm run tunnel
```

4. Copy the public URL shown by ngrok and set it in your `.env`:
```env
FRONTEND_URL=https://xxxxxx.ngrok.app
```

5. Restart the backend so reset emails are generated with the public URL.

6. Open the public ngrok URL on your phone and use the Forgot Password flow.

## Notes

- The frontend remains proxied to the backend in development.
- If the reset email still points to the wrong hostname, make sure `FRONTEND_URL` is set before restarting the backend.
