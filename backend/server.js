require('dotenv').config();
const express    = require('express');
const cors       = require('cors');
const helmet     = require('helmet');
const rateLimit  = require('express-rate-limit');
const crypto     = require('crypto');
const path       = require('path');
const Razorpay   = require('razorpay');

const cfg      = require('./config');
const db       = require('./db');
const mailer   = require('./mailer');
const sheets   = require('./sheets');
const wa       = require('./whatsapp');

const app = express();

// ── Security middleware ───────────────────────────────────────────────────────
app.use(helmet({ contentSecurityPolicy: false }));
app.use(cors({ origin: [cfg.baseUrl, 'https://muskit.in', 'http://localhost:3000'] }));

// Raw body for Razorpay webhook signature verification
app.use('/api/pay/webhook', express.raw({ type: 'application/json' }));
app.use(express.json({ limit: '10kb' }));
app.use(express.urlencoded({ extended: true }));

// Serve frontend static files
app.use(express.static(path.join(__dirname, '../frontend')));

// Rate limiter — 30 requests per 15 min per IP for API routes
const limiter = rateLimit({ windowMs: 15 * 60 * 1000, max: 30, standardHeaders: true });
app.use('/api/', limiter);

// Razorpay client (lazy — only if keys set)
function getRazorpay() {
  if (!cfg.razorpay.keyId || cfg.razorpay.keyId.includes('placeholder')) return null;
  return new Razorpay({ key_id: cfg.razorpay.keyId, key_secret: cfg.razorpay.keySecret });
}

// ── Admin auth middleware ─────────────────────────────────────────────────────
function adminAuth(req, res, next) {
  const token = req.headers['x-admin-token'] || req.query.token;
  const expected = crypto.createHash('sha256').update(cfg.admin.password).digest('hex');
  if (token !== expected) {
    return res.status(401).json({ error: 'Unauthorized' });
  }
  next();
}

// ── Health check ──────────────────────────────────────────────────────────────
app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', version: '1.0.0', time: new Date().toISOString() });
});

// ── Config endpoint (public — safe values only) ───────────────────────────────
app.get('/api/config', (req, res) => {
  res.json({
    razorpay_key: cfg.razorpay.keyId.includes('placeholder') ? null : cfg.razorpay.keyId,
    currency: cfg.razorpay.currency,
    plans: cfg.plans,
    upi: cfg.upi,
    bank: { ...cfg.bank, account: cfg.bank.account.replace(/./g, (c, i) => i < cfg.bank.account.length - 4 ? '*' : c) },
    sales: { name: cfg.sales.name, whatsapp: cfg.sales.whatsapp, phone: cfg.sales.phone },
  });
});

// ── Slots endpoint — available demo booking times ─────────────────────────────
app.get('/api/slots', (req, res) => {
  const { date } = req.query;
  if (!date || !/^\d{4}-\d{2}-\d{2}$/.test(date)) {
    return res.status(400).json({ error: 'Invalid date format. Use YYYY-MM-DD' });
  }

  const day = new Date(date);
  const dayOfWeek = day.getDay(); // 0=Sun, 6=Sat

  // No slots on Sunday
  if (dayOfWeek === 0) return res.json({ slots: [], reason: 'Closed on Sundays' });

  // All possible slots (9am–6pm IST, 30-min intervals)
  const allSlots = [];
  for (let h = 9; h < 18; h++) {
    allSlots.push(`${String(h).padStart(2,'0')}:00`);
    allSlots.push(`${String(h).padStart(2,'0')}:30`);
  }

  // Remove already-booked slots
  const booked = db.getBookedSlots(date);
  const available = allSlots.filter(s => !booked.includes(s));

  // Don't show slots in the past if today
  const today = new Date().toISOString().split('T')[0];
  const now = new Date();
  const filtered = date === today
    ? available.filter(s => {
        const [h, m] = s.split(':').map(Number);
        const slotTime = new Date(); slotTime.setHours(h, m, 0, 0);
        return slotTime > new Date(now.getTime() + 2 * 60 * 60 * 1000); // 2hr buffer
      })
    : available;

  res.json({ slots: filtered, booked });
});

// ── POST /api/lead — capture lead from any form ────────────────────────────────
app.post('/api/lead', async (req, res) => {
  const { name, email, phone, organisation, designation, plan, team_size,
          project_type, message, source } = req.body;

  if (!name?.trim() || !email?.trim()) {
    return res.status(400).json({ error: 'Name and email are required' });
  }
  if (!/\S+@\S+\.\S+/.test(email)) {
    return res.status(400).json({ error: 'Invalid email address' });
  }

  try {
    const leadId = db.createLead({
      name: name.trim(),
      email: email.trim().toLowerCase(),
      phone: phone?.trim(),
      organisation: organisation?.trim(),
      designation: designation?.trim(),
      plan, team_size, project_type,
      message: message?.trim(),
      source: source || 'form',
      ip: req.ip,
      user_agent: req.headers['user-agent'],
      referrer: req.headers['referer'],
    });

    // Fire notifications in background (don't await — fast response)
    Promise.all([
      mailer.send(cfg.sales.email, mailer.templates.newLeadAlert({ name, email, phone, organisation, plan, team_size, message, source })),
      mailer.send(email, mailer.templates.leadAck({ name, organisation, plan })),
      sheets.appendLead({ id: leadId, name, email, phone, organisation, plan, team_size, project_type, message, source }),
    ]).then(() => {
      db.markEmailSent(leadId);
      db.markWhatsappSent(leadId);
    }).catch(e => console.error('[Lead] Notification error:', e.message));

    const waUrl = wa.notify('new_lead', { name, email, phone, organisation, plan, team_size, message, source });

    res.json({
      success: true,
      lead_id: leadId,
      message: 'Lead captured successfully',
      whatsapp_url: waUrl, // Used by frontend to show "Open in WhatsApp" button
    });
  } catch (err) {
    console.error('[Lead] Error:', err);
    res.status(500).json({ error: 'Failed to save lead. Please try again.' });
  }
});

// ── POST /api/book — create demo booking ──────────────────────────────────────
app.post('/api/book', async (req, res) => {
  const { name, email, phone, organisation, slot_date, slot_time,
          duration_min, meeting_type, plan_interest, message } = req.body;

  if (!name || !email || !slot_date || !slot_time) {
    return res.status(400).json({ error: 'Name, email, date and time are required' });
  }

  // Check slot is still available
  const booked = db.getBookedSlots(slot_date);
  if (booked.includes(slot_time)) {
    return res.status(409).json({ error: 'This slot was just taken. Please choose another time.' });
  }

  try {
    // Create or find lead
    let lead = db.getAllLeads({ search: email }).find(l => l.email === email.toLowerCase());
    let leadId;
    if (lead) {
      leadId = lead.id;
      db.updateLeadStatus(leadId, 'demo_booked', `Demo slot: ${slot_date} ${slot_time}`);
    } else {
      leadId = db.createLead({
        name, email: email.toLowerCase(), phone, organisation,
        plan: plan_interest, source: 'booking',
        ip: req.ip, user_agent: req.headers['user-agent'],
      });
      db.updateLeadStatus(leadId, 'demo_booked');
    }

    const bookingId = db.createBooking({
      lead_id: leadId, name, email, phone, organisation,
      slot_date, slot_time, duration_min: duration_min || 30,
      meeting_type: meeting_type || 'video',
      plan_interest, message,
    });

    // Notifications
    const bookingData = { name, email, phone, organisation, slot_date, slot_time, duration_min: duration_min||30, plan_interest, message };
    Promise.all([
      mailer.send(cfg.sales.email, mailer.templates.newBookingAlert(bookingData)),
      mailer.send(email, mailer.templates.bookingConfirmation(bookingData)),
      sheets.appendLead({ id: leadId, name, email, phone, organisation, plan: plan_interest, source: 'booking', message: `Demo: ${slot_date} ${slot_time}` }),
    ]).catch(e => console.error('[Book] Notification error:', e.message));

    const waUrl = wa.notify('new_booking', bookingData);

    res.json({
      success: true,
      booking_id: bookingId,
      lead_id: leadId,
      slot: `${slot_date} at ${slot_time} IST`,
      whatsapp_url: waUrl,
    });
  } catch (err) {
    console.error('[Book] Error:', err);
    res.status(500).json({ error: 'Booking failed. Please try again.' });
  }
});

// ── POST /api/quote — calculate quote ─────────────────────────────────────────
app.post('/api/quote', (req, res) => {
  const { plan, billing, users, name, email, organisation, phone } = req.body;

  if (!plan || !billing) {
    return res.status(400).json({ error: 'Plan and billing cycle required' });
  }

  const planCfg = cfg.plans[plan.toLowerCase().replace(/\s+/g, '_')];
  let baseAmount = 0;

  if (plan === 'professional') {
    const rate = billing === 'annual' ? cfg.plans.professional.annual : cfg.plans.professional.monthly;
    baseAmount = rate * (parseInt(users) || 5);
    if (billing === 'annual') baseAmount *= 12;
  }

  const gst = Math.round(baseAmount * 0.18 * 100) / 100;
  const total = Math.round((baseAmount + gst) * 100) / 100;

  // Save lead if contact info provided
  let leadId;
  if (name && email) {
    try {
      leadId = db.createLead({
        name, email: email.toLowerCase(), phone, organisation,
        plan, billing, source: 'quote_tool',
        ip: req.ip, user_agent: req.headers['user-agent'],
      });
      const quoteId = db.createQuote({ lead_id: leadId, plan, billing, users: parseInt(users)||5, amount: baseAmount });
      db.updateLeadStatus(leadId, 'quoted');

      // Send alert to Ankit
      mailer.send(cfg.sales.email, mailer.templates.newLeadAlert({ name, email, phone, organisation, plan, team_size: `${users} users`, source: 'quote_tool' }))
        .catch(e => console.error('[Quote] Email error:', e.message));
    } catch (e) {
      console.error('[Quote] Lead save error:', e.message);
    }
  }

  res.json({
    success: true,
    lead_id: leadId,
    quote: {
      plan,
      billing,
      users: parseInt(users) || 5,
      base_amount: baseAmount,
      gst_rate: '18%',
      gst_amount: gst,
      total_amount: total,
      currency: 'INR',
      valid_days: 14,
      custom: plan !== 'professional',
    },
  });
});

// ── POST /api/pay/create — create Razorpay order ──────────────────────────────
app.post('/api/pay/create', async (req, res) => {
  const { lead_id, plan, billing, users, name, email, phone, organisation } = req.body;
  const rzp = getRazorpay();

  // Calculate amount
  let baseAmount = 0;
  if (plan === 'professional') {
    const rate = billing === 'annual' ? cfg.plans.professional.annual : cfg.plans.professional.monthly;
    baseAmount = rate * (parseInt(users) || 1);
    if (billing === 'annual') baseAmount *= 12;
  } else {
    return res.status(400).json({ error: 'Online payment only available for Professional plan. Contact sales for Enterprise/Source.' });
  }

  const gst = Math.round(baseAmount * 0.18 * 100) / 100;
  const total = Math.round((baseAmount + gst) * 100) / 100;
  const amountPaise = Math.round(total * 100); // Razorpay uses paise

  // Ensure lead exists
  let leadId = lead_id;
  if (!leadId && name && email) {
    leadId = db.createLead({
      name, email: email?.toLowerCase(), phone, organisation,
      plan, source: 'payment', ip: req.ip,
    });
  }

  if (!rzp) {
    // Razorpay not configured — return bank/UPI details instead
    const paymentId = db.createPaymentOrder({
      lead_id: leadId, order_id: null, plan, billing,
      users: parseInt(users)||1, amount: baseAmount, method: 'bank_transfer',
    });
    return res.json({
      success: true,
      mode: 'manual',
      payment_id: paymentId,
      amount: total,
      upi: cfg.upi,
      bank: cfg.bank,
      instructions: `Please transfer ₹${total.toLocaleString('en-IN')} to the bank/UPI details and share the screenshot with Ankit.`,
    });
  }

  try {
    const order = await rzp.orders.create({
      amount: amountPaise,
      currency: cfg.razorpay.currency,
      receipt: `muskit_${Date.now()}`,
      notes: { plan, billing, users, name, email, organisation },
    });

    db.createPaymentOrder({
      lead_id: leadId, order_id: order.id, plan, billing,
      users: parseInt(users)||1, amount: baseAmount, method: 'razorpay',
    });

    res.json({
      success: true,
      mode: 'razorpay',
      order_id: order.id,
      amount: amountPaise,
      currency: cfg.razorpay.currency,
      key: cfg.razorpay.keyId,
      prefill: { name, email, contact: phone },
      notes: order.notes,
    });
  } catch (err) {
    console.error('[Pay] Razorpay order error:', err);
    res.status(500).json({ error: 'Could not create payment order. Please try again.' });
  }
});

// ── POST /api/pay/verify — verify Razorpay signature ─────────────────────────
app.post('/api/pay/verify', (req, res) => {
  const { razorpay_order_id, razorpay_payment_id, razorpay_signature } = req.body;

  const expected = crypto
    .createHmac('sha256', cfg.razorpay.keySecret)
    .update(`${razorpay_order_id}|${razorpay_payment_id}`)
    .digest('hex');

  if (expected !== razorpay_signature) {
    return res.status(400).json({ success: false, error: 'Payment signature verification failed' });
  }

  try {
    const payment = db.markPaymentPaid(razorpay_order_id, razorpay_payment_id, razorpay_signature);
    const lead = payment?.lead_id ? db.getLead(payment.lead_id) : null;

    // Send payment notifications
    Promise.all([
      mailer.send(cfg.sales.email, mailer.templates.paymentAlert(payment, lead)),
      lead?.email ? mailer.send(lead.email, mailer.templates.paymentConfirmation(payment, lead)) : Promise.resolve(),
    ]).catch(e => console.error('[Pay] Notification error:', e.message));

    wa.notify('payment', payment, lead);

    res.json({ success: true, invoice: payment?.invoice_number, message: 'Payment verified and recorded' });
  } catch (err) {
    console.error('[Pay] Verify error:', err);
    res.status(500).json({ error: 'Verification failed internally' });
  }
});

// ── POST /api/pay/webhook — Razorpay webhook ──────────────────────────────────
app.post('/api/pay/webhook', (req, res) => {
  const signature = req.headers['x-razorpay-signature'];
  const body = req.body; // raw buffer

  const expected = crypto
    .createHmac('sha256', cfg.razorpay.webhookSecret)
    .update(body)
    .digest('hex');

  if (expected !== signature) {
    return res.status(400).send('Invalid signature');
  }

  const event = JSON.parse(body.toString());
  console.log('[Webhook] Event:', event.event);

  if (event.event === 'payment.captured') {
    const p = event.payload.payment.entity;
    // Already handled via /verify — this is a backup
    console.log('[Webhook] Payment captured:', p.id, '₹', p.amount / 100);
  }

  res.json({ status: 'ok' });
});

// ═══════════════════════════════════════════════════════
// ADMIN API — all routes protected by adminAuth
// ═══════════════════════════════════════════════════════

// Auth check
app.post('/api/admin/login', (req, res) => {
  const { password } = req.body;
  if (password !== cfg.admin.password) {
    return res.status(401).json({ error: 'Wrong password' });
  }
  const token = crypto.createHash('sha256').update(cfg.admin.password).digest('hex');
  res.json({ success: true, token });
});

app.get('/api/admin/stats', adminAuth, (req, res) => {
  res.json(db.getStats());
});

app.get('/api/admin/leads', adminAuth, (req, res) => {
  const { status, plan, search, limit } = req.query;
  res.json(db.getAllLeads({ status, plan, search, limit: limit ? parseInt(limit) : undefined }));
});

app.get('/api/admin/leads/:id', adminAuth, (req, res) => {
  const lead = db.getLead(req.params.id);
  if (!lead) return res.status(404).json({ error: 'Lead not found' });
  const activities = db.getActivities(req.params.id);
  res.json({ ...lead, activities });
});

app.patch('/api/admin/leads/:id/status', adminAuth, (req, res) => {
  const { status, note } = req.body;
  const valid = ['new','contacted','quoted','demo_booked','negotiating','won','lost'];
  if (!valid.includes(status)) return res.status(400).json({ error: 'Invalid status' });
  db.updateLeadStatus(req.params.id, status, note);
  sheets.updateLeadStatus(req.params.id, status, note).catch(()=>{});
  res.json({ success: true });
});

app.patch('/api/admin/leads/:id/notes', adminAuth, (req, res) => {
  const { notes } = req.body;
  db.updateLeadNotes(req.params.id, notes);
  db.addActivity(req.params.id, 'note', notes ? `Notes updated` : 'Notes cleared', 'Ankit');
  res.json({ success: true });
});

app.post('/api/admin/leads/:id/activity', adminAuth, (req, res) => {
  const { type, description } = req.body;
  db.addActivity(req.params.id, type || 'note', description, 'Ankit');
  res.json({ success: true });
});

app.get('/api/admin/bookings', adminAuth, (req, res) => {
  res.json(db.getAllBookings(req.query));
});

app.patch('/api/admin/bookings/:id/status', adminAuth, (req, res) => {
  db.updateBookingStatus(req.params.id, req.body.status);
  res.json({ success: true });
});

app.get('/api/admin/payments', adminAuth, (req, res) => {
  res.json(db.getAllPayments());
});

// Serve admin dashboard (HTML is in frontend/admin/)
app.get('/admin*', (req, res) => {
  res.sendFile(path.join(__dirname, '../frontend/admin/dashboard.html'));
});

// Catch-all — serve frontend
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, '../frontend/index.html'));
});

// ── Start ─────────────────────────────────────────────────────────────────────
app.listen(cfg.port, () => {
  console.log(`\n🚀 Musk-IT Sales Engine running on port ${cfg.port}`);
  console.log(`   Frontend: ${cfg.baseUrl}`);
  console.log(`   Admin:    ${cfg.baseUrl}/admin/dashboard.html`);
  console.log(`   Health:   ${cfg.baseUrl}/api/health\n`);
});

module.exports = app;
