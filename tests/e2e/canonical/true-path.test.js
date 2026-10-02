// Usage: node true-path.test.js [file.html]   |   node true-path.test.js --export  (writes true-path.config.json)
const fs=require('fs'),vm=require('vm');
const f=process.argv.find(a=>a.endsWith('.html'))||'true-path.html',js=fs.readFileSync(f,'utf8').split('<script>')[1].split('</script>')[0];
const X=vm.runInNewContext(js.split('// ===== STATE =====')[0]+'\n;({T,R,scoreTalent,scoreIT,archOf,titleFor,dualOf,align,CONFIG:{Q,ORDER,ARCH,TI,IK,SG,CAP,AFFINITY,TAGS,W,TH,SC,RC,GAP,DL,TV,RV,REFL,TN,RN}})',{window:{}});
if(process.argv.includes('--export')){fs.writeFileSync('true-path.config.json',JSON.stringify(X.CONFIG,null,1));console.log('exported');process.exit(0)}
const M={Cm:'commander',Ge:'general',Ch:'chancellor'},n=x=>x.split(',').map(Number),sc=x=>x.split(',').map(k=>M[k]);
const F=[
{n:'A',t:'5,5,4,5,5,5,3,2,3,3,3,2',ik:'solving_problems,strategy,analysis,consulting_advisory,help_businesses_grow',s:'Ch,Ch,Ch,Cm,Ch,Ge',arch:'Systems Strategist',sh:[21,21,58],primary:'chancellor',gap:'commander',title:'The Master Architect'},
{n:'B',t:'2,2,2,3,3,3,5,4,5,5,5,4',ik:'leading_influencing,communication,creativity,personal_growth_coaching,inspire_others',s:'Cm,Cm,Ge,Cm,Cm,Cm',arch:'Visionary Influencer',co:true,pct:{communicator:92,creative:92},sh:[67,25,8],title:'The Movement Builder'},
{n:'C',t:'4,4,3,2,2,3,4,4,5,3,2,3',ik:'building_creating_projects,execution,sales_influence,build_wealth_freedom',s:'Ge,Ge,Ge,Ge,Cm,Ge',arch:'Leadership Coordinator',sh:[19,73,8],title:'The Field Marshal'},
{n:'D',t:'3,3,3,3,3,3,3,3,3,3,3,3',ik:'teaching_sharing,empathy,education_training,teach_wisdom',s:'Cm,Ge,Ch,Cm,Ge,Ch',bal:true,sh:[34,33,33],pattern:'balanced'},
{n:'E',t:'5,4,4,4,4,5,2,2,2,3,3,3',ik:'solving_problems,planning,operations_management,build_systems_efficiency',s:'Ch,Ge,Ch,Ge,Ch,Ge',arch:'Systems Strategist',dom:'organiser',pct:{organiser:83,analyst:83},sh:[9,37,54],title:'The Master Architect'},
{n:'F',t:'5,5,5,5,5,5,5,5,5,5,5,5',ik:'leading_influencing,execution',s:'Cm,Cm,Cm,Ge,Ge,Ge',arch:'Systems Strategist',sh:[43,43,14],pattern:'dual',dual:'The Pioneer',primary:'commander',title:'The Grand Strategist'}];
let bad=0;
for(const c of F){const e=[],ck=(l,a,b)=>{if(JSON.stringify(a)!==JSON.stringify(b))e.push(`${l}: got ${JSON.stringify(a)} want ${JSON.stringify(b)}`)};
const t=X.scoreTalent(n(c.t)),ik=c.ik.split(','),r=X.scoreIT(sc(c.s),t.pct,ik);
ck('shares',[r.share.commander,r.share.general,r.share.chancellor],c.sh);ck('sum',r.share.commander+r.share.general+r.share.chancellor,100);
if(c.arch)ck('archetype',X.archOf(t)[0],c.arch);if(c.title)ck('title',X.titleFor(t,r)[0],c.title);if(c.primary)ck('primary',r.primary,c.primary);if(c.gap)ck('gap',r.gap,c.gap);
if(c.co)ck('coDominant',t.coDominant,true);if(c.bal)ck('balancedProfile',t.balancedProfile,true);if(c.dom)ck('dominant',t.dominant,c.dom);
if(c.pct)for(const k in c.pct)ck('pct.'+k,t.pct[k],c.pct[k]);if(c.pattern)ck('pattern',r.pattern,c.pattern);if(c.dual){const d=X.dualOf(r);ck('dualLabel',d&&d[0],c.dual)}
if(c.n=='A')ck('alignment',X.align(t,r,{1:['strategy','analysis'],2:['consulting_advisory']}),['talent_capability_aligned','economic_role_aligned']);
console.log(c.n,e.length?'FAIL\n  '+e.join('\n  '):'PASS');bad+=e.length?1:0}
console.log(bad?`${bad} fixture(s) failed`:'All 6 fixtures pass');process.exit(bad?1:0)
