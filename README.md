# casa.care — Rental Management System (React + Vite + Supabase)

A React/Vite rebuild of the original PHP dashboard for managing a rental
apartment building: units, tenants, rent collection, water bills, garbage
collection bills, and maintenance complaints. Same features, same look —
just a static frontend talking directly to Supabase, which deploys to
Vercel (or Netlify, Cloudflare Pages, etc.) far more easily than the PHP
version did.

## What changed from the PHP version

- **No PHP/Apache server** — this is a static single-page app built with
  Vite. It calls Supabase directly from the browser using the `anon` key.
- **Auth** moved from a custom `username` + bcrypt `users` table to
  **Supabase Auth** (email + password). A `profiles` table still stores
  the display name and role shown in the sidebar. See
  [`supabase/schema.sql`](supabase/schema.sql) for details and how to
  create your first login.
- **Business tables are unchanged**: `units`, `tenants`, `rent_payments`,
  `water_bills`, `garbage_bills`, `maintenance_requests` — same columns,
  same statuses, same behavior (e.g. a unit still automatically flips
  between `vacant`/`occupied` when a tenant is assigned or vacates — that
  logic now lives in a Postgres trigger instead of PHP code, so it's
  enforced no matter what talks to the database).
- CSRF protection isn't needed anymore since there's no server-rendered
  form posting — Supabase's row-level security policies (also in
  `supabase/schema.sql`) restrict all reads/writes to signed-in users.

## 1. Set up Supabase

1. Create a project at [supabase.com](https://supabase.com) (or use an
   existing one).
2. Open **SQL Editor → New query**, paste the contents of
   [`supabase/schema.sql`](supabase/schema.sql), and run it. This creates
   every table, the unit-status sync trigger, RLS policies, and seeds 5
   sample units + 3 sample tenants (no bill/payment history, so reports
   start empty — add some via the app).
3. Create your first staff login: **Authentication → Users → Add user**,
   set an email and password. A matching row is auto-created in
   `profiles` with role `manager`. To make yourself the owner:
   ```sql
   update profiles set role = 'owner', full_name = 'Your Name'
   where id = 'paste-the-user-uuid-here';
   ```
4. Grab your API keys from **Project Settings → API**: the *Project URL*
   and the *anon public* key.

## 2. Run it locally

```bash
npm install
cp .env.example .env
# edit .env and paste in your Supabase URL + anon key
npm run dev
```

Visit the printed local URL and sign in with the email/password you
created in Supabase Auth.

## 3. Deploy (Vercel)

1. Push this project to a Git repo and import it in Vercel.
2. Framework preset: **Vite**. Build command `npm run build`, output
   directory `dist` (Vercel usually detects these automatically).
3. Add the environment variables in Vercel's project settings:
   - `VITE_SUPABASE_URL`
   - `VITE_SUPABASE_ANON_KEY`
4. Deploy. Because this is now a static build with no PHP runtime, there's
   nothing server-side for Vercel to fight with.

Any other static host (Netlify, Cloudflare Pages, GitHub Pages with a
catch-all rewrite for client-side routing) works the same way — just set
the same two environment variables and use `npm run build`.

## Project structure

```
casa-care-react/
├── supabase/
│   └── schema.sql          # tables, trigger, RLS policies, seed data
├── src/
│   ├── supabaseClient.js   # Supabase JS client
│   ├── context/AuthContext.jsx
│   ├── components/         # Layout (sidebar/topbar), Badge, Alert, Icon, ProtectedRoute
│   ├── pages/               # one file per screen, mirrors the old .php files
│   │   ├── Login.jsx
│   │   ├── Dashboard.jsx
│   │   ├── Units.jsx / UnitForm.jsx
│   │   ├── Tenants.jsx / TenantForm.jsx
│   │   ├── Rent.jsx / RentForm.jsx
│   │   ├── WaterBills.jsx / WaterBillForm.jsx
│   │   ├── GarbageBills.jsx / GarbageBillForm.jsx
│   │   ├── Maintenance.jsx / MaintenanceForm.jsx
│   │   └── Reports.jsx
│   ├── lib/constants.js    # months list, KES/date formatting helpers
│   └── styles/style.css    # the original stylesheet, unchanged
├── index.html
├── vite.config.js
└── package.json
```

## Notes

- All data access goes through Supabase's auto-generated REST API via
  `@supabase/supabase-js`, protected by the RLS policies in
  `schema.sql` — only authenticated users can read or write.
- The revenue chart on the dashboard uses Chart.js, now installed as an
  npm dependency (`chart.js`) and bundled by Vite instead of loaded from
  a CDN `<script>` tag.
- A unit can't be deleted while it has an active tenant — enforced in the
  UI (`Units.jsx`) the same way the PHP page did.
- Feel free to extend: a tenant self-service portal, SMS/email reminders
  for overdue bills, file uploads for maintenance photos (Supabase
  Storage is a natural fit), or role-based RLS policies once you have
  more than one type of staff account.
