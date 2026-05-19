fetch('http://localhost:3000/api/bazi', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({year:1990, month:12, day:31, hour:6, minute:30, gender:1})
}).then(async r => {
  const json = await r.json();
  
  // Simulate renderChart line by line to find where it would crash
  console.log('--- Simulating renderChart execution ---');
  
  // Line 352: data.analysis.ten_gods_scores
  console.log('L352 ten_gods_scores:', json.analysis.ten_gods_scores ? 'EXISTS' : 'MISSING/UNDEFINED');
  
  // If it's undefined, Object.values(undefined) throws
  try {
    const scores = json.analysis.ten_gods_scores;
    const maxScore = Math.max(...Object.values(scores), 1);
    console.log('L355 maxScore calculation: OK, maxScore =', maxScore);
  } catch(e) {
    console.error('CRASH at L355:', e.message);
  }
  
  console.log('\nAll analysis keys:', Object.keys(json.analysis));
}).catch(console.error);
