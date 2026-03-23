const Database = require('better-sqlite3');
const path = require('path');
const fs = require('fs');
const cfg = require('./config');

// Ensure data directory exists
const dbDir = path.dirname(cfg.db.path);
if (!fs.existsSync(dbDir)) fs.mkdirSync(dbDir, { recursive: true });

const db = new Database(cfg.db.path);

// Enable WAL mode for better concurrent performance
db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = ON');

// ── Schema ────────────────────────────────────────────────────────────────────

db.exec(`
  CREATE TABLE IF NOT EXISTS leads (
    id            TEXT PRIMARY KEY,
    created_at    DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at    DATETIME DEFAULT CURRENT_TIMESTAMP,

    -- Contact
    name          TEXT NOT NULL,
    email         TEXT NOT NULL,
    phone         TEXT,
    organisation  TEXT,
    designation   TEXT,

    -- Project context
    plan          TEXT,        -- professional | enterprise | source
    team_size     TEXT,
    project_type  TEXT,
    message       TEXT,
    source        TEXT,        -- which form: hero | quote | book | pay | direct

    -- Pipeline status
    status        TEXT DEFAULT 'new',
    -- Statuses: new → contacted → quoted → demo_booked → negotiating → won → lost

    -- Internal notes (Ankit only)
    notes         TEXT,
    assigned_to   TEXT DEFAULT 'Ankit',

    -- Metadata
    ip            TEXT,
    user_agent    TEXT,
    referrer      TEXT,
    whatsapp_sent INTEGER DEFAULT 0,
    email_sent    INTEGER DEFAULT 0
  );

  CREATE TABLE IF NOT EXISTS bookings (
    id            TEXT PRIMARY KEY,
    lead_id       TEXT REFERENCES leads(id),
    created_at    DATETIME DEFAULT CURRENT_TIMESTAMP,

    name          TEXT NOT NULL,
    email         TEXT NOT NULL,
    phone         TEXT,
    organisation  TEXT,

    slot_date     TEXT NOT NULL,   -- YYYY-MM-DD
    slot_time     TEXT NOT NULL,   -- HH:MM
    slot_tz       TEXT DEFAULT 'Asia/Kolkata',
    duration_min  INTEGER DEFAULT 30,
    meeting_type  TEXT DEFAULT 'video', -- video | call | inperson

    plan_interest TEXT,
    message       TEXT,

    status        TEXT DEFAULT 'pending',
    -- pending | confirmed | cancelled | completed | no_show

    confirmation_sent INTEGER DEFAULT 0,
    reminder_sent     INTEGER DEFAULT 0,
    notes             TEXT
  );

  CREATE TABLE IF NOT EXISTS quotes (
    id            TEXT PRIMARY KEY,
    lead_id       TEXT REFERENCES leads(id),
    created_at    DATETIME DEFAULT CURRENT_TIMESTAMP,

    plan          TEXT NOT NULL,
    billing       TEXT NOT NULL,   -- monthly | annual
    users         INTEGER,
    amount        REAL,
    currency      TEXT DEFAULT 'INR',
    gst_amount    REAL,
    total_amount  REAL,
    valid_until   DATE,

    status        TEXT DEFAULT 'sent',
    -- sent | viewed | accepted | rejected | expired

    pdf_path      TEXT,
    notes         TEXT
  );

  CREATE TABLE IF NOT EXISTS payments (
    id               TEXT PRIMARY KEY,
    lead_id          TEXT REFERENCES leads(id),
    created_at       DATETIME DEFAULT CURRENT_TIMESTAMP,

    razorpay_order_id   TEXT UNIQUE,
    razorpay_payment_id TEXT,
    razorpay_signature  TEXT,

    plan             TEXT,
    billing          TEXT,
    users            INTEGER,
    amount           REAL NOT NULL,
    currency         TEXT DEFAULT 'INR',
    gst_amount       REAL,
    total_amount     REAL,

    method           TEXT,  -- razorpay | upi | bank_transfer
    status           TEXT DEFAULT 'pending',
    -- pending | paid | failed | refunded

    invoice_number   TEXT,
    invoice_sent     INTEGER DEFAULT 0,
    notes            TEXT
  );

  CREATE TABLE IF NOT EXISTS activities (
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    lead_id     TEXT REFERENCES leads(id),
    created_at  DATETIME DEFAULT CURRENT_TIMESTAMP,
    type        TEXT,  -- note | status_change | email_sent | whatsapp | call | payment
    description TEXT,
    created_by  TEXT DEFAULT 'system'
  );

  -- Indexes for common queries
  CREATE INDEX IF NOT EXISTS idx_leads_status    ON leads(status);
  CREATE INDEX IF NOT EXISTS idx_leads_email     ON leads(email);
  CREATE INDEX IF NOT EXISTS idx_leads_created   ON leads(created_at DESC);
  CREATE INDEX IF NOT EXISTS idx_bookings_date   ON bookings(slot_date);
  CREATE INDEX IF NOT EXISTS idx_payments_status ON payments(status);
`);

// ── Helper Methods ─────────────────────────────────────────────────────────────

const helpers = {

  // Leads
  createLead(data) {
    const { v4: uuidv4 } = require('uuid');
    const id = uuidv4();
    const stmt = db.prepare(`
      INSERT INTO leads (id, name, email, phone, organisation, designation,
        plan, team_size, project_type, message, source, ip, user_agent, referrer)
      VALUES (@id, @name, @email, @phone, @organisation, @designation,
        @plan, @team_size, @project_type, @message, @source, @ip, @user_agent, @referrer)
    `);
    stmt.run({
      id,
      name:         data.name         || null,
      email:        data.email        || null,
      phone:        data.phone        || null,
      organisation: data.organisation || null,
      designation:  data.designation  || null,
      plan:         data.plan         || null,
      team_size:    data.team_size    || null,
      project_type: data.project_type || null,
      message:      data.message      || null,
      source:       data.source       || null,
      ip:           data.ip           || null,
      user_agent:   data.user_agent   || null,
      referrer:     data.referrer     || null,
    });
    helpers.addActivity(id, 'note', `Lead created via ${data.source || 'unknown'}`);
    return id;
  },

  getLead(id) {
    return db.prepare('SELECT * FROM leads WHERE id = ?').get(id);
  },

  getAllLeads(filters = {}) {
    let q = 'SELECT * FROM leads WHERE 1=1';
    const params = [];
    if (filters.status) { q += ' AND status = ?'; params.push(filters.status); }
    if (filters.plan)   { q += ' AND plan = ?';   params.push(filters.plan); }
    if (filters.search) {
      q += ' AND (name LIKE ? OR email LIKE ? OR organisation LIKE ?)';
      const s = `%${filters.search}%`;
      params.push(s, s, s);
    }
    q += ' ORDER BY created_at DESC';
    if (filters.limit) { q += ' LIMIT ?'; params.push(filters.limit); }
    return db.prepare(q).all(...params);
  },

  updateLeadStatus(id, status, note = '') {
    db.prepare('UPDATE leads SET status = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?').run(status, id);
    helpers.addActivity(id, 'status_change', `Status changed to ${status}${note ? ': ' + note : ''}`);
  },

  updateLeadNotes(id, notes) {
    db.prepare('UPDATE leads SET notes = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?').run(notes, id);
  },

  markEmailSent(id) {
    db.prepare('UPDATE leads SET email_sent = 1, updated_at = CURRENT_TIMESTAMP WHERE id = ?').run(id);
    helpers.addActivity(id, 'email_sent', 'Notification email sent to Ankit');
  },

  markWhatsappSent(id) {
    db.prepare('UPDATE leads SET whatsapp_sent = 1, updated_at = CURRENT_TIMESTAMP WHERE id = ?').run(id);
  },

  // Bookings
  createBooking(data) {
    const { v4: uuidv4 } = require('uuid');
    const id = uuidv4();
    db.prepare(`
      INSERT INTO bookings (id, lead_id, name, email, phone, organisation,
        slot_date, slot_time, duration_min, meeting_type, plan_interest, message)
      VALUES (@id, @lead_id, @name, @email, @phone, @organisation,
        @slot_date, @slot_time, @duration_min, @meeting_type, @plan_interest, @message)
    `).run({ id, ...data });
    if (data.lead_id) helpers.addActivity(data.lead_id, 'note', `Demo booked: ${data.slot_date} ${data.slot_time}`);
    return id;
  },

  getBooking(id) {
    return db.prepare('SELECT * FROM bookings WHERE id = ?').get(id);
  },

  getAllBookings(filters = {}) {
    let q = 'SELECT b.*, l.organisation FROM bookings b LEFT JOIN leads l ON b.lead_id = l.id WHERE 1=1';
    const params = [];
    if (filters.date)   { q += ' AND b.slot_date = ?'; params.push(filters.date); }
    if (filters.status) { q += ' AND b.status = ?';    params.push(filters.status); }
    q += ' ORDER BY b.slot_date ASC, b.slot_time ASC';
    return db.prepare(q).all(...params);
  },

  getBookedSlots(date) {
    return db.prepare(
      "SELECT slot_time FROM bookings WHERE slot_date = ? AND status NOT IN ('cancelled')"
    ).all(date).map(r => r.slot_time);
  },

  updateBookingStatus(id, status) {
    db.prepare('UPDATE bookings SET status = ? WHERE id = ?').run(status, id);
  },

  // Quotes
  createQuote(data) {
    const { v4: uuidv4 } = require('uuid');
    const id = 'QT-' + Date.now().toString(36).toUpperCase();
    const gst = Math.round((data.amount || 0) * 0.18 * 100) / 100;
    const valid = new Date(); valid.setDate(valid.getDate() + 14);
    db.prepare(`
      INSERT INTO quotes (id, lead_id, plan, billing, users, amount, gst_amount, total_amount, valid_until)
      VALUES (@id, @lead_id, @plan, @billing, @users, @amount, @gst, @total, @valid)
    `).run({
      id,
      lead_id: data.lead_id,
      plan: data.plan,
      billing: data.billing,
      users: data.users,
      amount: data.amount,
      gst,
      total: Math.round((data.amount + gst) * 100) / 100,
      valid: valid.toISOString().split('T')[0],
    });
    return id;
  },

  // Payments
  createPaymentOrder(data) {
    const { v4: uuidv4 } = require('uuid');
    const id = uuidv4();
    const gst = Math.round(data.amount * 0.18 * 100) / 100;
    db.prepare(`
      INSERT INTO payments (id, lead_id, razorpay_order_id, plan, billing, users, amount, gst_amount, total_amount, method)
      VALUES (@id, @lead_id, @order_id, @plan, @billing, @users, @amount, @gst, @total, @method)
    `).run({
      id, ...data,
      gst,
      total: Math.round((data.amount + gst) * 100) / 100,
    });
    return id;
  },

  markPaymentPaid(orderId, paymentId, signature) {
    const inv = 'INV-' + Date.now().toString(36).toUpperCase();
    db.prepare(`
      UPDATE payments SET status = 'paid', razorpay_payment_id = ?,
        razorpay_signature = ?, invoice_number = ?, updated_at = CURRENT_TIMESTAMP
      WHERE razorpay_order_id = ?
    `).run(paymentId, signature, inv, orderId);
    const pay = db.prepare('SELECT * FROM payments WHERE razorpay_order_id = ?').get(orderId);
    if (pay?.lead_id) {
      helpers.updateLeadStatus(pay.lead_id, 'won', 'Payment received');
      helpers.addActivity(pay.lead_id, 'payment', `Payment received: ₹${pay.total_amount} — Invoice ${inv}`);
    }
    return pay;
  },

  getAllPayments() {
    return db.prepare(`
      SELECT p.*, l.name as lead_name, l.organisation
      FROM payments p LEFT JOIN leads l ON p.lead_id = l.id
      ORDER BY p.created_at DESC
    `).all();
  },

  // Activities
  addActivity(leadId, type, description, createdBy = 'system') {
    db.prepare(
      'INSERT INTO activities (lead_id, type, description, created_by) VALUES (?, ?, ?, ?)'
    ).run(leadId, type, description, createdBy);
  },

  getActivities(leadId) {
    return db.prepare(
      'SELECT * FROM activities WHERE lead_id = ? ORDER BY created_at DESC'
    ).all(leadId);
  },

  // Dashboard stats
  getStats() {
    return {
      total:        db.prepare("SELECT COUNT(*) as c FROM leads").get().c,
      new:          db.prepare("SELECT COUNT(*) as c FROM leads WHERE status = 'new'").get().c,
      contacted:    db.prepare("SELECT COUNT(*) as c FROM leads WHERE status = 'contacted'").get().c,
      quoted:       db.prepare("SELECT COUNT(*) as c FROM leads WHERE status = 'quoted'").get().c,
      demo_booked:  db.prepare("SELECT COUNT(*) as c FROM leads WHERE status = 'demo_booked'").get().c,
      won:          db.prepare("SELECT COUNT(*) as c FROM leads WHERE status = 'won'").get().c,
      lost:         db.prepare("SELECT COUNT(*) as c FROM leads WHERE status = 'lost'").get().c,
      revenue:      db.prepare("SELECT COALESCE(SUM(total_amount),0) as r FROM payments WHERE status='paid'").get().r,
      bookings_today: db.prepare("SELECT COUNT(*) as c FROM bookings WHERE slot_date = date('now') AND status != 'cancelled'").get().c,
    };
  },
};

module.exports = { db, ...helpers };