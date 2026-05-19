// Test the exact pattern bazi.ts uses after TypeScript compilation
// TypeScript compiles: await import('qimen-dunjia')
// In CJS output, this becomes: await Promise.resolve().then(() => __importStar(require('qimen-dunjia')))
// This IS what causes ERR_REQUIRE_ESM in production!

// Let's verify by trying require() directly
try {
  const q = require('qimen-dunjia');
  console.log('require() works:', typeof q.generateChartByDatetime);
} catch(e) {
  console.log('require() fails:', e.code, e.message.substring(0, 100));
}

// Now test dynamic import (which in CJS context still uses require under the hood with tsc output)
(async () => {
  try {
    const q = await import('qimen-dunjia');
    console.log('dynamic import() works:', typeof q.generateChartByDatetime);
  } catch(e) {
    console.log('dynamic import() fails:', e.code, e.message.substring(0, 100));
  }
})();
