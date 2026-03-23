const cfg = require('./config');

/**
 * WhatsApp notification system using wa.me deep links.
 * No API key needed. When a lead comes in, the server generates
 * a pre-filled WhatsApp URL and logs it so Ankit can open it in
 * one tap from the admin dashboard.
 *
 * To upgrade to Twilio later: replace buildAnkitUrl() with
 * a Twilio client.messages.create() call.
 */

function encode(str) {
  return encodeURIComponent(str);
}

const builders = {

  newLead(lead) {
    const msg = `🔔 *New Musk-IT Lead*

*Name:* ${lead.name}
*Org:* ${lead.organisation || '—'}
*Email:* ${lead.email}
*Phone:* ${lead.phone || '—'}
*Plan:* ${lead.plan || '—'}
*Team size:* ${lead.team_size || '—'}
*Source:* ${lead.source || '—'}
${lead.message ? `\n*Message:* ${lead.message}` : ''}

Reply quickly — first response wins 🏆
Dashboard: ${cfg.baseUrl}/admin/dashboard.html`;
    return `https://wa.me/${cfg.sales.whatsapp}?text=${encode(msg)}`;
  },

  newBooking(booking) {
    const msg = `📅 *New Demo Booking*

*Name:* ${booking.name}
*Org:* ${booking.organisation || '—'}
*Email:* ${booking.email}
*Phone:* ${booking.phone || '—'}
*Slot:* ${booking.slot_date} at ${booking.slot_time} IST
*Duration:* ${booking.duration_min} min
*Plan interest:* ${booking.plan_interest || '—'}
${booking.message ? `\n*Notes:* ${booking.message}` : ''}

Open dashboard: ${cfg.baseUrl}/admin/dashboard.html`;
    return `https://wa.me/${cfg.sales.whatsapp}?text=${encode(msg)}`;
  },

  paymentReceived(payment, lead) {
    const msg = `💰 *Payment Received!*

*Customer:* ${lead?.name || '—'}
*Org:* ${lead?.organisation || '—'}
*Plan:* ${payment.plan}
*Amount:* ₹${payment.total_amount?.toLocaleString('en-IN')}
*Invoice:* ${payment.invoice_number}
*Razorpay ID:* ${payment.razorpay_payment_id}

Dashboard: ${cfg.baseUrl}/admin/dashboard.html`;
    return `https://wa.me/${cfg.sales.whatsapp}?text=${encode(msg)}`;
  },

  // Build a WhatsApp reply link to the prospect
  replyToProspect(phone, name) {
    const clean = phone?.replace(/\D/g, '');
    if (!clean) return null;
    const msg = `Hi ${name}, this is ${cfg.sales.name} from Musk-IT. Thanks for your enquiry! I'll send you more details shortly.`;
    return `https://wa.me/${clean}?text=${encode(msg)}`;
  },
};

/**
 * Log WhatsApp notification URLs to console (and optionally to a file).
 * In the admin dashboard these are rendered as clickable "Open in WhatsApp" buttons.
 */
function notify(type, data1, data2) {
  let url;
  switch (type) {
    case 'new_lead':     url = builders.newLead(data1); break;
    case 'new_booking':  url = builders.newBooking(data1); break;
    case 'payment':      url = builders.paymentReceived(data1, data2); break;
    default: return null;
  }
  console.log(`[WhatsApp] ${type} notification URL ready:`, url.slice(0, 80) + '...');
  return url;
}

module.exports = { builders, notify };
