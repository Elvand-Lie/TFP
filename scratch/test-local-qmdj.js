fetch('http://localhost:3000/api/bazi', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({year:1990, month:12, day:31, hour:6, minute:30, gender:1})
}).then(async r => {
  const text = await r.text();
  try {
    const json = JSON.parse(text);
    if (json.qmdj) {
      console.log('✅ qmdj EXISTS');
      console.log(JSON.stringify({
        solar_term: json.qmdj.solar_term,
        ju: json.qmdj.ju,
        duty_star: json.qmdj.duty_star,
        duty_door: json.qmdj.duty_door,
        palace_0: json.qmdj.palaces?.[0]
      }, null, 2));
    } else {
      console.log('❌ qmdj is MISSING');
      console.log('Top-level keys:', Object.keys(json));
    }
  } catch(e) {
    console.error('Not valid JSON:', text.substring(0, 300));
  }
}).catch(console.error);
