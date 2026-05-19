// Simulate what Vercel does: CJS file trying dynamic import of ESM module
async function test() {
  try {
    console.log('CJS context dynamic import test...');
    const qimen = await import('qimen-dunjia');
    console.log('Import ok. generateChartByDatetime:', typeof qimen.generateChartByDatetime);
    
    if (typeof qimen.generateChartByDatetime === 'function') {
      const raw = qimen.generateChartByDatetime('2024011510');
      console.log('raw type:', typeof raw);
      const chart = qimen.chartToObject(raw);
      console.log('chart keys:', Object.keys(chart).slice(0,5));
      console.log('節氣:', chart['節氣'], '局數:', chart['局數']);
    } else {
      // Check if it's wrapped under .default
      console.log('Checking .default...');
      const def = qimen.default || {};
      console.log('default keys:', Object.keys(def).slice(0,5));
    }
  } catch(e) {
    console.error('ERROR:', e.code, e.message);
  }
}
test();
