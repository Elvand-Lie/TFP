'use strict';

const { sendLeadNotification } = require('../server/lead-email.js');

module.exports = async function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store');

  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    return res.status(405).json({ error: 'Method not allowed.' });
  }

  try {
    const result = await sendLeadNotification(req.body || {});
    return res.status(200).json({ ok: true, id: result.id, dryRun: result.dryRun === true });
  } catch (error) {
    console.error('ZWDS lead notification failed:', error);
    return res.status(500).json({ error: error instanceof Error ? error.message : 'Unable to send the notification.' });
  }
};
