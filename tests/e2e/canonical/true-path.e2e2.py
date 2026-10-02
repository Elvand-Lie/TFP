import os,json,re,subprocess
from playwright.sync_api import sync_playwright
F='file:///home/claude/w/'+os.environ.get('HTML','true-path.html'); res=[]
def ok(n,c,d=''): res.append(bool(c)); print(('PASS ' if c else 'FAIL ')+n,d)
ROLES=['commander','general','chancellor']
def journey(pg,roles=('chancellor',)*6,nik=1,stop=None):
    pg.click('text=Start free analysis'); pg.click('text=Begin: 12')
    for i in range(12): pg.click('.lk .opt >> nth=%d'%(4 if i%3 else 3))
    pg.click('text=Refine your direction'); pg.click('text=Choose my direction')
    for i in range(4):
        for j in range(nik): pg.click('.grid .opt >> nth=%d'%j)
        pg.click('text=Continue')
    pg.click('text=Discover the role')
    if stop=='intro': return
    pg.click('text=Begin'); sc=json.loads(pg.evaluate("JSON.stringify(SC.map(r=>r.slice(1)))"))
    for i in range(6):
        pg.locator('.stack .opt',has_text=sc[i][ROLES.index(roles[i])]).click()
        if i<5: pg.wait_for_selector('text=scenario %d of 6'%(i+2))
    pg.wait_for_selector('text=Your Iron Triangle Role',timeout=7000)
def newpg(b,cfg=None,**kw):
    c=b.new_context(viewport={'width':390,'height':800},**kw)
    if cfg: c.add_init_script('window.TP_CONFIG='+json.dumps(cfg))
    pg=c.new_page(); errs=[]; pg.on('pageerror',lambda e:errs.append(str(e))); pg.errs=errs; return pg
with sync_playwright() as p:
    b=p.chromium.launch()
    # screen theme not broken by print rules
    pg=newpg(b); pg.goto(F); ok('screen: dark bg + #app max-width intact',pg.evaluate("getComputedStyle(document.body).backgroundColor")=='rgb(20, 18, 18)' and pg.evaluate("getComputedStyle(document.querySelector('#app')).paddingTop")=='20px')
    # analytics
    dl=lambda:[e['event'] for e in pg.evaluate('window.dataLayer')]
    ok('first load: exactly one tp_landing_view',dl()==['tp_landing_view'],dl()); pg.reload(); ok('reload on landing: one view',dl()==['tp_landing_view'])
    journey(pg,stop='intro'); t=pg.inner_text('#app'); ok('Stage 3 intro shows "about 60 seconds left" + Final step','about 60 seconds left' in t and 'Final step' in t)
    pg.evaluate('window.dataLayer=[]'); pg.evaluate('S.step="landing";render()'); pg.evaluate('restart()'); ok('restart emits tp_restart only (no extra landing view)',dl()==['tp_restart'],dl())
    # no fake id / consult default
    pg=newpg(b); pg.goto(F); journey(pg); pg.evaluate('window.dataLayer=[]')
    ok('no generated id (S.id null, payload null)',pg.evaluate('S.id')is None and pg.evaluate('payload({}).resultId')is None)
    hrefs=pg.evaluate("[...document.querySelectorAll('a')].map(a=>a.href)"); ok('result: no homepage/consult link by default',not any('thefullpicture.asia' in h for h in hrefs),hrefs)
    ok('result: CTA disabled with explanation',pg.locator('button.btn[disabled]',has_text='Book a 1-Hour').count()==1 and pg.locator('#nb').count()==1)
    pg.click('text=View your report'); ok('report: no booking link, local preview label','Local preview (not saved)' in pg.inner_text('#app') and not pg.evaluate("[...document.querySelectorAll('a')].some(a=>/book|thefullpicture/i.test(a.href))"))
    ok('tp_report_view resultId null',[e.get('resultId','x') for e in pg.evaluate('window.dataLayer') if e['event']=='tp_report_view']==[None])
    ok('no page errors',not pg.errs,pg.errs)
    # configured: backend id + consult url with existing query, double submit
    posts=[]
    cfg={'consultUrl':'https://cal.example/book?x=1','privacyUrl':'https://example.com/privacy','api':{'saveResult':'https://api.test/save','sendReport':'https://api.test/send'}}
    pg=newpg(b,cfg)
    def h(route):
        u=route.request.url; posts.append(u)
        body='{"resultId":"srv_42"}' if u.endswith('save') else '{}'
        route.fulfill(status=200,content_type='application/json',body=body,headers={'access-control-allow-origin':'*'})
    pg.route('https://api.test/**',h); pg.goto(F); journey(pg); pg.wait_for_timeout(300)
    ok('backend id used only when returned','srv_42'==pg.evaluate('S.id'))
    href=pg.locator('a.btn',has_text='Book a 1-Hour').get_attribute('href'); ok('consult href valid (one ?, then &)',href.count('?')==1 and '&title=' in href and 'role=chancellor' in href,href)
    pg.fill('#fn','Ann'); pg.fill('#em','ann@example.com'); pg.evaluate("document.querySelector('button.btn[onclick=\"sendEmail()\"]').click();document.querySelector('button.btn[onclick=\"sendEmail()\"]')&&document.querySelector('button.btn[onclick=\"sendEmail()\"]').click()"); pg.wait_for_timeout(500)
    ok('double-submit sends exactly one email',posts.count('https://api.test/send')==1,posts)
    pg=newpg(b); pg.goto(F); journey(pg); ok('email disabled + honest message when unconfigured',pg.locator('button[onclick="sendEmail()"][disabled]').count()==1 and 'isn’t connected' in pg.inner_text('#fm'))
    # keyboard
    pg=newpg(b); pg.goto(F); pg.keyboard.press('Tab'); ok('keyboard: Start focusable + visible ring',pg.evaluate("document.activeElement.textContent")=='Start free analysis' and pg.evaluate("getComputedStyle(document.activeElement).outlineWidth")=='2px')
    def tab_to(q,sel,maxn=12):
        for _ in range(maxn):
            q.keyboard.press('Tab')
            if q.evaluate("(s)=>document.activeElement.matches(s)",sel): return True
        return False
    pg.keyboard.press('Enter'); pg.wait_for_selector('text=Begin: 12'); ok('keyboard: Tab reaches Begin on Talent intro',tab_to(pg,'button.btn') and 'Begin: 12' in pg.evaluate("document.activeElement.textContent")); pg.keyboard.press('Enter'); pg.wait_for_selector('text=Statement 1 of 12'); ok('keyboard: heading receives focus on step change',pg.evaluate("document.activeElement.tagName")=='H2')
    ok('keyboard: Tab reaches a Likert option with a visible ring',tab_to(pg,'.lk .opt') and pg.evaluate("getComputedStyle(document.activeElement).outlineWidth")=='2px')
    lab=pg.evaluate("document.activeElement.getAttribute('aria-label')"); pg.keyboard.press('Enter'); pg.wait_for_selector('text=Statement 2 of 12')
    ok('keyboard: Enter records exactly the focused Likert value and advances',pg.evaluate("S.ta[ORDER[0]]")==int(lab[0]) and pg.evaluate("S.qi")==1,lab)
    ok('keyboard: focus moves to the next question heading',pg.evaluate("document.activeElement.tagName")=='H2')
    pg.evaluate("for(let i=1;i<12;i++)ans(ORDER[i],4)"); pg.wait_for_selector('text=Refine your direction'); pg.click('text=Refine your direction'); pg.click('text=Choose my direction')
    ok('keyboard: Tab reaches an Ikigai card',tab_to(pg,'.grid .opt')); key=pg.evaluate("document.activeElement.textContent"); pg.keyboard.press('Space')
    ok('keyboard: Space selects the focused card (state + aria-pressed on that same card)',pg.evaluate("S.ik[0].length")==1 and pg.locator('.grid .opt[aria-pressed=true]').count()==1 and pg.evaluate("document.querySelector('.grid .opt[aria-pressed=true]').textContent")==key,key)
    ok('keyboard: focus stays on the card after selecting',pg.evaluate("document.activeElement.textContent")==key)
    pg.keyboard.press('Space'); ok('keyboard: second Space deselects (aria-pressed false, state empty)',pg.evaluate("S.ik[0].length")==0 and pg.locator('.grid .opt[aria-pressed=true]').count()==0)
    pg.keyboard.press('Space'); ok('keyboard: Continue is enabled with a selection and reachable by Tab',pg.locator('button.btn:has-text("Continue")[disabled]').count()==0 and tab_to(pg,'button.btn:not([disabled])'))
    # reduced motion vs normal
    def anim(ctxkw):
        q=newpg(b,**ctxkw); q.goto(F); q.click('text=Start free analysis'); q.click('text=Begin: 12'); r={}
        for i in range(12): q.click('.lk .opt >> nth=4')
        q.wait_for_selector('.br'); r['tree']=q.evaluate("getComputedStyle(document.querySelector('.br')).animationName")
        q.click('text=Refine your direction'); q.click('text=Choose my direction')
        for i in range(4): q.click('.grid .opt >> nth=0'); q.click('text=Continue')
        q.click('text=Discover the role'); q.click('text=Begin'); sc=json.loads(q.evaluate("JSON.stringify(SC.map(r=>r.slice(1)))"))
        for i in range(6):
            q.locator('.stack .opt',has_text=sc[i][0]).click()
            if i<5: q.wait_for_selector('text=scenario %d of 6'%(i+2))
        q.wait_for_selector('.pulse'); r['pulse']=q.evaluate("getComputedStyle(document.querySelector('.pulse')).animationName")
        q.wait_for_selector('text=Your Iron Triangle Role',timeout=7000); r['tri']=q.evaluate("getComputedStyle(document.querySelector('.grow')).animationName"); return r
    n=anim({}); r=anim({'reduced_motion':'reduce'}); ok('animations run normally',all(v!='none' for v in n.values()),n); ok('reduced-motion: all animations off, flow still completes',all(v=='none' for v in r.values()),r)
    # thresholds configurable (node vm)
    # print stress
    for name,roles,nik in [('single',('chancellor',)*6,3),('dual',('commander','general')*3,3),('balanced',('commander','general','chancellor')*2,3)]:
        for fmt in ('A4','Letter'):
            q=newpg(b); q.goto(F); journey(q,roles,nik); pat=q.evaluate('S.res.pattern'); q.click('text=View your report')
            q.emulate_media(media='print'); q.set_viewport_size({'width':703 if fmt=='A4' else 725,'height':900}); H=q.evaluate("[...document.querySelectorAll('.pg')].map(e=>Math.round(e.getBoundingClientRect().height))")
            q.pdf(path='s.pdf',format=fmt,print_background=True); n=int(re.search(r'Pages:\s+(\d+)',subprocess.run(['pdfinfo','s.pdf'],capture_output=True,text=True).stdout).group(1))
            tx=[len(subprocess.run(['pdftotext','-f',str(i),'-l',str(i),'s.pdf','-'],capture_output=True,text=True).stdout.strip()) for i in range(1,n+1)]
            lim=1032 if fmt=='A4' else 965; ok(f'print {name}({pat}) {fmt}: 3 pages, none blank, tallest page {max(H)}px<= {lim}',n==3 and min(tx)>150 and max(H)<=lim,(n,tx,H))
    b.close()
print('ALL E2E2 PASS' if all(res) else 'E2E2 FAILURES')
