fetch('http://localhost:3000/api/bazi', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({year:1990, month:12, day:31, hour:6, minute:30, gender:1})
}).then(async r => {
  console.log(r.status);
  console.log(await r.text());
}).catch(console.error);
