# Musk-IT Sales Engine — Deployment Guide
## Hostinger KVM2 VPS · Ubuntu 22.04

---

## Step 1 — First-time VPS setup (run once)

```bash
ssh root@YOUR_VPS_IP
bash setup.sh
```

---

## Step 2 — Upload your files

From your local machine:
```bash
scp -r sales-engine/ root@YOUR_VPS_IP:/var/www/sales-engine/
```

Or clone from your Git repo:
```bash
cd /var/www
git clone YOUR_REPO_URL sales-engine
```

---

## Step 3 — Configure environment

```bash
cd /var/www/sales-engine/backend
cp .env.example .env
nano .env
```

Fill in:
- `ADMIN_EMAIL` — admin inbox that should receive dashboard OTPs
- `ADMIN_SESSION_SECRET` — any long random string (64+ chars)
- `RAZORPAY_KEY_ID` / `RAZORPAY_KEY_SECRET` — from Razorpay dashboard
- `EMAIL_USER` / `EMAIL_PASS` — SMTP credentials used for lead emails and admin OTP delivery
- `GOOGLE_SERVICE_ACCOUNT_EMAIL` / `GOOGLE_PRIVATE_KEY` / `GOOGLE_SHEET_ID` — optional

---

## Step 4 — Install dependencies and start

```bash
cd /var/www/sales-engine/backend
npm install
pm2 start server.js --name muskit-sales
pm2 save
```

---

## Step 5 — Enable SSL (free, takes 2 minutes)

Point `sales.muskit.in` DNS A record to your VPS IP first, then:

```bash
certbot --nginx -d sales.muskit.in
```

Choose option 2 (redirect HTTP to HTTPS).

---

## Step 6 — Verify everything works

```bash
curl https://sales.muskit.in/api/health
# Should return: {"status":"ok","version":"1.0.0",...}
```

Visit:
- `https://sales.muskit.in` — landing page
- `https://sales.muskit.in/book.html` — demo booking
- `https://sales.muskit.in/quote.html` — quote builder
- `https://sales.muskit.in/pay.html` — payment page
- `https://sales.muskit.in/admin/dashboard.html` — CRM (enter `ADMIN_EMAIL`, then use the email OTP)

---

## Useful PM2 commands

```bash
pm2 status                        # Check if running
pm2 logs muskit-sales             # View live logs
pm2 restart muskit-sales          # Restart after .env changes
pm2 stop muskit-sales             # Stop
```

---

## Setting up Gmail App Password (for email notifications)

1. Go to your Google Account → Security
2. Enable 2-Step Verification (required)
3. Go to → App Passwords
4. Generate a password for "Mail" → "Other device"
5. Copy the 16-character password into `EMAIL_PASS` in `.env`

---

## Setting up Google Sheets (optional but recommended)

1. Go to https://console.cloud.google.com
2. Create a new project (e.g. "muskit-sales")
3. Enable Google Sheets API
4. Create a Service Account → generate JSON key
5. Copy `client_email` → `GOOGLE_SERVICE_ACCOUNT_EMAIL` in `.env`
6. Copy `private_key` → `GOOGLE_PRIVATE_KEY` in `.env`
7. Create a Google Sheet, share it with the service account email (Editor access)
8. Copy the Sheet ID from the URL → `GOOGLE_SHEET_ID` in `.env`

---

## Setting up Razorpay webhook

1. Go to Razorpay Dashboard → Settings → Webhooks
2. Add webhook URL: `https://sales.muskit.in/api/pay/webhook`
3. Select events: `payment.captured`
4. Copy the webhook secret → `RAZORPAY_WEBHOOK_SECRET` in `.env`
5. Restart: `pm2 restart muskit-sales`

---

## File structure on VPS

```
/var/www/sales-engine/
├── backend/
│   ├── server.js         ← Main Express app
│   ├── config.js         ← All config (reads from .env)
│   ├── db.js             ← SQLite database
│   ├── mailer.js         ← Email templates
│   ├── sheets.js         ← Google Sheets integration
│   ├── whatsapp.js       ← WhatsApp notification builder
│   ├── .env              ← YOUR SECRETS (never commit this)
│   ├── package.json
│   └── node_modules/
├── frontend/
│   ├── index.html        ← Landing page
│   ├── quote.html        ← Quote builder
│   ├── book.html         ← Demo booking
│   ├── pay.html          ← Payment page
│   ├── thankyou.html     ← Confirmation page
│   └── admin/
│       └── dashboard.html ← CRM (email OTP protected)
├── data/
│   └── leads.db          ← SQLite database (auto-created)
└── setup.sh
```
