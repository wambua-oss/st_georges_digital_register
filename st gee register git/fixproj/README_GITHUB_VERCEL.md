# St. George's Digital Register — Vite / Supabase / Vercel

## GitHub
Upload the CONTENTS of this folder to the root of the GitHub repository.
`package.json`, `vite.config.js` and `index.html` must be in the repository root.
Do not upload an extra `st gee register` folder around them.

## Vercel
Framework: Vite
Root Directory: .
Build Command: npm run build
Output Directory: dist
Install Command: npm install

Environment variables:
- VITE_SUPABASE_URL = your Supabase Project URL
- VITE_SUPABASE_ANON_KEY = your Supabase anon/publishable key

Never put SUPABASE_SERVICE_ROLE_KEY in Vercel frontend environment variables.

## Supabase SQL
Run the complete `supabase/FINAL_SYNC_ALL.sql` once in Supabase SQL Editor.

## Edge Functions
From this repository root, run:

supabase login
supabase link --project-ref YOUR_PROJECT_REF
supabase secrets set SUPABASE_URL="YOUR_SUPABASE_URL"
supabase secrets set SUPABASE_SERVICE_ROLE_KEY="YOUR_SERVICE_ROLE_KEY"
supabase functions deploy admin-create-user
supabase functions deploy admin-update-user
supabase functions deploy admin-reset-user-password
supabase functions deploy admin-sync-stream-users

The functions validate the caller's Authorization bearer token and require an active profile with role=admin.
