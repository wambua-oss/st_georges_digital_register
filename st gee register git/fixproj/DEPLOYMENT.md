# St. George’s Digital Register — Final Deployment

## 1. Supabase database
Run `supabase/FINAL_SYNC_ALL.sql` once in the Supabase SQL Editor. It is the clean schema used by this project. **It rebuilds the application tables and removes their existing rows; Supabase Auth users are not deleted.**

Tables: `profiles`, `classes`, `learners`, `attendance`, `academic_years`. No legacy `name`, `adm_number`, `upi_no`, or timestamp columns are used.

Learner import columns are exactly: `Admission No.`, `KEMIS No.`, `Full Name`, `Gender`, `Residence`, `Section`, `Grade`, `Stream`.

## 2. Edge Functions
Deploy all four functions, using the exact names below:
- `admin-create-user`
- `admin-update-user`
- `admin-reset-user-password`
- `admin-sync-stream-users`

Required Supabase Edge Function secret:
- `SUPABASE_SERVICE_ROLE_KEY`

The functions validate the caller’s bearer token and require an active `admin` profile.

## 3. Vercel
Set these Vercel environment variables:
- `VITE_SUPABASE_URL`
- `VITE_SUPABASE_ANON_KEY`

Then deploy the Vite project.

## 4. Class structure
- ECDE: PP1, PP2 — no streams
- Primary: Grade 1–6 — PE, PK, PL, PR, PS
- JSS: Grade 7–9 — JE, JK, JL, JR, JS

Class-teacher login names are generated as PP1/PP2 for ECDE and 1PE … 9JS for streamed classes.
