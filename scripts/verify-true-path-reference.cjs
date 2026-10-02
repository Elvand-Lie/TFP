// Usage: node scripts/verify-true-path-reference.cjs /path/to/approved/true-path.html
const fs=require('node:fs'), vm=require('node:vm'), assert=require('node:assert/strict');
const html=fs.readFileSync(process.argv[2],'utf8');
const ref=vm.runInNewContext(html.split('<script>')[1].split('// ===== STATE =====')[0]+';({T,R,scoreTalent,scoreIT,akey,archOf,titleFor,dualOf,align,ikSignal,CONFIG:{Q,ORDER,ARCH,TI,IK,SG,CAP,AFFINITY,TAGS,W,TH,SC,RC,GAP,DL,TV,RV,REFL,TN,RN}})',{window:{}});
const config=require('../true-path/config/true-path.config.json'), build=require('../true-path/lib/config.js').build(config), S=require('../true-path/lib/scoring.js');
for(const key of Object.keys(ref.CONFIG))assert.deepEqual(config[key],JSON.parse(JSON.stringify(ref.CONFIG[key])),key);
let count=0;
function check(a,picks,roles){
 const t=S.scoreTalent(Object.fromEntries(a.map((v,i)=>['Q'+(i+1),v])),build.talent),rt=ref.scoreTalent(a);
 for(const key of ['raw','pct','dominant','secondary','coDominant','balancedProfile'])assert.deepEqual(t[key==='dominant'?'primary':key],JSON.parse(JSON.stringify(rt[key])),key);
 const r=S.computeRoleResult(roles,t.pct,picks.map(key=>({key})),build.scoring),rr=ref.scoreIT(roles,rt.pct,picks);
 for(const [pk,rk] of [['shares','share'],['scenarioPoints','points'],['primary','primary'],['supporting','supporting'],['gap','gap'],['pattern','pattern']])assert.deepEqual(r[pk],JSON.parse(JSON.stringify(rr[rk])),JSON.stringify({a,picks,roles,pk}));
 assert.equal(t.archetypeKey,ref.akey(rt),'archetypeKey');
 assert.deepEqual([t.archetype.name,t.archetype.essence],JSON.parse(JSON.stringify(ref.archOf(rt))),'archetype');
 assert.deepEqual(r.ordered,[rr.primary,rr.supporting,rr.gap],'ordered');
 assert.equal(r.spread,rr.share[rr.primary]-rr.share[rr.gap],'spread');
 const dual=rr.pattern==='dual'?[rr.primary,rr.supporting].sort((a,b)=>ref.R.indexOf(a)-ref.R.indexOf(b)).join('_'):null;
 assert.equal(r.dualPair,dual,'dualPair');assert.equal(r.dualLabelKey,dual,'dualLabelKey');
 const label=dual?build.ironTriangle.patterns.dual[dual]:null;
 assert.deepEqual(label?[label.label,label.line]:null,JSON.parse(JSON.stringify(ref.dualOf(rr))),'dualLabel');
 assert.deepEqual({hits:r.ikigai.hits,pct:r.ikigai.pct},JSON.parse(JSON.stringify(ref.ikSignal(picks))),'ikigai');
 const title=build.truthPath.titles.find(v=>v.archetype===t.archetypeKey&&v.role===r.primary);
 assert.deepEqual([title.title,title.essence],JSON.parse(JSON.stringify(ref.titleFor(rt,rr))),'title');
 const ik=Object.fromEntries(config.IK.map((row,i)=>[i,picks.filter(key=>row[1].some(o=>o[0]===key))]));
 // Valid journeys always have an ability pick; legacy empty screens intentionally remain neutral.
 if(ik[1].length){
  const Resolve=require('../true-path/lib/trupath.js'), ps=Object.entries(ik).flatMap(([i,v])=>v.map(key=>({screenId:'I-'+(Number(i)+1),key})));
  const aligned=Resolve.buildAlignmentChecks(t,r,ps,build.ikigai,build.truthPath);
  const keys=[aligned.talent.kind==='aligned'?'talent_capability_aligned':'talent_capability_explore',...(aligned.economic.kind==='neutral'?[]:[aligned.economic.kind==='aligned'?'economic_role_aligned':'economic_role_explore'])];
  assert.deepEqual(keys,JSON.parse(JSON.stringify(ref.align(rt,rr,ik))),'alignment');
 }
 count++;
}
const profiles=[[5,5,4,5,5,5,3,2,3,3,3,2],[2,2,2,3,3,3,5,4,5,5,5,4],[4,4,3,2,2,3,4,4,5,3,2,3],Array(12).fill(3),[5,4,4,4,4,5,2,2,2,3,3,3],Array(12).fill(5)];
const signals=[[],['leading_influencing','execution'],['solving_problems','strategy','analysis','consulting_advisory','help_businesses_grow'],['planning','execution','communication'],['empathy','creativity'],config.IK.flatMap(row=>row[1].map(o=>o[0]))];
for(const a of profiles)for(const picks of signals)for(let n=0;n<729;n++){let x=n;const roles=Array.from({length:6},()=>{const r=ref.R[x%3];x=Math.floor(x/3);return r});check(a,picks,roles)}
let seed=1729;const next=()=>{seed=(Math.imul(seed,1664525)+1013904223)>>>0;return seed};
for(let i=0;i<5000;i++)check(Array.from({length:12},()=>next()%5+1),config.IK.flatMap(row=>row[1].filter(()=>next()%3===0).slice(0,3).map(o=>o[0])),Array.from({length:6},()=>ref.R[next()%3]));
console.log('Canonical config tables: all equal; scoring parity: '+count+' exact comparisons passed');

// Run the supplied fixture harness unchanged, using a bridge to the production engine.
const path=require('node:path'), os=require('node:os'), cp=require('node:child_process');
const root=path.resolve(__dirname,'..'), dir=fs.mkdtempSync(path.join(os.tmpdir(),'tfp-reference-'));
try {
 const fixturePath=path.join(path.dirname(process.argv[2]),'true-path.test.js');
 const bridge=[fs.readFileSync(path.join(root,'true-path/lib/scoring.js'),'utf8'),fs.readFileSync(path.join(root,'true-path/lib/trupath.js'),'utf8'),
 'const CONFIG='+JSON.stringify(config)+';const B='+JSON.stringify(build)+';',
 'const {T,R,Q,ORDER,ARCH,TI,IK,SG,CAP,AFFINITY,TAGS,W,TH,SC,RC,GAP,DL,TV,RV,REFL,TN,RN}=CONFIG;',
 'function scoreTalent(a){const t=TruePathScoring.scoreTalent(Object.fromEntries(a.map((v,i)=>["Q"+(i+1),v])),B.talent);return {...t,dominant:t.primary}}',
 'function scoreIT(a,t,p){const r=TruePathScoring.computeRoleResult(a,t,p.map(key=>({key})),B.scoring);return {...r,share:r.shares}}',
 'function archOf(t){return [t.archetype.name,t.archetype.essence]}',
 'function titleFor(t,r){const v=TruePathResolve.findTitle(B.truthPath,t.archetypeKey,r.primary);return [v.title,v.essence]}',
 'function dualOf(r){const v=B.ironTriangle.patterns.dual[r.dualLabelKey];return v&&[v.label,v.line]}',
 'function align(t,r,ik){const p=Object.entries(ik).flatMap(([i,v])=>v.map(key=>({screenId:"I-"+(Number(i)+1),key})));const a=TruePathResolve.buildAlignmentChecks(t,r,p,B.ikigai,B.truthPath);return [a.talent.kind==="aligned"?"talent_capability_aligned":"talent_capability_explore",...(a.economic.kind==="neutral"?[]:[a.economic.kind==="aligned"?"economic_role_aligned":"economic_role_explore"])]}',
 '// ===== STATE ====='].join('\n');
 const file=path.join(dir,'production.html');fs.writeFileSync(file,'<script>'+bridge+'</script>');
 const result=cp.spawnSync(process.execPath,[fixturePath,file],{encoding:'utf8'});process.stdout.write(result.stdout||'');process.stderr.write(result.stderr||'');assert.equal(result.status,0,'Unmodified canonical fixtures failed');
} finally {fs.rmSync(dir,{recursive:true,force:true})}
