# HEMA Space Passport · Kurdistan Astronomy Festival 2026

Visitors create a personal space passport on a kiosk or on their own phone. Every passport is saved to a database, and organisers see them on the admin page (the **Admin** button in the footer).

The site is plain files, so it runs on **GitHub Pages** for free. Passports are stored in **Supabase** (a free online database). Your admin password lives only in Supabase; it is never in this code.

| File | Purpose |
|---|---|
| `index.html` | Visitor flow: welcome → personal details → space identity → generating → passport issued |
| `admin/` | Admin page: sign in, live list, search, statistics, passport viewer, CSV export, delete |
| `js/config.js` | **Your Supabase address and public key** (the only file you need to edit) |
| `js/db.js` | Talks to the database |
| `js/data.js` | Event text, logos, destination / role / mission lists, mission class |
| `js/render.js` | Draws the passport |
| `js/app.js` | Visitor flow, photo upload, saving, download |
| `supabase/setup.sql` | Creates the database table and the security rules (run once in Supabase) |

## Set up the database (once, about 10 minutes)

1. **Create a project.** Go to supabase.com, sign up (free) and click **New project**. Pick a name (e.g. `hema-passport`), a database password (keep it somewhere safe; it is not your admin password) and the region closest to Kurdistan (e.g. Frankfurt).
2. **Create the table and rules.** In your project open **SQL Editor → New query**, paste the whole contents of `supabase/setup.sql`, and click **Run**. It should say "Success".
3. **Create your admin login.** Open **Authentication → Users → Add user → Create new user**. Enter your email (`redyar8r@gmail.com`) and the password you want to use for the admin page, tick **Auto Confirm User**, and click **Create user**.
4. **Turn off public sign-ups.** Open **Authentication → Sign In / Providers** (called "Providers" or "Settings" in some versions) and switch off **Allow new users to sign up**. Only the accounts you add yourself can then sign in.
5. **Connect the site.** Open **Project Settings → API** (or **Data API** / **API Keys**). Copy the **Project URL** and the **anon public** key (newer projects call it the **publishable** key). Paste them into `js/config.js`:

   ```js
   window.HEMA.SUPABASE = {
     url: 'https://abcdefghijkl.supabase.co',
     key: 'eyJhbGciOi...',
   };
   ```

   These two values are meant to be public. The rules from step 2 make sure visitors can only *add* passports, and only emails on the admin list can read or delete them.

To add another organiser later: create their user as in step 3, then run this in the SQL Editor:
`insert into public.admins (email) values ('their@email.com');`

## Put it on GitHub Pages

1. Commit and push all files (including your edited `js/config.js`) to your GitHub repository.
2. On GitHub open the repository → **Settings → Pages**. Under **Build and deployment** choose **Deploy from a branch**, branch **main**, folder **/ (root)**, and click **Save**.
3. After a minute the site is live at `https://<your-username>.github.io/<repository-name>/`
   - Visitors: that address (share it as a QR code or poster at the festival).
   - Admin: the **Admin** button in the footer, or `https://<your-username>.github.io/<repository-name>/admin/`

## The festival kiosk (a shared screen)

Open the site once on the kiosk with `?kiosk` at the end:
`https://<your-username>.github.io/<repository-name>/?kiosk`

The device remembers it. In kiosk mode the site returns to the welcome screen after 3 minutes without use (`IDLE_RESET_SECONDS` in `js/data.js`), so the next visitor starts fresh. Visitors' own phones never do this, so nobody loses their passport by switching apps. To turn kiosk mode off on a device, open the site once with `?kiosk=off`.

## Updating the database script

When `supabase/setup.sql` changes, run it again the same way (SQL Editor → New query → paste → Run). It is safe to run any number of times and keeps all saved passports. The site keeps working with the older version in the meantime.

## Using the admin page

- Sign in with the email and password from step 3. You stay signed in on that device until you press **Sign out**.
- New passports appear within 10 seconds.
- Search by name, passport number, callsign or city.
- Click a passport to see it in full with the photo, download it as a PNG, or delete it.
- **Export CSV** downloads everything for Excel.
- **Download PDF** makes a printable A4 register: a cover page with totals and charts, then every passport as a card with its photo (8 per page).

## What is saved

For each passport: passport number, first / second / third name, age, city / country, callsign, destination, role, mission, date and time, and a small copy of the photo if one was uploaded. Only admins can see it.

## If the internet drops

The site keeps working. The passport is issued with a number made on the device, and the record waits on that device. It is sent automatically once the connection is back (checked every 30 seconds), and marked "Saved later" in the admin view. The same happens if a passport is made before the database is connected.

## Notes

- Passport numbers are `HEMA-KAF-2026-NNNNNN`, unique across all devices.
- A passport is never saved twice, even if the Wi-Fi drops just as it is being sent.
- The phone's Back button steps back one screen instead of leaving the site.
- Supabase's free plan pauses a project after about a week with no activity. Open the admin page before the festival to wake it, or check Supabase's current plan details.
- Add `assets/kaf-logo.png` for the festival logo; until then a built-in KAF badge is shown.
- To test on your computer, run any static server in this folder, e.g. `npx serve .`, and open the address it prints.
