fetch('http://localhost:3000/api/bazi', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({year:1990, month:12, day:31, hour:6, minute:30, gender:1})
}).then(async r => {
  const json = await r.json();
  // Show what renderChart(data, payload) sees
  console.log('TOP-LEVEL KEYS of data:', Object.keys(json));
  // Check the exact path bazi.js uses
  console.log('\nbazi.js line 598: data.qmdj =', json.qmdj ? 'EXISTS' : 'MISSING');
  console.log('bazi.js line 598: data.four_pillars =', json.four_pillars ? 'EXISTS' : 'MISSING');
  console.log('bazi.js line 598: data.analysis =', json.analysis ? 'EXISTS' : 'MISSING');
  
  if (json.qmdj) {
    console.log('\nqmdj top-level keys:', Object.keys(json.qmdj));
    // Check exact element IDs bazi.js writes to
    console.log('solar_term for #qmdj-solar-term:', json.qmdj.solar_term);
    console.log('ju for #qmdj-ju:', json.qmdj.ju);
    console.log('duty_star for #qmdj-zhifu:', json.qmdj.duty_star);
    console.log('duty_door for #qmdj-zhishi:', json.qmdj.duty_door);
    console.log('palaces array length:', json.qmdj.palaces?.length);
  }
}).catch(console.error);
