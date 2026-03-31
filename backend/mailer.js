const nodemailer = require('nodemailer');
const cfg = require('./config');

const transporter = nodemailer.createTransport({
  host: cfg.email.host,              // smtpout.secureserver.net
  port: Number(cfg.email.port),      // 587
  secure: Number(cfg.email.port) === 465, // true only for 465

  auth: {
    user: cfg.email.user,
    pass: cfg.email.pass,
  },

  tls: {
    rejectUnauthorized: false, // ✅ IMPORTANT for your setup
  },
});

// ── Shared HTML wrapper ──────────────────────────────────────────────────────
function wrap(title, body) {
  return `<!DOCTYPE html><html><head><meta charset="UTF-8">
<style>
  body{margin:0;padding:0;background:#04070f;font-family:'DM Sans',Arial,sans-serif;color:#F0F4FF}
  .wrap{max-width:600px;margin:32px auto;background:#101828;border:1px solid rgba(255,255,255,0.1);border-radius:14px;overflow:hidden}
  .hdr{background:#080d1a;padding:24px 32px;border-bottom:1px solid rgba(255,255,255,0.07)}
  .logo{font-size:20px;font-weight:800;letter-spacing:-.5px}
  .logo b{color:#3B8BF7}
  .body{padding:32px}
  h2{font-size:22px;font-weight:700;margin:0 0 12px;letter-spacing:-.5px}
  p{font-size:14px;color:#8B97B4;line-height:1.75;margin:0 0 14px}
  .card{background:#162033;border:1px solid rgba(255,255,255,0.08);border-radius:10px;padding:18px 22px;margin:18px 0}
  .card .row{display:flex;justify-content:space-between;padding:6px 0;border-bottom:1px solid rgba(255,255,255,0.05);font-size:13px}
  .card .row:last-child{border:none}
  .card .row .lbl{color:#505D78}.card .row .val{color:#F0F4FF;font-weight:500}
  .btn{display:inline-block;background:#3B8BF7;color:#fff;padding:12px 26px;border-radius:8px;font-size:14px;font-weight:600;text-decoration:none;margin:8px 0}
  .btn.teal{background:#1FD9A4;color:#04070f}
  .btn.wa{background:#25D366;color:#fff}
  .ftr{padding:20px 32px;border-top:1px solid rgba(255,255,255,0.07);font-size:12px;color:#505D78;text-align:center}
  .badge{display:inline-block;background:rgba(59,139,247,0.1);border:1px solid rgba(59,139,247,0.2);color:#3B8BF7;font-size:11px;font-weight:600;padding:3px 10px;border-radius:10px;letter-spacing:.5px;text-transform:uppercase}
</style>
</head><body>
<div class="wrap">
  <div class="hdr"><div class="logo">Musk<b>-IT</b></div></div>
  <div class="body">${body}</div>
  <div class="ftr">Musk-IT · AI Execution ERP · <a href="https://muskit.in" style="color:#3B8BF7">muskit.in</a><br>
  Questions? <a href="mailto:${cfg.sales.email}" style="color:#3B8BF7">${cfg.sales.email}</a></div>
</div></body></html>`;
}

// ── Templates ────────────────────────────────────────────────────────────────

const templates = {

  // To admin — OTP login code
  adminLoginOtp(data) {
    const body = `
      <div class="badge">Admin Login</div>
      <h2 style="margin-top:12px">Your one-time login code</h2>
      <p>Use the OTP below to access the Musk-IT sales dashboard. This code expires in ${data.expires_minutes} minutes.</p>
      <div class="card" style="text-align:center;padding:24px 22px">
        <div style="font-size:11px;color:#505D78;letter-spacing:1px;text-transform:uppercase;margin-bottom:10px">OTP</div>
        <div style="font-family:'Syne',Arial,sans-serif;font-size:34px;font-weight:800;letter-spacing:8px;color:#F0F4FF">${data.otp}</div>
      </div>
      <div class="card">
        <div class="row"><span class="lbl">Admin email</span><span class="val">${cfg.admin.email}</span></div>
        <div class="row"><span class="lbl">Requested from</span><span class="val">${data.ip || 'Unknown IP'}</span></div>
      </div>
      <p style="font-size:12px;color:#505D78">If you did not request this login, you can ignore this email safely.</p>
      <a href="${cfg.baseUrl}/admin/dashboard.html" class="btn teal">Open Dashboard →</a>
    `;
    return { subject: '🔐 Your Musk-IT admin login OTP', html: wrap('Admin Login OTP', body) };
  },

  // To Ankit — new lead alert
  newLeadAlert(lead) {
    const body = `
      <div class="badge">New Lead</div>
      <h2 style="margin-top:12px">New enquiry received</h2>
      <p>Someone just filled the sales form on sales.muskit.in.</p>
      <div class="card">
        <div class="row"><span class="lbl">Name</span><span class="val">${lead.name}</span></div>
        <div class="row"><span class="lbl">Organisation</span><span class="val">${lead.organisation || '—'}</span></div>
        <div class="row"><span class="lbl">Email</span><span class="val">${lead.email}</span></div>
        <div class="row"><span class="lbl">Phone</span><span class="val">${lead.phone || '—'}</span></div>
        <div class="row"><span class="lbl">Plan Interest</span><span class="val">${lead.plan || '—'}</span></div>
        <div class="row"><span class="lbl">Team Size</span><span class="val">${lead.team_size || '—'}</span></div>
        <div class="row"><span class="lbl">Source</span><span class="val">${lead.source || '—'}</span></div>
        ${lead.message ? `<div class="row" style="flex-direction:column;gap:4px"><span class="lbl">Message</span><span class="val" style="margin-top:4px">${lead.message}</span></div>` : ''}
      </div>
      <a href="https://wa.me/${lead.phone?.replace(/\D/g,'')}?text=Hi%20${encodeURIComponent(lead.name)}%2C%20this%20is%20Ankit%20from%20Musk-IT.%20Thanks%20for%20your%20enquiry!" class="btn wa">💬 WhatsApp ${lead.name}</a>
      &nbsp;
      <a href="mailto:${lead.email}?subject=Re%3A%20Musk-IT%20Enquiry" class="btn">Reply by Email</a>
      <br><br>
      <a href="${cfg.baseUrl}/admin/dashboard.html" class="btn teal" style="font-size:12px;padding:9px 18px">View in CRM Dashboard →</a>
    `;
    return { subject: `🔔 New Lead: ${lead.name} — ${lead.organisation || lead.email}`, html: wrap('New Lead', body) };
  },

  // To prospect — lead acknowledgement
  leadAck(lead) {
    const body = `
      <h2>Thanks for reaching out, ${lead.name.split(' ')[0]}!</h2>
      <p>We've received your enquiry about Musk-IT and ${cfg.sales.name} will be in touch within 4 business hours.</p>
      <div class="card">
        <div class="row"><span class="lbl">Your enquiry</span><span class="val">${lead.plan ? lead.plan + ' plan' : 'General enquiry'}</span></div>
        <div class="row"><span class="lbl">Organisation</span><span class="val">${lead.organisation || '—'}</span></div>
        <div class="row"><span class="lbl">Response SLA</span><span class="val">4 business hours</span></div>
      </div>
      <p>For the fastest response, send a WhatsApp message directly:</p>
      <a href="https://wa.me/${cfg.sales.whatsapp}?text=Hi%20${encodeURIComponent(cfg.sales.name)}%2C%20I%20just%20submitted%20an%20enquiry%20for%20Musk-IT." class="btn wa">💬 WhatsApp ${cfg.sales.name}</a>
      <br><br>
      <p style="font-size:12px;color:#505D78">While you wait, explore the platform:</p>
      <a href="https://muskit.in/ai-engine/index.html" class="btn teal" style="font-size:13px;padding:10px 20px">Try AI Project Predictor Free →</a>
    `;
    return { subject: `We've received your Musk-IT enquiry`, html: wrap('Enquiry Received', body) };
  },

  // To Ankit — new booking
  newBookingAlert(booking) {
    const body = `
      <div class="badge">Demo Booked</div>
      <h2 style="margin-top:12px">New demo booking</h2>
      <div class="card">
        <div class="row"><span class="lbl">Name</span><span class="val">${booking.name}</span></div>
        <div class="row"><span class="lbl">Organisation</span><span class="val">${booking.organisation || '—'}</span></div>
        <div class="row"><span class="lbl">Email</span><span class="val">${booking.email}</span></div>
        <div class="row"><span class="lbl">Phone</span><span class="val">${booking.phone || '—'}</span></div>
        <div class="row"><span class="lbl">Date & Time</span><span class="val">${booking.slot_date} at ${booking.slot_time} IST</span></div>
        <div class="row"><span class="lbl">Duration</span><span class="val">${booking.duration_min} minutes</span></div>
        <div class="row"><span class="lbl">Plan Interest</span><span class="val">${booking.plan_interest || '—'}</span></div>
        ${booking.message ? `<div class="row" style="flex-direction:column"><span class="lbl">Notes</span><span class="val">${booking.message}</span></div>` : ''}
      </div>
      <a href="https://wa.me/${booking.phone?.replace(/\D/g,'')}?text=Hi%20${encodeURIComponent(booking.name)}%2C%20your%20Musk-IT%20demo%20on%20${booking.slot_date}%20at%20${booking.slot_time}%20is%20confirmed!" class="btn wa">💬 Confirm via WhatsApp</a>
    `;
    return { subject: `📅 Demo Booked: ${booking.name} — ${booking.slot_date} ${booking.slot_time}`, html: wrap('Demo Booked', body) };
  },

  // To prospect — booking confirmation
  bookingConfirmation(booking) {
    const body = `
      <h2>Your demo is confirmed!</h2>
      <p>Looking forward to showing you Musk-IT, ${booking.name.split(' ')[0]}.</p>
      <div class="card">
        <div class="row"><span class="lbl">Date</span><span class="val">${booking.slot_date}</span></div>
        <div class="row"><span class="lbl">Time</span><span class="val">${booking.slot_time} IST</span></div>
        <div class="row"><span class="lbl">Duration</span><span class="val">${booking.duration_min} minutes</span></div>
        <div class="row"><span class="lbl">Your host</span><span class="val">${cfg.sales.name}</span></div>
      </div>
      <p>A Google Meet link will be shared on WhatsApp 30 minutes before the session.</p>
      <a href="https://wa.me/${cfg.sales.whatsapp}" class="btn wa">💬 WhatsApp ${cfg.sales.name}</a>
      <br><br>
      <p style="font-size:12px;color:#505D78">Need to reschedule? Reply to this email or message on WhatsApp.</p>
    `;
    return { subject: `✅ Demo confirmed — ${booking.slot_date} ${booking.slot_time} IST`, html: wrap('Demo Confirmed', body) };
  },

  // To Ankit — payment received
  paymentAlert(payment, lead) {
    const body = `
      <div class="badge" style="background:rgba(31,217,164,0.1);border-color:rgba(31,217,164,0.2);color:#1FD9A4">Payment Received</div>
      <h2 style="margin-top:12px;color:#1FD9A4">₹${payment.total_amount?.toLocaleString('en-IN')} received!</h2>
      <div class="card">
        <div class="row"><span class="lbl">Customer</span><span class="val">${lead?.name || '—'}</span></div>
        <div class="row"><span class="lbl">Organisation</span><span class="val">${lead?.organisation || '—'}</span></div>
        <div class="row"><span class="lbl">Plan</span><span class="val">${payment.plan}</span></div>
        <div class="row"><span class="lbl">Amount</span><span class="val">₹${payment.amount?.toLocaleString('en-IN')}</span></div>
        <div class="row"><span class="lbl">GST (18%)</span><span class="val">₹${payment.gst_amount?.toLocaleString('en-IN')}</span></div>
        <div class="row"><span class="lbl">Total</span><span class="val" style="color:#1FD9A4;font-size:16px">₹${payment.total_amount?.toLocaleString('en-IN')}</span></div>
        <div class="row"><span class="lbl">Invoice</span><span class="val">${payment.invoice_number}</span></div>
        <div class="row"><span class="lbl">Razorpay ID</span><span class="val" style="font-size:11px">${payment.razorpay_payment_id}</span></div>
      </div>
      <a href="${cfg.baseUrl}/admin/dashboard.html" class="btn teal">View in Dashboard →</a>
    `;
    return { subject: `💰 Payment received: ₹${payment.total_amount?.toLocaleString('en-IN')} from ${lead?.name}`, html: wrap('Payment Received', body) };
  },

  // To prospect — payment confirmation
  paymentConfirmation(payment, lead) {
    const body = `
      <h2>Payment confirmed — welcome to Musk-IT!</h2>
      <p>Thank you ${lead?.name?.split(' ')[0] || ''}. Your ${payment.plan} license is now active.</p>
      <div class="card">
        <div class="row"><span class="lbl">Invoice</span><span class="val">${payment.invoice_number}</span></div>
        <div class="row"><span class="lbl">Plan</span><span class="val">${payment.plan}</span></div>
        <div class="row"><span class="lbl">Amount paid</span><span class="val">₹${payment.total_amount?.toLocaleString('en-IN')} (incl. 18% GST)</span></div>
        <div class="row"><span class="lbl">Payment ID</span><span class="val" style="font-size:11px">${payment.razorpay_payment_id}</span></div>
      </div>
      <p>${cfg.sales.name} will reach out within 2 business hours to begin your onboarding.</p>
      <a href="https://wa.me/${cfg.sales.whatsapp}" class="btn wa">💬 Message ${cfg.sales.name}</a>
      <br><br>
      <a href="https://muskit.in/docs/index.html" class="btn" style="font-size:13px;padding:10px 20px">Read Documentation →</a>
    `;
    return { subject: `✅ Payment confirmed — Invoice ${payment.invoice_number}`, html: wrap('Payment Confirmed', body) };
  },
};

// ── Send function ─────────────────────────────────────────────────────────────

async function send(to, template) {
  try {
    await transporter.sendMail({
      from: cfg.email.from || cfg.email.user, // ✅ FIX
      to,
      subject: template.subject,
      html: template.html,
    });
    return true;
  } catch (err) {
    console.error('[Mailer] Failed to send to', to, ':', err.message);
    return false;
  }
}

module.exports = { send, templates };
