const { google } = require('googleapis');
const cfg = require('./config');

let sheetsClient = null;

function getClient() {
  if (sheetsClient) return sheetsClient;
  if (!cfg.sheets.privateKey || !cfg.sheets.serviceAccountEmail) return null;
  try {
    const auth = new google.auth.JWT(
      cfg.sheets.serviceAccountEmail,
      null,
      cfg.sheets.privateKey,
      ['https://www.googleapis.com/auth/spreadsheets']
    );
    sheetsClient = google.sheets({ version: 'v4', auth });
    return sheetsClient;
  } catch (e) {
    console.error('[Sheets] Auth failed:', e.message);
    return null;
  }
}

// Ensure header row exists
async function ensureHeaders() {
  const client = getClient();
  if (!client || !cfg.sheets.sheetId) return;
  try {
    const res = await client.spreadsheets.values.get({
      spreadsheetId: cfg.sheets.sheetId,
      range: 'Leads!A1:N1',
    });
    if (!res.data.values?.length) {
      await client.spreadsheets.values.update({
        spreadsheetId: cfg.sheets.sheetId,
        range: 'Leads!A1',
        valueInputOption: 'RAW',
        requestBody: { values: [[
          'ID', 'Date', 'Name', 'Email', 'Phone', 'Organisation',
          'Plan', 'Team Size', 'Project Type', 'Message', 'Source',
          'Status', 'Notes', 'Updated'
        ]] },
      });
    }
  } catch (e) {
    console.error('[Sheets] ensureHeaders failed:', e.message);
  }
}

async function appendLead(lead) {
  const client = getClient();
  if (!client || !cfg.sheets.sheetId) {
    console.log('[Sheets] Skipping — not configured');
    return false;
  }
  try {
    await ensureHeaders();
    await client.spreadsheets.values.append({
      spreadsheetId: cfg.sheets.sheetId,
      range: cfg.sheets.range,
      valueInputOption: 'USER_ENTERED',
      insertDataOption: 'INSERT_ROWS',
      requestBody: { values: [[
        lead.id,
        new Date().toLocaleString('en-IN', { timeZone: 'Asia/Kolkata' }),
        lead.name,
        lead.email,
        lead.phone || '',
        lead.organisation || '',
        lead.plan || '',
        lead.team_size || '',
        lead.project_type || '',
        lead.message || '',
        lead.source || '',
        'new',
        '',
        '',
      ]] },
    });
    return true;
  } catch (err) {
    console.error('[Sheets] appendLead failed:', err.message);
    return false;
  }
}

async function updateLeadStatus(leadId, status, notes = '') {
  const client = getClient();
  if (!client || !cfg.sheets.sheetId) return false;
  try {
    // Find row with this leadId
    const res = await client.spreadsheets.values.get({
      spreadsheetId: cfg.sheets.sheetId,
      range: 'Leads!A:A',
    });
    const rows = res.data.values || [];
    const rowIdx = rows.findIndex(r => r[0] === leadId);
    if (rowIdx < 0) return false;

    const sheetRow = rowIdx + 1;
    await client.spreadsheets.values.batchUpdate({
      spreadsheetId: cfg.sheets.sheetId,
      requestBody: {
        valueInputOption: 'USER_ENTERED',
        data: [
          { range: `Leads!L${sheetRow}`, values: [[status]] },
          { range: `Leads!M${sheetRow}`, values: [[notes]] },
          { range: `Leads!N${sheetRow}`, values: [[new Date().toLocaleString('en-IN')]] },
        ],
      },
    });
    return true;
  } catch (err) {
    console.error('[Sheets] updateLeadStatus failed:', err.message);
    return false;
  }
}

module.exports = { appendLead, updateLeadStatus };
