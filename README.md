# casa.care — Rental Management System (React + Vite + Supabase)

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
