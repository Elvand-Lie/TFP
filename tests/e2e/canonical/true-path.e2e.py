import subprocess,re,sys
from playwright.sync_api import sync_playwright
F='file:///home/claude/w/true-path.html'; res=[]
def ok(n,c,d=''): res.append((n,bool(c))); print(('PASS ' if c else 'FAIL ')+n,d)
SC_TXT="""JSON.stringify(SC.map(r=>r.slice(1)))"""
def journey(pg,pick='chancellor',stop=None):
    pg.click('text=Start free analysis')
    for i in range(12): pg.click('.lk .opt >> nth=%d'%(4 if i%3 else 3))
    pg.click('text=Refine your direction')
    for i in range(4): pg.click('.grid .opt >> nth=0'); pg.click('text=Continue')
    pg.click('text=Discover the role'); pg.click('text=Begin')
    sc=pg.evaluate(SC_TXT); import json; sc=json.loads(sc)
    pos=[]
    for i in range(6):
        txt=sc[i][['commander','general','chancellor'].index(pick)]
        btns=pg.locator('.stack .opt'); n=btns.count()
        texts=[btns.nth(j).inner_text() for j in range(n)]; pos.append(texts.index(txt))
        btns.nth(texts.index(txt)).click()
        if i<5: pg.wait_for_selector('text=scenario %d of 6'%(i+2))
    return pos
with sync_playwright() as p:
    b=p.chromium.launch(); ctx=b.new_context(viewport={'width':390,'height':800}); pg=ctx.new_page()
    errs=[]; bad=[]; pg.on('response',lambda r:r.status>=400 and bad.append(r.url)); pg.on('pageerror',lambda e:errs.append(str(e))); pg.on('console',lambda m:m.type=='error' and 'Failed to load resource' not in m.text and errs.append(m.text))
    pg.goto(F); pos=journey(pg)
    ok('scenario positions vary across questions',len(set(pos))>1,pos)
    pg.wait_for_selector('.pulse',timeout=3000)
    ok('stored roles are role keys, independent of position',pg.evaluate('JSON.stringify(S.sc)')=='["chancellor"]'.replace('"chancellor"]','"chancellor","chancellor","chancellor","chancellor","chancellor","chancellor"]'))
    ok('synthesis fills viewport (fixed, inset 0)',pg.evaluate("(()=>{const e=document.querySelector('.pulse');if(!e)return false;const r=e.getBoundingClientRect();return r.width>=innerWidth&&r.height>=innerHeight})()"))
    pg.wait_for_selector('text=Your Iron Triangle Role',timeout=6000)
    ok('result shows and shares sum 100',pg.evaluate('Object.values(S.res.share).reduce((a,b)=>a+b)')==100)
    ok('result blocks present',all(pg.locator('text='+t).count() for t in ['Your Triangle Gap','Where you may thrive','Growth edge','Value creation style','Reflection']))
    pg.reload(); ok('refresh keeps result',pg.locator('text=Your Iron Triangle Role').count()==1)
    pg.click('text=View your report'); pg.go_back(); ok('browser Back leaves report -> result',pg.locator('text=Your Iron Triangle Role').count()==1)
    pg.go_forward(); pdfp='/home/claude/w/r.pdf'; pg.emulate_media(media='print'); pg.pdf(path=pdfp,format='A4',print_background=True)
    n=int(re.search(r'Pages:\s+(\d+)',subprocess.run(['pdfinfo',pdfp],capture_output=True,text=True).stdout).group(1)); ok('print = exactly 3 pages',n==3,n); pg.emulate_media(media='screen')
    pg.screenshot(path='rep.png',full_page=True)
    ok('no console/page errors',not errs,errs)
    # mid-journey refresh / back
    pg2=ctx.new_page(); pg2.goto(F); pg2.evaluate('sessionStorage.clear()'); pg2.reload(); pg2.click('text=Start free analysis')
    for i in range(5): pg2.click('.lk .opt >> nth=2')
    pg2.reload(); ok('refresh mid-talent keeps position',pg2.locator('text=Statement 6 of 12').count()==1)
    pg2.click('text=Back'); ok('Back within quiz works',pg2.locator('text=Statement 5 of 12').count()==1)
    for w in (320,375,390,430):
        q=ctx.new_page(); q.set_viewport_size({'width':w,'height':700}); q.goto(F); journey(q); q.wait_for_selector('text=Your Iron Triangle Role',timeout=6000)
        ov=q.evaluate('document.documentElement.scrollWidth-innerWidth'); ok(f'no horizontal overflow @{w}',ov<=0,ov)
        q.click('text=View your report'); ov=q.evaluate('document.documentElement.scrollWidth-innerWidth'); ok(f'report no overflow @{w}',ov<=0,ov); q.close()
    rm=b.new_context(reduced_motion='reduce',viewport={'width':390,'height':800}).new_page(); rm.goto(F); rm.click('text=Start free analysis')
    ok('reduced-motion disables animation',rm.evaluate("getComputedStyle(document.querySelector('h2')).animationName")=='none' and rm.evaluate("matchMedia('(prefers-reduced-motion:reduce)').matches"))
    b.close()
print('FAILED' if any(not c for _,c in res) else 'ALL E2E PASS')
