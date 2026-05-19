// Exact reproduction of what bazi.ts does in production
// Run this with: node test-prod-sim.js
async function simulateHandler(year, month, day, hour) {
  try {
    const qimen = await import('qimen-dunjia');
    const qimenString = `${year}${String(month).padStart(2,'0')}${String(day).padStart(2,'0')}${String(hour).padStart(2,'0')}`;
    
    console.log('qimenString:', qimenString);
    
    // Exact same guard as bazi.ts
    const qmdjRaw = qimen.generateChartByDatetime 
      ? qimen.generateChartByDatetime(qimenString) 
      : null;
    
    if (!qmdjRaw) {
      console.log('ERROR: qmdjRaw is null — generateChartByDatetime not found');
      return;
    }
    
    const qmdjChart = qimen.chartToObject(qmdjRaw);
    
    console.log('Full chart keys:', Object.keys(qmdjChart));
    
    const luoShuIds = [4, 9, 2, 3, 5, 7, 8, 1, 6];
    const palaces = [];
    for (let i = 0; i < 9; i++) {
      palaces.push({
        id: luoShuIds[i],
        star: qmdjChart["九星"][i] || '',
        door: qmdjChart["天門"][i] || qmdjChart["地門"][i] || '',
        god: qmdjChart["八神"][i] || '',
        earth_stem: qmdjChart["地盤"][i] || '',
        heaven_stem: qmdjChart["天盤"][i] || ''
      });
    }
    
    const legacyQmdj = {
      solar_term: qmdjChart["節氣"] || 'N/A',
      ju: `${qmdjChart["陰陽"]}${qmdjChart["局數"]}局`,
      duty_star: qmdjChart["值符"] || '',
      duty_door: qmdjChart["值使"] || '',
      palaces: palaces
    };
    
    console.log('\n=== FINAL legacyData.qmdj ===');
    console.log(JSON.stringify(legacyQmdj, null, 2));
    
  } catch (err) {
    console.error('QMDJ catch block triggered:', err.message);
    console.error(err.stack);
  }
}

// Use same values as the API test
simulateHandler(1990, 12, 31, 6);
