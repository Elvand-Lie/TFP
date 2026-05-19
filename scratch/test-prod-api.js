const https = require('https');

const body = JSON.stringify({ year: 1990, month: 12, day: 31, hour: 6, minute: 30, gender: 1 });

const options = {
  hostname: 'tfp-j20i5vauq-elvand-lies-projects.vercel.app',
  path: '/api/bazi',
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
    'Content-Length': Buffer.byteLength(body)
  }
};

const req = https.request(options, (res) => {
  let data = '';
  res.on('data', chunk => data += chunk);
  res.on('end', () => {
    try {
      const json = JSON.parse(data);
      if (json.qmdj) {
        console.log('qmdj EXISTS:', JSON.stringify({
          solar_term: json.qmdj.solar_term,
          ju: json.qmdj.ju,
          duty_star: json.qmdj.duty_star,
          duty_door: json.qmdj.duty_door,
          palace_count: json.qmdj.palaces?.length
        }, null, 2));
      } else {
        console.log('qmdj is MISSING from response');
        console.log('Top-level keys:', Object.keys(json));
      }
    } catch(e) {
      console.error('Response is not valid JSON. Raw:', data.substring(0, 500));
    }
  });
});

req.on('error', e => console.error('Request error:', e.message));
req.write(body);
req.end();
