# BMF Time Tracker - Web App Build Spec

## Purpose

Multi-user time tracking web app for BMF staff working across Corporate (BM Fitness Group, Inc.), Plano, and Dallas entities. Employees clock in and out via browser or phone-installed PWA. Admin (Jeremy) reviews, approves, and exports weekly payroll data as XLSX.

## Tech Stack

- **Frontend:** React 18 + Vite + TypeScript + Tailwind CSS
- **Backend:** Supabase (Postgres + Auth + Realtime + Edge Functions)
- **Auth:** Supabase email magic link + WebAuthn passkeys for biometric login
- **XLSX Export:** SheetJS (xlsx library)
- **PWA:** Vite PWA plugin with Workbox service worker
- **Push Notifications:** Web Push API via Supabase Edge Functions
- **Hosting:** Vercel (auto-deploy from GitHub main branch)
- **State:** Zustand for local state, Supabase realtime for server sync

## Environment Variables

Create `.env.local` with:

```
VITE_SUPABASE_URL=<from Supabase Settings > API>
VITE_SUPABASE_ANON_KEY=<from Supabase Settings > API>
VITE_ADMIN_EMAIL=jeremy@bodymachinefitness.com
```

Supabase service role key goes in Vercel environment variables only, never in client code.

Studio coordinates (hardcode in `src/config/locations.ts`):

```typescript
export const STUDIO_LOCATIONS = {
  Plano: { lat: <get from Google Maps>, lng: <get>, radiusMeters: 150 },
  Dallas: { lat: 32.7985, lng: -96.8013, radiusMeters: 150 }, // 2626 Howell St approximate
  Corporate: null // no geofence for corporate work
};
```

## Supabase Schema

Run this SQL in Supabase SQL Editor:

```sql
-- Employees table
create table employees (
  id uuid primary key default gen_random_uuid(),
  auth_user_id uuid references auth.users(id) on delete cascade unique,
  email text not null unique,
  full_name text not null,
  role text not null default 'employee' check (role in ('employee', 'admin')),
  is_active boolean not null default true,
  created_at timestamptz not null default now()
);

-- Time entries
create table time_entries (
  id uuid primary key default gen_random_uuid(),
  employee_id uuid not null references employees(id) on delete cascade,
  entity text not null check (entity in ('Corporate', 'Plano', 'Dallas')),
  clock_in timestamptz not null,
  clock_out timestamptz,
  break_minutes integer not null default 0,
  notes text default '',
  is_manual boolean not null default false,
  is_approved boolean not null default false,
  clock_in_location jsonb, -- {lat, lng, accuracy}
  clock_out_location jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- Active sessions (one per employee max)
create table active_sessions (
  employee_id uuid primary key references employees(id) on delete cascade,
  entity text not null check (entity in ('Corporate', 'Plano', 'Dallas')),
  clock_in timestamptz not null,
  break_start timestamptz,
  notes text default '',
  started_at timestamptz not null default now()
);

-- Audit log
create table audit_log (
  id uuid primary key default gen_random_uuid(),
  actor_id uuid references employees(id),
  action text not null,
  target_type text not null,
  target_id uuid,
  details jsonb,
  created_at timestamptz not null default now()
);

-- Weekly approvals
create table weekly_approvals (
  id uuid primary key default gen_random_uuid(),
  employee_id uuid not null references employees(id) on delete cascade,
  week_ending_date date not null,
  approved_by uuid references employees(id),
  approved_at timestamptz,
  total_hours numeric(5,2),
  entity_breakdown jsonb,
  unique(employee_id, week_ending_date)
);

-- Scheduled shifts (v2)
create table scheduled_shifts (
  id uuid primary key default gen_random_uuid(),
  employee_id uuid not null references employees(id) on delete cascade,
  entity text not null check (entity in ('Corporate', 'Plano', 'Dallas')),
  shift_date date not null,
  start_time time not null,
  end_time time not null,
  notes text default '',
  created_at timestamptz not null default now()
);

-- Push subscriptions
create table push_subscriptions (
  id uuid primary key default gen_random_uuid(),
  employee_id uuid not null references employees(id) on delete cascade,
  endpoint text not null,
  keys jsonb not null,
  created_at timestamptz not null default now(),
  unique(employee_id, endpoint)
);

-- Indexes
create index idx_time_entries_employee_date on time_entries(employee_id, clock_in desc);
create index idx_time_entries_entity_date on time_entries(entity, clock_in desc);
create index idx_scheduled_shifts_employee_date on scheduled_shifts(employee_id, shift_date);
```

## Row Level Security Policies

Enable RLS on all tables:

```sql
alter table employees enable row level security;
alter table time_entries enable row level security;
alter table active_sessions enable row level security;
alter table audit_log enable row level security;
alter table weekly_approvals enable row level security;
alter table scheduled_shifts enable row level security;
alter table push_subscriptions enable row level security;

-- Helper function
create or replace function is_admin() returns boolean as $$
  select exists(select 1 from employees where auth_user_id = auth.uid() and role = 'admin' and is_active = true);
$$ language sql security definer;

create or replace function current_employee_id() returns uuid as $$
  select id from employees where auth_user_id = auth.uid();
$$ language sql security definer;

-- Employees: see self or if admin see all
create policy "employees_select" on employees for select using (
  auth_user_id = auth.uid() or is_admin()
);
create policy "employees_admin_write" on employees for all using (is_admin());

-- Time entries: own or admin
create policy "time_entries_select" on time_entries for select using (
  employee_id = current_employee_id() or is_admin()
);
create policy "time_entries_insert_own" on time_entries for insert with check (
  employee_id = current_employee_id() or is_admin()
);
create policy "time_entries_update_own" on time_entries for update using (
  (employee_id = current_employee_id() and is_approved = false) or is_admin()
);
create policy "time_entries_admin_delete" on time_entries for delete using (is_admin());

-- Active sessions: own only
create policy "active_sessions_own" on active_sessions for all using (
  employee_id = current_employee_id() or is_admin()
);

-- Audit log: admin read only, system inserts
create policy "audit_log_admin_read" on audit_log for select using (is_admin());
create policy "audit_log_insert" on audit_log for insert with check (true);

-- Weekly approvals: admin only
create policy "weekly_approvals_read" on weekly_approvals for select using (
  employee_id = current_employee_id() or is_admin()
);
create policy "weekly_approvals_admin_write" on weekly_approvals for all using (is_admin());

-- Scheduled shifts: own or admin
create policy "scheduled_shifts_read" on scheduled_shifts for select using (
  employee_id = current_employee_id() or is_admin()
);
create policy "scheduled_shifts_admin_write" on scheduled_shifts for all using (is_admin());

-- Push subscriptions: own only
create policy "push_subs_own" on push_subscriptions for all using (
  employee_id = current_employee_id()
);
```

## App Routes

```
/                     → redirects based on auth + role
/login                → magic link or passkey login
/app                  → employee tracker (main UI)
/app/history          → her weekly/monthly history
/app/schedule         → her upcoming scheduled shifts (v2)
/admin                → admin dashboard home
/admin/employees      → add/edit/deactivate employees
/admin/live           → live "on the clock now" view
/admin/review         → weekly review and approval per employee
/admin/export         → bulk weekly export
/admin/schedule       → create shifts for employees (v2)
/admin/audit          → audit log viewer
/quick?action=...     → URL-triggered quick actions (for Siri/shortcut integration)
```

## Core Feature Specs

### 1. Authentication

- **Primary:** Supabase magic link via email
- **After first login:** prompt to register a passkey for future biometric login
- **Admin bootstrap:** first user with `VITE_ADMIN_EMAIL` gets `role = 'admin'` automatically on first sign-in
- **Employee invites:** admin adds email in `/admin/employees`, system sends magic link invitation
- **Session persistence:** 30-day refresh token, auto-renewed
- **Logout:** clears session and unregisters from push notifications

### 2. Employee Tracker (Main UI)

Layout matches the earlier dark-theme spec but syncs to Supabase instead of localStorage.

Functions:
- Select entity (Corporate / Plano / Dallas)
- Clock in (writes to `active_sessions`, logs to `audit_log`)
- Clock out (moves `active_sessions` row to `time_entries` as completed entry)
- Switch entity (clock out then re-open selector)
- Break button: starts/ends a break within active session. Break time subtracts from duration
- Optional notes field, editable before entry is approved
- Today's entries list with swipe/tap to delete (only if not approved)
- Week summary showing totals by entity
- Manual entry for forgotten clock-outs (date, entity, in time, out time, notes)

Realtime: subscribe to own `time_entries` changes so edits from admin reflect immediately.

### 3. Admin Dashboard

**`/admin/live`** - Live "On the Clock" view:
- Lists every employee currently clocked in
- Shows entity, clock-in time, elapsed time (live updating)
- Color dot per entity (silver/orange/sky)
- Auto-refreshes via Supabase realtime subscription

**`/admin/review`** - Per-employee weekly review:
- Employee selector dropdown
- Week selector (defaults to current week, Sunday to Saturday)
- Table of all entries for the week, editable inline (clock in, clock out, entity, notes, break minutes)
- Entity totals at bottom
- Grand total hours
- "Approve Week" button that locks all entries for that employee/week
- "Revert Approval" button (admin only, logs to audit)

**`/admin/export`** - Bulk weekly export:
- Week selector
- Lists all active employees with their total hours and approval status
- Checkbox to select which employees to include
- "Generate XLSX" button produces a single file (see Export Format section)
- Downloads immediately via browser

**`/admin/employees`** - Staff management:
- Table of all employees with name, email, role, active status, last clock-in
- Add employee: name, email, role (employee/admin). Sends magic link
- Deactivate toggle (preserves history, blocks login)
- Edit name/role

**`/admin/audit`** - Audit log viewer:
- Filterable by actor, action, date range
- Exports to XLSX if needed

### 4. PWA Configuration

`vite.config.ts` uses `vite-plugin-pwa` with:

```typescript
VitePWA({
  registerType: 'autoUpdate',
  manifest: {
    name: 'BMF Time Tracker',
    short_name: 'BMF Time',
    description: 'Body Machine Fitness time tracking',
    theme_color: '#000000',
    background_color: '#000000',
    display: 'standalone',
    orientation: 'portrait',
    icons: [
      { src: '/icon-192.png', sizes: '192x192', type: 'image/png' },
      { src: '/icon-512.png', sizes: '512x512', type: 'image/png' },
      { src: '/icon-maskable.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' }
    ]
  },
  workbox: {
    runtimeCaching: [
      {
        urlPattern: /^https:\/\/.*\.supabase\.co\/rest\/v1\/.*/,
        handler: 'NetworkFirst',
        options: { cacheName: 'api-cache', networkTimeoutSeconds: 5 }
      }
    ]
  }
})
```

Offline behavior: if network drops while clocking in/out, queue the action in IndexedDB and sync when connection returns. Show offline banner in UI.

Generate icons: use BMF logo on black background, 192x192, 512x512, and 512x512 maskable variant. Place in `/public/`.

### 5. Push Notifications

Use Supabase Edge Function `send-push` triggered by database triggers. Three notification types:

- **Overtime alert:** employee crosses 40 hours for the week. Sent to employee + admin
- **Forgot clock out:** employee clocked in for more than 10 hours. Sent to employee
- **Weekly approval needed:** Saturday at 8am local time, summary of staff awaiting approval. Sent to admin

iOS note: push requires PWA installed to home screen, iOS 16.4 or later. Show a one-time onboarding banner explaining how to install on first visit.

### 6. Overtime Alerts

Trigger on every `time_entries` insert/update:
- Calculate total approved + pending hours for the employee's current week
- If sum crosses 40, insert a notification row and fire push
- Display yellow banner in employee UI: "You've hit overtime this week"

### 7. Forgot-to-Clock-Out Alerts

Scheduled Edge Function running every 30 minutes:
- Query `active_sessions` for sessions older than 10 hours
- For each, send push notification to that employee
- Include a "Clock out now" button linking to `/quick?action=clockout`

Hard cap: if session exceeds 14 hours, auto-clock-out at the 14-hour mark and flag the entry for admin review.

### 8. Audit Log

Every meaningful action writes to `audit_log`:
- Clock in / out / switch / break start/end
- Manual entry created
- Entry edited (store before/after in `details`)
- Entry deleted
- Week approved / reverted
- Employee added / deactivated / role changed

Each entry captures actor, action, target, and JSON details. Admin can view via `/admin/audit`.

### 9. Weekly XLSX Export

See Export Format section below.

## V2 Features

### 10. Geofencing

On clock-in, request browser geolocation (with permission). Compare to `STUDIO_LOCATIONS` for the selected entity:
- If within `radiusMeters`: proceed silently, store location in `clock_in_location`
- If outside or permission denied: show yellow warning "You appear to be away from [Entity]. Clock in anyway?" with confirm/cancel
- Corporate entity has no geofence (null in config)
- Location stored on every clock-in/out for audit

Do not block clock-in on location mismatch. Soft warning only. Jeremy can review flagged entries in admin.

### 11. Scheduled Shifts

**`/admin/schedule`** - Weekly grid view:
- Rows: employees
- Columns: days of the week
- Click cell to add shift (entity, start time, end time, notes)
- Drag to copy shifts across days
- Save creates `scheduled_shifts` rows

**Employee `/app/schedule`** - List view of her upcoming shifts for the next 2 weeks.

**Tap-to-fill:** On employee tracker home, if a shift is scheduled for today and she's not yet clocked in, show a "Start Scheduled Shift" button that auto-selects the right entity and clocks her in.

### 12. Voice Shortcut Integration

App exposes URL endpoints that trigger actions when loaded (while authenticated):

- `/quick?action=clockin&entity=Plano`
- `/quick?action=clockin&entity=Dallas`
- `/quick?action=clockin&entity=Corporate`
- `/quick?action=clockout`
- `/quick?action=switch&entity=Plano` (etc.)
- `/quick?action=break&state=start`
- `/quick?action=break&state=end`

The `/quick` route checks auth, performs the action, shows a confirmation toast for 2 seconds, and closes if opened from a shortcut. If not authenticated, redirects to login with return URL.

**iOS Siri setup:** User creates an iOS Shortcut named "Clock me in to Plano" that opens the URL above in Safari. Siri recognizes the shortcut name. Include a help page at `/help/siri` with screenshots of the Shortcuts setup.

**Android:** Similar pattern via Google Assistant "Open [shortcut name]" routed through Chrome. Help page at `/help/android`.

### 13. Calendar Grid View

Employee `/app/history`:
- Monthly calendar grid
- Each day cell shows total hours worked, color-coded by dominant entity
- Tap a day to see its entries
- Toggle between week and month view

Admin `/admin/review`:
- Add calendar grid option showing entire team's coverage
- Color coded by entity
- Helpful for spotting gaps in coverage

## Export Format (XLSX)

Single file per week. File name: `BMF_Payroll_WE_YYYY-MM-DD.xlsx` (date = Saturday).

**Sheet 1: "Summary"** - Primary sheet for payroll company

| Row | A | B | C | D | E |
|---|---|---|---|---|---|
| 1 | BMF WEEKLY PAYROLL | | | | |
| 2 | Week Ending: [Date] | | | | |
| 3 | | | | | |
| 4 | Employee | Corporate Hours | Plano Hours | Dallas Hours | Total Hours |
| 5+ | [Name] | [hrs] | [hrs] | [hrs] | [hrs] |
| last | TOTAL | [sum] | [sum] | [sum] | [sum] |

Hours as decimal to 2 places (e.g., 37.50). Row 1 bold 16pt merged A1:E1. Row 2 merged A2:E2 italic. Row 4 bold with bottom border. TOTAL row bold with top border. Freeze top 4 rows. Column widths: A=25, B-E=18.

**Sheet 2: "Detail"** - Supporting detail (always included, payroll can ignore)

Columns: Employee | Date | Day | Entity | Clock In | Clock Out | Break (min) | Hours | Notes | Approved

All entries from approved weeks, sorted by employee then chronologically. Apply subtle alternating row shading. Freeze top row.

**Sheet 3: "By Entity"** - Per-entity breakdown for management review

Three blocks (Corporate, Plano, Dallas). Each shows employees who worked that entity with their hours. Helpful for per-studio labor cost analysis.

## Deployment

### Step 1: Local build and test

```bash
npm install
npm run dev
```

Test locally at `http://localhost:5173`. Verify:
- Magic link login works
- Clock in/out round-trips to Supabase
- XLSX export downloads correctly
- PWA install prompt appears in Chrome
- Admin routes are protected

### Step 2: Deploy to Vercel

Push to GitHub. Connect Vercel to the repo. Add environment variables in Vercel dashboard:
- `VITE_SUPABASE_URL`
- `VITE_SUPABASE_ANON_KEY`
- `VITE_ADMIN_EMAIL`
- `SUPABASE_SERVICE_ROLE_KEY` (for edge functions)
- `VAPID_PUBLIC_KEY` and `VAPID_PRIVATE_KEY` (for push notifications, generated via `npx web-push generate-vapid-keys`)

Auto-deploy on push to main.

### Step 3: Custom Domain

In Vercel project settings > Domains, add `time.bodymachinefitness.com`. Vercel shows a CNAME record to add. Go to Jeremy's DNS provider and add:

```
Type: CNAME
Host: time
Value: cname.vercel-dns.com
TTL: Auto
```

Takes 5 to 30 minutes to propagate. SSL provisions automatically.

### Step 4: Supabase Edge Functions

Deploy the scheduled functions for push notifications:

```bash
supabase functions deploy send-push
supabase functions deploy check-forgotten-clockouts
```

Set the cron schedule for `check-forgotten-clockouts` to run every 30 minutes via Supabase cron extension:

```sql
select cron.schedule(
  'forgotten-clockouts',
  '*/30 * * * *',
  $$select net.http_post(
    url := 'https://<project>.supabase.co/functions/v1/check-forgotten-clockouts',
    headers := jsonb_build_object('Authorization', 'Bearer <service_role_key>')
  );$$
);
```

### Step 5: Admin Bootstrap

1. Go to `time.bodymachinefitness.com/login`
2. Enter Jeremy's email (`jeremy@bodymachinefitness.com`)
3. Click magic link from email
4. On first login, the system sees the email matches `VITE_ADMIN_EMAIL` and creates an employee record with `role = 'admin'`
5. Jeremy is now in admin mode
6. Go to `/admin/employees` and add each team member by email

Each added employee receives a magic link invitation. On their first login, they get an employee record with `role = 'employee'`.

## Testing Checklist

Before going live:

- [ ] Admin can log in with magic link
- [ ] Admin can register a passkey and log in biometrically
- [ ] Admin can add a test employee
- [ ] Test employee receives magic link and can log in
- [ ] Test employee can clock in, select entity, clock out
- [ ] Test employee can switch entities mid-day
- [ ] Test employee can take a break
- [ ] Test employee can add manual entry
- [ ] Test employee cannot access admin routes
- [ ] Admin sees test employee in `/admin/live` when clocked in
- [ ] Admin can edit test employee's entries in `/admin/review`
- [ ] Admin can approve test employee's week
- [ ] Approved entries lock for the employee
- [ ] Admin can generate XLSX export and download opens correctly
- [ ] XLSX Summary sheet matches the format above
- [ ] App installs to phone home screen (iOS and Android)
- [ ] App works offline (queue actions and sync on reconnect)
- [ ] Overtime banner appears when employee crosses 40 hours
- [ ] Forgot-clock-out push fires after 10 hours
- [ ] Geofence warning appears when clocking in away from studio
- [ ] Audit log captures all edits
- [ ] Siri shortcut URL triggers clock-in correctly
- [ ] Scheduled shift shows up in employee tracker when applicable

## Post-Deploy Onboarding Doc for Staff

Create `/help/onboarding` page:

1. On your phone, open Safari (iOS) or Chrome (Android)
2. Go to `time.bodymachinefitness.com`
3. Enter your BMF email, tap the magic link from your inbox
4. Install to home screen: Safari share menu > Add to Home Screen (iOS) or Chrome menu > Install app (Android)
5. Register Face ID / fingerprint for faster future logins
6. That's it, tap the BMF icon on your home screen any time

## Do Not

- Store any data in `localStorage` except a session flag. Supabase is the source of truth
- Allow employees to edit entries after approval (admin only)
- Skip RLS policies, ever
- Use the anon key on the server. Use service role key only in Edge Functions
- Commit any `.env` file to GitHub
- Block clock-in on geofence mismatch (soft warning only)
- Export CSV. Always XLSX
