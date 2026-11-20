# casa.care — Rental Management System (React + Vite + Supabase)

<<<<<<< HEAD
=======
A React/Vite rebuild of the original PHP dashboard for managing a rental
building: units, tenants, rent collection, water, garbage and maintenance.
It is a static frontend that talks straight to Supabase, so it deploys to
Vercel (or Netlify, Cloudflare Pages…) without any server runtime.

## How billing works

Every tenant has **one running account**. Each month the system adds a
charge made of:

| Part | Where it comes from |
|---|---|
| Rent | the unit's monthly rent (snapshotted when the month is billed) |
| Water | the meter reading you enter on the tenant's profile × the price per unit in Settings |
| Garbage | a flat amount from Settings, only if the toggle is ON |

Payments are just money received — they are **not** tied to a month. The
database applies each tenant's total payments to the **oldest unpaid month
first**, so:

- Two months unpaid → two months show as **overdue**; the tenant's *Amount Due* is the total.
- They pay three months' worth → the older months clear, the extra becomes **credit**, and when the next month's bill is created the credit absorbs it automatically.
- Delete or edit a payment or reading and everything is recalculated.

A month is **overdue** once its due day (Settings → *Rent due on day*) has passed and it isn't fully paid.

## Where things are

- **Tenants → profile button** (person icon next to Edit, or click the name): amount due / overdue / credit, month-by-month statement, **water readings** (add one per billed month; previous reading is pre-filled), and payment history.
- **Rent Collection**: every tenant's amount due, overdue amount, credit and status, with a *Record Payment* button. Water and garbage bills are no longer separate pages.
- **Settings**: price per water unit, garbage toggle + amount, and rent due day.
- **Dates** are typed as **dd/mm/yy** everywhere (slashes are inserted as you type; a calendar button is there as a shortcut) and shown the same way in tables.

## Security: admin password + notifications

- **Protected actions** — deleting a **tenant**, deleting a **payment** and **editing a payment** each open a two-step pop-up: (1) type the **admin password**, (2) confirm. Editing a tenant, units, maintenance etc. do not ask.
- **"Admin password"** is the login password of an account whose profile role is `owner` (or `admin`). The **first account you create is made owner automatically**; later accounts are `manager`. A manager can use the app normally, but an owner has to type the password for protected actions. Make another owner with:
  ```sql
  update profiles set role = 'owner' where id = 'paste-the-user-uuid-here';
  ```
- **Enforced in the database, not just the page.** Staff accounts can no longer delete tenants or edit/delete payments directly through the API; those rows can only be changed by functions that check the password themselves (`admin_delete_tenant`, `admin_delete_payment`, `admin_update_payment`). Five wrong guesses locks that user out of password checks for 10 minutes.
- **Notifications** — a pop-up appears for every change (tenant saved/updated/deleted, payment added/updated/deleted, water reading added, settings saved, unit and maintenance changes) and for failures.

## 1. Set up Supabase

**Brand-new project** — SQL Editor → paste `supabase/schema.sql` → Run.
(It drops and recreates all casa.care tables, then seeds 5 units and 3 tenants.)

**Already running an earlier version?** Run these in order, each once. Your units, tenants, maintenance requests and logins are kept:
1. `supabase/migration_002_ledger.sql` — rent ledger, water readings, settings (skip if you already ran it). The old `rent_payments`, `water_bills` and `garbage_bills` tables are *renamed* to `legacy_*`, not deleted.
2. `supabase/migration_003_admin_security.sql` — admin-password protection. If nobody is an owner yet, it promotes your oldest account to owner.

Then create your first login: **Authentication → Users → Add user**. A `profiles`
row is created automatically and the first account becomes the **owner** (its password
is the admin password). To rename it:

```sql
update profiles set full_name = 'Your Name' where id = 'paste-the-user-uuid-here';
```

Get your **Project URL** and **anon public key** from Project Settings → API.

### About billing start
Tenants are billed from their **move-in month** (a tenant with no move-in date is
billed from the month they were added). Missing months are created the next time a
billing page loads.

## 2. Run locally

```bash
npm install
cp .env.example .env     # paste your Supabase URL + anon key
npm run dev
```

## 3. Deploy to Vercel

1. Push to Git and import the repo in Vercel (preset **Vite**, build `npm run build`, output `dist`).
2. Add environment variables `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY`.
3. Because the app uses client-side routes, add a `vercel.json` rewrite if you
   get 404s when refreshing a page:
   ```json
   { "rewrites": [{ "source": "/(.*)", "destination": "/" }] }
   ```

>>>>>>> 3cab43d (Update rental management system)
## Project structure

```
supabase/
  schema.sql                  fresh install: tables, triggers, ledger views, RLS, seed data
  migration_002_ledger.sql    upgrade: rent ledger, water readings, settings (keeps your data)
  migration_003_admin_security.sql  upgrade: admin-password protection
src/
  lib/constants.js            formatting + dd/mm/yy date helpers
  lib/api.js                  ensureCharges(), getSettings()
  components/DateInput.jsx    the dd/mm/yy date field
  components/AdminConfirmModal.jsx   password-then-confirm pop-up
  context/ToastContext.jsx    notifications
  context/AdminConfirmContext.jsx    confirmAsAdmin() helper
  components/                 Layout, Badge, Alert, Icon, ProtectedRoute
  pages/
    Dashboard, Reports
    Tenants, TenantForm, TenantProfile   (statement, water readings, payments)
    Units, UnitForm
    Rent, RentForm                        (balances; add / edit payment)
    Maintenance, MaintenanceForm
    Settings
```

## Database notes

- `monthly_charges` — one row per tenant per month, created by `ensure_monthly_charges()` (called whenever a billing page loads; idempotent). Rent and garbage are snapshotted, so changing a rent or the garbage setting never rewrites old months.
- `water_readings` — `units_used` and `amount` are computed by the database; the price in force is stored with each reading.
- `payments` — money received.
- `tenant_ledger` / `tenant_balances` — views that do the oldest-first allocation, status and totals.
- Dates use Kenya time (`today_ke()`), not UTC, for "overdue".
- Optional: schedule `select ensure_monthly_charges();` nightly with pg_cron so charges exist even if nobody opens the app (command is at the bottom of `schema.sql`).
