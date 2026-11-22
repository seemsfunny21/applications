'use strict';
/* Layout smoke test: fresh browser context, no player data and no game moves. */
const assert=require('node:assert/strict');
const fs=require('node:fs');
const {chromium}=require('playwright');

(async()=>{
  const executablePath=['/usr/bin/google-chrome','/usr/bin/google-chrome-stable','/usr/bin/chromium'].find(fs.existsSync);
  if(!executablePath)throw Error('Chromium/Chrome unavailable');
  const browser=await chromium.launch({headless:true,executablePath,args:['--no-sandbox']});
  const viewport={width:1920,height:1080}; // User's actual desktop resolution.
  const context=await browser.newContext({viewport,locale:'el-GR',serviceWorkers:'block'});
  // Monopoly must reliably land on an unowned property: dice 2+3 = 5.
  // This makes purchase, auction, and resume-after-reload testable in Chromium.
  await context.addInitScript(()=>{
    if(location.pathname.includes('/monopolyfunny/')){
      let diceCalls=0;
      Math.random=()=>++diceCalls%2?0.2:0.4;
    }
  });
  const page=await context.newPage();
  const keys=['sudokufunny','reversifunny','minesweeperfunny','solitairefunny','chessfunny',
    'tavlifunny','tichufunny','tichufunnyonline','monopolyfunny','quizfunny'];
  const findings=[];
  try{
    const base=process.env.APPS_TEST_URL||'http://127.0.0.1:8765/apps/';
    const live=base.startsWith('https:');
    if(live){
      // Avoid auditing the previous Pages deployment when workflows overlap.
      let published=false;
      for(let tries=0;tries<12;tries++){
        await page.goto(base+'?audit='+tries,{waitUntil:'domcontentloaded',timeout:30000});
        published=await page.locator('script').evaluateAll(xs=>xs.some(x=>x.textContent.includes('20261121-gear-clean-v3')&&x.textContent.includes('20261121-gear-help-v2')&&x.textContent.includes('20261121-purchase-modal-v22')));
        if(published)break;
        await page.waitForTimeout(5000);
      }
      assert.ok(published,'The deployed /apps version has the viewport fixes');
    }else{
      await page.goto(base,{waitUntil:'domcontentloaded',timeout:25000});
    }
    assert.equal(await page.locator('#gamesList [data-game]').count(),10,'Exactly ten games offered');
    for(const key of keys){
      await page.locator('#gamesList [data-game="'+key+'"]').click();
      assert.equal(await page.locator('#pane-games.is-maximized').count(),1,'Game expands: '+key);
      const iframe=page.locator('#gamesFrame iframe.game-iframe');
      assert.equal(await iframe.count(),1,'Exactly one game frame: '+key);
      const rect=await iframe.boundingBox();
      assert.ok(rect&&rect.width>=viewport.width-6&&rect.height>=viewport.height-52,'Full-size game frame: '+key+' '+JSON.stringify(rect));
      const frame=await (await iframe.elementHandle()).contentFrame();
      const target=new URL(await iframe.getAttribute('src'),page.url());
      if(!frame.url().startsWith(target.origin+target.pathname)){
        await page.waitForEvent('framenavigated',{
          predicate:item=>item===frame&&item.url().startsWith(target.origin+target.pathname),
          timeout:25000
        });
      }
      await frame.waitForLoadState('load',{timeout:25000});
      if(live){
        await frame.waitForFunction(()=>!!document.getElementById('apps-desktop-game-fit'),{timeout:10000});
      }
      const data=await frame.evaluate(()=>{
        const root=document.documentElement,body=document.body;
        return {
          title:document.title,
          buttons:document.querySelectorAll('button').length,
          viewport:[innerWidth,innerHeight],
          document:[root.scrollWidth,root.scrollHeight],
          hasHorizontalOverflow:root.scrollWidth>root.clientWidth+2,
          hasVerticalOverflow:root.scrollHeight>root.clientHeight+2,
          text:(body?.innerText||'').slice(0,90),
          geometry:Object.fromEntries(['header','.hero','.suite-game-banner','.shell','.app-shell','.layout','.board','.board-wrap','.game','.panel','.footer','.foot'].map(q=>{
            const el=document.querySelector(q),r=el?.getBoundingClientRect();
            return [q,r?{y:Math.round(r.y),height:Math.round(r.height),width:Math.round(r.width)}:null];
          }).filter(x=>x[1]))
        };
      });
      assert.ok(data.title&&data.buttons>0,'Real game document loaded: '+key+' '+JSON.stringify(data));
      if(live){
        assert.equal(data.hasHorizontalOverflow,false,'No horizontal scrolling: '+key);
        assert.ok(data.document[1]<=data.viewport[1]+2,
          'No vertical scrolling: '+key+' '+JSON.stringify(data));
      }


      // Requested TV refinements: verify actual DOM placement and legibility.
      if(key==='chessfunny'){
        assert.equal(await frame.locator('.controls').count(),0,
          'Chess has no extra commands or Settings below/alongside the board');
        assert.equal(await frame.locator('#gear2').count(),0,
          'Chess has exactly one Settings gear at the top');
        for(const action of ['turn','wins','aiLevel','undo','hint','new','clearWins','difficulty']){
          assert.equal(await frame.locator('#settings #'+action).count(),1,
            'Chess '+action+' belongs inside top Settings');
        }
        const bigBoard=await frame.locator('.board').boundingBox();
        if(live)assert.ok(bigBoard.width>=840&&bigBoard.height>=840,
          'Chess board enlarged to TV height '+JSON.stringify(bigBoard));
        await frame.locator('#gear').click();
        await frame.locator('#hint').click();
        assert.equal(await frame.locator('#settings').isHidden(),true,
          'Chess hint closes gear so the suggestion is visible on the board');
        assert.equal(await frame.locator('.sq.hint').count(),1,
          'Chess hint still functions from inside Settings');
        await frame.locator('#gear').click();
        await frame.locator('#new').click();
        assert.equal(await frame.locator('#settings').isHidden(),true,
          'Chess new match returns from Settings');
        assert.equal(await frame.locator('#board .sq').count(),64,
          'Chess reset renders full board');
        assert.equal(await frame.locator('#board .piece').count(),32,
          'Chess reset restores starting position');
      }
      if(key==='minesweeperfunny'){
        assert.equal(await frame.locator('.help-details').count(),0,
          'No instruction block below the Minesweeper board');
        assert.equal(await frame.locator('.hero #gear').count(),1,
          'Minesweeper has a top-right Settings gear');
        await frame.locator('#gear').click();
        assert.equal(await frame.locator('#settingsDialog').evaluate(el=>el.open),true,
          'Minesweeper Settings open');
        assert.ok((await frame.locator('#settingsDialog').innerText()).includes('Οδηγίες χειρισμού'),
          'Minesweeper instructions moved inside the Settings dialog');
        assert.equal(await frame.locator('#settingsDialog .funny-help-btn').count(),1,
          'Full game instructions also accessible from the gear');
        await frame.locator('#settingsDialog .funny-help-btn').click();
        assert.equal(await frame.locator('.funny-help-overlay').isVisible(),true,
          'Full Minesweeper tutorial opens');
        await frame.locator('.funny-help-close').click();
        assert.equal(await frame.locator('.funny-help-overlay').isHidden(),true,
          'Full Minesweeper tutorial closes');
        assert.equal(await frame.locator('#board .cell').count(),81,
          'Minesweeper board remains playable after opening help');
      }
      if(key==='reversifunny'){
        assert.equal(await frame.locator('.tool-row #newButton').count(),0,
          'No new match below Reversi board');
        assert.equal(await frame.locator('#settingsForm #newButton').count(),1,
          'Reversi restart is inside Settings');
        await frame.locator('#settingsButton').click();
        await frame.locator('input[name="mode"][value="local"]').evaluate(el=>el.click());
        await frame.locator('#newButton').click();
        assert.equal(await frame.locator('#settingsDialog').evaluate(x=>x.open),false,
          'Reversi restart closes Settings');
        const saved=await frame.evaluate(()=>JSON.parse(localStorage.getItem('reversifunny.game.v1')));
        assert.equal(saved?.mode,'local','New Reversi match uses mode selected in Settings');
        assert.equal(saved?.history?.length,0,'Reversi new game is freshly initialized');
      }
      if(key==='solitairefunny'){
        assert.equal(await frame.locator('.foot').count(),0,
          'No redundant instruction text below Solitaire');
      }
      if(live&&key==='tavlifunny'){
        const b=await frame.locator('.board-wrap').boundingBox();
        assert.ok(b.width>1850&&b.height>800,
          'TV Tavli fills width AND height '+JSON.stringify(b));
      }
      if(live&&(key==='tichufunny'||key==='tichufunnyonline')){
        const p=await frame.locator('.panel').first().boundingBox();
        const b=await frame.locator('#cardTable').boundingBox();
        assert.ok(p.width>1600&&p.height>=830&&b.height>=690,
          'TV Tichu table occupies display '+JSON.stringify({p,b}));
      }
      if(key==='quizfunny'){
        await frame.locator('#next').click();
        await frame.locator('.answers .answer').first().waitFor({timeout:10000});
        const readable=await frame.evaluate(()=>{
          const q=document.querySelector('#question'),a=document.querySelector('.answer'),
           qr=q.getBoundingClientRect(),ar=a.getBoundingClientRect();
          return {qHeight:qr.height,answerHeight:ar.height,
            font:parseFloat(getComputedStyle(a).fontSize),count:document.querySelectorAll('.answer').length};
        });
        assert.equal(readable.count,4,'Quiz displays four answer tiles');
        assert.ok(readable.font>=20&&readable.answerHeight>=110&&readable.qHeight<=225,
          'Quiz question compact and answer tiles large '+JSON.stringify(readable));
        console.log('PASS TV QUIZ ANSWERS '+JSON.stringify(readable));
      }
      if(key==='monopolyfunny'){
        const capture=()=>frame.evaluate(()=>{
          const game=JSON.parse(localStorage.getItem('monopolyfunny-v1')||'null');
          return {
            round:game?.round,phase:game?.phase,players:game?.players?.length,
            current:game?.current,pos:game?.players?.[0]?.pos,
            stationOwner:game?.properties?.[5]?.owner,
            log:game?.log||[],modal:document.getElementById('modal')?.open,
            purchaseOpen:document.getElementById('purchasePanel')?.open
          };
        });
        const before=await capture();
        await frame.waitForFunction(()=>{
          const game=JSON.parse(localStorage.getItem('monopolyfunny-v1')||'null');
          return game?.log?.some(x=>x.includes('έφερε'));
        },null,{timeout:9000});
        await frame.locator('#purchasePanel[open]').waitFor({timeout:8000});
        const prompt=await frame.evaluate(()=>{
          const d=document.getElementById('purchasePanel'),r=d.getBoundingClientRect();
          const b=document.getElementById('inlineBuy').getBoundingClientRect();
          const a=document.getElementById('inlineAuction').getBoundingClientRect();
          return {open:d.open,viewport:[innerWidth,innerHeight],
           dialog:[r.x,r.y,r.width,r.height],buy:[b.x,b.y,b.width,b.height],
           auction:[a.x,a.y,a.width,a.height],text:d.innerText};
        });
        assert.ok(prompt.open&&prompt.dialog[1]>=0
          &&prompt.dialog[1]+prompt.dialog[3]<=prompt.viewport[1]+2,
          'Monopoly purchase modal entirely on-screen '+JSON.stringify(prompt));
        for(const rect of [prompt.buy,prompt.auction]){
          assert.ok(rect[1]>=0&&rect[1]+rect[3]<prompt.viewport[1],
            'Purchase choice is not clipped by board '+JSON.stringify(prompt));
        }
        assert.ok(prompt.text.includes('Σταθμός Βορρά'),
          'First fixed roll reaches an available property '+JSON.stringify(prompt));
        await frame.locator('#inlineBuy').click();
        const purchased=await capture();
        assert.equal(purchased.stationOwner,0,
          'Clicking Buy really purchases the station '+JSON.stringify(purchased));
        assert.equal(purchased.purchaseOpen,false,'Purchase modal closes after buying');
        // New game still works after closing a purchase prompt.
        await frame.locator('#newGame').click();
        await frame.locator('#dialogActions button', {hasText:'1 AI'}).click();
        await frame.locator('#dialogActions button', {hasText:'Νέα παρτίδα'}).click();
        const fresh=await capture();
        assert.equal(fresh.players,2,'Monopoly starts chosen 1-AI game');
        assert.equal(fresh.round,1,'Monopoly resets to round one');
        // Reload with an interrupted purchase. The decision MUST reappear,
        // and an auction must advance the phase (rather than trapping player).
        await frame.evaluate(()=>{
          const saved=JSON.parse(localStorage.getItem('monopolyfunny-v1'));
          saved.phase='buy';saved.current=0;saved.players[0].pos=9;
          saved.properties[9].owner=-1;
          localStorage.setItem('monopolyfunny-v1',JSON.stringify(saved));
        });
        await frame.goto(frame.url(),{waitUntil:'load'});
        await frame.locator('#purchasePanel[open]').waitFor({timeout:8000});
        assert.ok((await frame.locator('#purchaseTitle').innerText()).includes('Οδός Κήπων'),
          'Saved pending property choice restored as a modal');
        await frame.locator('#inlineAuction').click();
        const auctioned=await capture();
        assert.equal(auctioned.purchaseOpen,false,'Auction closes the purchase modal');
        assert.notEqual(auctioned.phase,'buy','Auction successfully completes the buying phase');
        // Invalid saved states must not lock up the next session.
        await frame.evaluate(()=>{
          const saved=JSON.parse(localStorage.getItem('monopolyfunny-v1'));
          saved.phase='unsupported-old-phase';
          localStorage.setItem('monopolyfunny-v1',JSON.stringify(saved));
        });
        await frame.goto(frame.url(),{waitUntil:'load'});
        const recovered=await capture();
        assert.equal(recovered.phase,'roll','Invalid saved game safely resets');
        assert.equal(recovered.players,3,'Invalid game restores default party');
        assert.equal(await frame.locator('#newGame').count(),1,
          'Start action stays available after recovery');
        console.log('PASS MONOPOLY ACTIONS '+JSON.stringify({before,prompt,purchased,fresh,auctioned,recovered}));
      }
      findings.push({game:key,frame:[Math.round(rect.width),Math.round(rect.height)],...data});
      await page.locator('#gamesBack').click();
      assert.equal(await page.locator('#gamesList').isVisible(),true,'Back returns to chooser: '+key);
      assert.equal(await page.locator('#pane-games.is-maximized').count(),0,'Back restores dashboard: '+key);
      assert.equal(await page.locator('iframe.game-iframe').count(),0,'Game unloaded on return: '+key);
      console.log('PASS '+key+' viewport '+data.viewport.join('x')+
        ' scroll (x/y) '+data.hasHorizontalOverflow+'/'+data.hasVerticalOverflow);
    }
    for(const width of [1366,1920]){
      await page.setViewportSize({width,height:1080});
      await page.locator('#gamesList [data-game="chessfunny"]').click();
      const rect=await page.locator('iframe.game-iframe').boundingBox();
      assert.ok(rect.width>=width-6&&rect.height>=1020,'Full-height chess at '+width);
      await page.locator('#gamesBack').click();
    }
    // Mobile portrait: the Tichu view rotates to a landscape felt. Its
    // decorative banner must not consume the phone's short edge any more.
    const mobile=await browser.newContext({
      viewport:{width:393,height:844},deviceScaleFactor:2,isMobile:true,
      hasTouch:true,locale:'el-GR',serviceWorkers:'block'
    });
    try{
      const phone=await mobile.newPage();
      for(const key of ['tavlifunny','solitairefunny']){
        const src=new URL('../'+key+'/?mobile-test=landscape-20261122',base).href;
        await phone.goto(src,{waitUntil:'domcontentloaded',timeout:30000});
        await phone.locator(key==='tavlifunny'?'.board-wrap':'#game').waitFor({state:'visible'});
        const result=await phone.evaluate(key=>{
          const banner=document.querySelector('.suite-game-banner');
          const shell=document.querySelector('.shell');
          const board=document.querySelector(key==='tavlifunny'?'.board-wrap':'#game');
          const r=board.getBoundingClientRect(),sr=shell.getBoundingClientRect();
          return {
            bannerDisplay:getComputedStyle(banner).display,
            transform:getComputedStyle(shell).transform,
            shell:{x:sr.x,y:sr.y,width:sr.width,height:sr.height},
            board:{x:r.x,y:r.y,width:r.width,height:r.height},
            cols:document.querySelectorAll('.column').length,
            stock:document.getElementById('draw')?.getBoundingClientRect().toJSON(),
            view:[innerWidth,innerHeight],
            scroll:[document.documentElement.scrollWidth,document.documentElement.scrollHeight]
          };
        },key);
        assert.equal(result.bannerDisplay,'none',key+' removes banner on mobile');
        assert.ok(result.board.width>210&&result.board.height>300,
          key+' board uses landscape space '+JSON.stringify(result));
        if(key==='solitairefunny'){
          assert.ok(result.transform.startsWith('matrix(0, 1, -1, 0'),
            'Solitaire rotates content 90deg without changing device orientation '+JSON.stringify(result));
          assert.equal(result.cols,7,'All seven solitaire tableau columns visible');
          const cards=await phone.evaluate(()=>{
            const card=document.querySelector('.column .card');
            const top=document.querySelector('.top .slot .card');
            return {tableau:card?{width:card.offsetWidth,height:card.offsetHeight}:null,
              top:top?{width:top.offsetWidth,height:top.offsetHeight}:null};
          });
          assert.ok(cards.tableau&&cards.tableau.width<=64&&cards.tableau.height<=88,
            'Solitaire cards really shrink to compact dimensions '+JSON.stringify(cards));
          console.log('PASS MOBILE SOLITAIRE COMPACT CARDS '+JSON.stringify(cards));
          const compactColumns=await phone.evaluate(()=>{
            const columns=document.querySelector('.columns');
            const game=document.querySelector('#game');
            const a=columns.getBoundingClientRect();
            const b=game.getBoundingClientRect();
            const cs=getComputedStyle(columns);
            return {
              width:columns.offsetWidth,columnsWidth:a.width,
              gameWidth:b.width,gridColumns:cs.gridTemplateColumns,
              gap:cs.columnGap,emptyRight:(game.clientWidth-columns.offsetWidth),
              cardWidth:document.querySelector('.column .card')?.offsetWidth
            };
          });
          assert.ok(compactColumns.width<=470&&compactColumns.emptyRight>=250,
            'Solitaire seven columns are close together, with empty right area '+JSON.stringify(compactColumns));
          assert.ok(parseFloat(compactColumns.gap)<=3,
            'Solitaire columns are close to touching '+JSON.stringify(compactColumns));
          assert.ok(compactColumns.cardWidth>=58,
            'Keep existing 60px card width '+JSON.stringify(compactColumns));
          console.log('PASS MOBILE SOLITAIRE GROUPED COLUMNS '+JSON.stringify(compactColumns));


          assert.ok(result.stock?.width>25&&result.stock?.height>45,
            'Stock button remains tappable '+JSON.stringify(result));
          await phone.locator('#draw').click();
          assert.equal(await phone.locator('#waste .card').count(),1,
            'Solitaire stock and waste stay interactive after rotation');
        }
        console.log('PASS MOBILE '+key+' '+JSON.stringify(result));
      }
      for(const key of ['tichufunny','tichufunnyonline']){
        const src=new URL('../'+key+'/?mobile-test=1',base).href;
        await phone.goto(src,{waitUntil:'domcontentloaded',timeout:30000});
        const measured=await phone.evaluate(()=>{
          const banner=document.querySelector('.suite-game-banner');
          const game=document.querySelector('#cardTable');
          const app=document.querySelector('.app');
          const b=game?.getBoundingClientRect();
          return {
            bannerDisplay:banner?getComputedStyle(banner).display:'absent',
            appTransform:app?getComputedStyle(app).transform:'missing',
            tableHeight:b?.height||0,tableWidth:b?.width||0,
            viewport:[innerWidth,innerHeight],
            gameFound:!!game
          };
        });
        assert.equal(measured.bannerDisplay,'none',key+' mobile banner hidden');
        assert.ok(measured.gameFound&&measured.tableHeight>300&&measured.tableWidth>210,
          key+' keeps a sizeable playable table '+JSON.stringify(measured));
        console.log('PASS MOBILE '+key+' '+JSON.stringify(measured));
      }
    }finally{await mobile.close();}
    console.log('PASS '+(live?'PUBLISHED ':'LOCAL ')+'/apps at 1920x1080: ten game URLs, initial HTML, full-screen fit, and back navigation');
    console.log('LAYOUT_AUDIT '+JSON.stringify(findings));
  }finally{
    await context.close();
    await browser.close();
  }
})().catch(err=>{console.error(err);process.exitCode=1;});
