import test from 'node:test';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
const require=createRequire(import.meta.url);
const S=require('../true-path/lib/scoring.js');
const config=require('../true-path/lib/config.js').build(require('../true-path/config/true-path.config.json'));

test('Approved pattern thresholds use displayed shares while role ordering keeps exact scores',()=>{
  const points={commander:4,general:4,chancellor:4};
  assert.equal(S.classifyTriangle({commander:36.4,general:33.6,chancellor:30},points,{commander:36,general:34,chancellor:30},config.scoring).pattern,'balanced');
  assert.equal(S.classifyTriangle({commander:43.4,general:38,chancellor:18.6},points,{commander:43,general:38,chancellor:19},config.scoring).pattern,'dual');
  const tied=S.classifyTriangle({commander:20.8,general:21.2,chancellor:58},points,{commander:21,general:21,chancellor:58},config.scoring);
  assert.equal(tied.gap,'commander');
  assert.deepEqual(S.largestRemainderShares({commander:20,general:20,chancellor:20},S.ROLE_KEYS,['chancellor','general','commander']),{commander:33,general:33,chancellor:34});
  assert.equal(S.classifyTriangle({commander:36.4,general:33.6,chancellor:30},points,{commander:36,general:34,chancellor:30},{...config.scoring,balancedThreshold:5}).pattern,'dual');
});
