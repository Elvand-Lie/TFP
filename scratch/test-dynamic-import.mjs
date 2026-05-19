// Simulate exactly what bazi.ts does at runtime
async function test() {
  try {
    console.log('Attempting dynamic import...');
    const qimen = await import('qimen-dunjia');
    console.log('Import succeeded. Keys:', Object.keys(qimen).slice(0, 5));
    
    const hasFn = typeof (qimen).generateChartByDatetime === 'function';
    const hasDefault = !!(qimen).default;
    console.log('generateChartByDatetime found:', hasFn);
    console.log('default export:', hasDefault);
    
    // Try calling it
    if (hasFn) {
      const raw = (qimen).generateChartByDatetime('2024011510');
      const chart = (qimen).chartToObject(raw);
      console.log('節氣:', chart['節氣']);
      console.log('陰陽:', chart['陰陽']);
      console.log('局數:', chart['局數']);
      console.log('值符:', chart['值符']);
      console.log('值使:', chart['值使']);
    } else if (hasDefault) {
      // ESM default export wrapping
      const def = (qimen).default;
      console.log('default keys:', Object.keys(def));
    }
  } catch (e) {
    console.error('FAILED:', e.message);
    console.error(e.stack);
  }
}
test();
