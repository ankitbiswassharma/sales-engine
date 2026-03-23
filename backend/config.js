require('dotenv').config();

module.exports = {
  port: process.env.PORT || 3000,
  nodeEnv: process.env.NODE_ENV || 'development',
  baseUrl: process.env.BASE_URL || 'http://localhost:3000',

  admin: {
    password: process.env.ADMIN_PASSWORD || 'muskit2026',
    sessionSecret: process.env.ADMIN_SESSION_SECRET || 'dev-secret-change-in-prod',
  },

  razorpay: {
    keyId:         process.env.RAZORPAY_KEY_ID     || 'rzp_test_placeholder',
    keySecret:     process.env.RAZORPAY_KEY_SECRET  || 'placeholder',
    webhookSecret: process.env.RAZORPAY_WEBHOOK_SECRET || 'placeholder',
    currency:      'INR',
  },

  email: {
    host: process.env.EMAIL_HOST || 'smtpout.secureserver.net',
    port: Number(process.env.EMAIL_PORT) || 587,
    user: process.env.EMAIL_USER || 'ankitbiswassharma@muskit.in',
    pass: process.env.EMAIL_PASS || 'your-password',
    from: process.env.EMAIL_FROM || 'Musk-IT Sales <ankitbiswassharma@muskit.in>', // ✅ ADD THIS
  },

  sales: {
    name:      process.env.SALES_NAME      || 'Ankit Biswas Sharma',
    email:     process.env.SALES_EMAIL     || 'ankitbiswassharma@muskit.in',
    whatsapp:  process.env.SALES_WHATSAPP  || '917047859422',
    phone:     '+91 70478 59422',
  },

  sheets: {
    serviceAccountEmail: process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL || '',
    privateKey:          (process.env.GOOGLE_PRIVATE_KEY || '').replace(/\\n/g, '\n'),
    sheetId:             process.env.GOOGLE_SHEET_ID || '',
    range:               'Leads!A:N',
  },

  db: {
    path: process.env.DB_PATH || './data/leads.db',
  },

  // Pricing plans (edit here to update everywhere)
  plans: {
    professional: {
      name:       'Professional',
      monthly:    999,
      annual:     799,
      currency:   'INR',
      per:        'user/month',
      description: 'For growing EPC teams',
    },
    enterprise: {
      name:       'Enterprise AI',
      monthly:    null,
      annual:     null,
      currency:   'INR',
      per:        'custom',
      description: 'Full AI Intelligence Suite',
    },
    source: {
      name:       'Source License',
      monthly:    null,
      annual:     null,
      currency:   'INR',
      per:        'negotiated',
      description: 'Full source code deployment',
    },
  },

  // UPI details for direct payment
  upi: {
    id:   '7047859422@sbi',  // ← update with your real UPI ID
    name: 'Ankit Biswas Sharma',
  },

  // Bank transfer details
  bank: {
    name:    'Ankit Biswas Sharma',
    account: '37266519156',           // ← update with real account number
    ifsc:    'SBIN0002084',            // ← update with real IFSC
    bank:    'State Bank of India',
    branch:  'Mal',
  },
};
