# Going online

How The Builder Station goes from this PC to **https://app.thebuilderstation.com**.
Do the steps in order. Keys and passwords go only into the places named here: never into
chat, email, or a file that's committed.

| Piece | Service | Roughly |
| --- | --- | --- |
| The program and its database | Render (Ohio) | $7 + $6 a month to start |
| Files and backups | Cloudflare R2 | free up to 10 GB |
| "I'm not a robot" check | Cloudflare Turnstile | free |
| Email | Resend | free up to 3,000 a month |
| The address | GoDaddy (already yours) | — |

---

## 1. Cloudflare: file storage (R2)

1. Make a free account at **dash.cloudflare.com**.
2. **R2 Object Storage** → turn it on. It asks for a card, but stays free under 10 GB.
3. **Create bucket** → name it `builderstation-files`, location **Automatic**. Leave **public access off**.
4. **R2 → Manage API tokens → Create API token**:
   - Permission: **Object Read & Write**
   - Apply to: **only `builderstation-files`**
5. Keep the page open. You'll need three things from it:
   - **Access Key ID** → `S3_ACCESS_KEY_ID`
   - **Secret Access Key** → `S3_SECRET_ACCESS_KEY` (shown only once)
   - **Endpoint**, like `https://<account id>.r2.cloudflarestorage.com` → `S3_ENDPOINT`

## 2. Cloudflare: robot check (Turnstile)

1. **Turnstile → Add widget**. Name it `The Builder Station`.
2. Hostname: `app.thebuilderstation.com`. Mode: **Managed**.
3. Copy the **Site Key** → `TURNSTILE_SITE_KEY`, and the **Secret Key** → `TURNSTILE_SECRET_KEY`.

## 3. Resend: email

1. Make an account at **resend.com**.
2. **Domains → Add domain** → `thebuilderstation.com`. Resend shows a few DNS records; add them in step 5.
3. **API Keys → Create** with **Sending access** → `RESEND_API_KEY`.

## 4. Render: the program and the database

1. Make an account at **render.com** and connect your GitHub.
2. **New → Blueprint** → pick this repository.

   Render reads `render.yaml` and sets up:
   - the program, with the address `app.thebuilderstation.com`
   - the database (Postgres 17, Ohio)
   - all the settings. Secrets like `SESSION_SECRET` and `ENCRYPTION_KEY` are made for you.
3. It asks for the settings Render can't make. Paste in the values from steps 1–3:
   - `S3_ENDPOINT`, `S3_ACCESS_KEY_ID`, `S3_SECRET_ACCESS_KEY`
   - `RESEND_API_KEY`
   - `TURNSTILE_SITE_KEY`, `TURNSTILE_SECRET_KEY`
4. **Apply**. The first deploy builds the program, then sets up the empty database's tables and its company-separation rules.

   If a setting is missing, the program won't start, and Render's log names exactly which one.

**Pushing to GitHub doesn't change the live site.** When a new version is ready, go to Render → builderstation → **Manual Deploy → Deploy latest commit**.

## 5. GoDaddy: point the address

In GoDaddy → **My Products → thebuilderstation.com → DNS**:

| Type | Name | Value |
| --- | --- | --- |
| CNAME | `app` | the `…onrender.com` address Render shows under **Settings → Custom Domains** |
| (Resend's records) | as shown | as shown in Resend → Domains |

Also, under **Forwarding**, forward `thebuilderstation.com` → `https://app.thebuilderstation.com` (permanent, 301). The bare address stays free for a website later.

Then:
- In Render, under **Custom Domains**, click **Verify**. Render turns on HTTPS by itself.
- In Resend, click **Verify** on the domain.

DNS can take a few minutes to an hour.

## 6. Move JT&I up (this PC → online)

1. Make a file named **`.env.online`** in the project folder. It's never committed. Put this in it:

   ```
   ONLINE_DATABASE_URL="…"   # Render → builderstation-db → Connect → External Database URL
   S3_ENDPOINT="…"
   S3_BUCKET="builderstation-files"
   S3_ACCESS_KEY_ID="…"
   S3_SECRET_ACCESS_KEY="…"
   ```

2. Stop the program on this PC, so nothing changes mid-copy.
3. Check first. This copies nothing:

   ```
   npm run go-online:copy
   ```

4. Copy:

   ```
   npm run go-online:copy -- --go
   ```

   Every file is checked after it's uploaded, and every record is counted.
   Anyone who used two-step sign-in sets it up again the first time they sign in online (the script names them).

5. Sign in at **https://app.thebuilderstation.com** with your usual email and password. Look over Whitfield.

**From here on, the online version is the real one.** This PC is for building and trying out new features.

## 7. Afterwards

- Delete `.env.online`, or keep it somewhere safe.
- In Render → builderstation-db → **Networking**, limit outside connections to your own IP address. Render's own services always connect.
- In Settings → Company, click **Back up now** once. Then check that a backup is listed.

## 8. When it needs more power: more copies

The program is safe to run as several copies at once, sharing one database:

- **Background work runs once.** The nightly backup, the morning emails, the long-shift emails and reworking a
  job's lumber lines each take a claim in the database first (`JobLock`, see `src/lib/job-lock.ts`). Only one
  copy gets it; the others skip or wait. If a copy stops halfway, its claim runs out and another picks it up.
- **Sign-in limits are shared.** Wrong passwords, codes and forms sent too often are counted in the database
  (`RateLimit`), so more copies don't mean more guesses.
- **Sign-ins work on any copy.** Each one carries its own signed ticket.

To add copies: Render → builderstation → **Scaling** → set the number of instances (Render's plans that allow
more than one instance). Watch the database too: more copies means more connections. Turn up its plan
(builderstation-db) if pages start waiting on it.

To check it on this PC: `npm run test:copies` — two separate processes race for the same claims, count the same
wrong tries, and (with `TEST_JOB_ID` set to a test job) rework the same job's lines at once.

## 9. Files straight to and from Cloudflare (switch on once)

Out of the box, files go through the program: it pulls a plan set out of R2 and passes it on (streamed, a piece at a
time), and uploads come in through it. Switched on, files go **straight between the browser and R2**: the program
still checks who may open or upload a file, then hands the browser a private link to R2, good for an hour (opening)
or one upload. Big plans open faster, opening one again is instant, uploads show real progress, and the program's
memory stays free.

1. **Cloudflare → R2 → builderstation-files → Settings → CORS policy → Add CORS policy**, paste this, save:

   ```json
   [
     {
       "AllowedOrigins": ["https://app.thebuilderstation.com"],
       "AllowedMethods": ["GET", "HEAD", "PUT"],
       "AllowedHeaders": ["Content-Type", "Range"],
       "ExposeHeaders": ["Content-Length", "Content-Range", "Accept-Ranges", "Content-Type", "Content-Disposition", "ETag"],
       "MaxAgeSeconds": 3600
     }
   ]
   ```

   The bucket stays private (public access off) and no keys change. This only lets the browser, from your own
   address, use the private links the program gives it.

2. **Render → builderstation → Environment → Add**: `FILES_DIRECT` = `on`. Save (it redeploys).

3. Check: open a plan set on the takeoff, open a PDF in Files, upload a file in Files (a progress bar shows per file)
   and a plan set on Plans.

To switch back: set `FILES_DIRECT` to `off` (or delete it). Nothing else changes; files are where they always were.

If a plan says "Failed to fetch" with it on: the browser's rules (src/lib/security-headers.ts) must allow the storage
address — they take it from `S3_ENDPOINT` when the program is built. Check the CORS policy (step 1) too.
