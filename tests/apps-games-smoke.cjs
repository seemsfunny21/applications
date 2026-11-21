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
        published=await page.locator('script').evaluateAll(xs=>xs.some(x=>x.textContent.includes('.suite-game-banner,.hero{display:none!important}')));
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

      if(key==='monopolyfunny'){
        // Assert a game can START, not just render its 40 square board.
        const capture=()=>frame.evaluate(()=>{
          const game=JSON.parse(localStorage.getItem('monopolyfunny-v1')||'null');
          return {round:game?.round,phase:game?.phase,players:game?.players?.length,
            log:game?.log||[],modal:document.getElementById('modal')?.open,
            settings:!!document.getElementById('settings'),
            buttons:[...document.querySelectorAll('#dialogActions button')].map(x=>x.textContent)};
        });
        const before=await capture();
        await frame.waitForFunction(()=>{
          const data=JSON.parse(localStorage.getItem('monopolyfunny-v1')||'null');
          return data?.log?.some(x=>x.includes('έφερε'));
        },{timeout:7500});
        const auto=await capture();
        assert.ok(auto.log.some(x=>x.includes('έφερε')),
          'Monopoly auto-turn actually starts '+JSON.stringify({before,auto}));
        // The prominently visible start action must work, without Settings.
        assert.equal(await frame.locator('#newGame').count(),1,
          'Monopoly has an explicit start/restart button');
        await frame.locator('#newGame').click();
        await frame.locator('#dialogActions button', {hasText:'1 AI'}).click();
        await frame.locator('#dialogActions button', {hasText:'Νέα παρτίδα'}).click();
        const fresh=await capture();
        assert.equal(fresh.players,2,'Monopoly starts chosen new 1-AI game '+JSON.stringify(fresh));
        assert.equal(fresh.round,1,'Monopoly resets to round one');
        await frame.waitForFunction(()=>{
          const game=JSON.parse(localStorage.getItem('monopolyfunny-v1')||'null');
          return game?.log?.some(x=>x.includes('έφερε'));
        },null,{timeout:8000});
        // Broken/stale saved games should recover instead of leaving a dead board.
        await frame.evaluate(()=>{
          const saved=JSON.parse(localStorage.getItem('monopolyfunny-v1'));
          saved.phase='unsupported-old-phase';
          localStorage.setItem('monopolyfunny-v1',JSON.stringify(saved));
        });
        await frame.goto(frame.url(),{waitUntil:'load'});
        const recovered=await capture();
        assert.equal(recovered.phase,'roll','Monopoly repairs invalid saved game on launch');
        assert.equal(recovered.players,3,'Recovery restores default game instead of a dead screen');
        assert.equal(await frame.locator('#newGame').count(),1,
          'Start action remains visible after save recovery');
        console.log('PASS MONOPOLY GAMEPLAY '+JSON.stringify({before,auto,fresh,recovered}));
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
    console.log('PASS '+(live?'PUBLISHED ':'LOCAL ')+'/apps at 1920x1080: ten game URLs, initial HTML, full-screen fit, and back navigation');
    console.log('LAYOUT_AUDIT '+JSON.stringify(findings));
  }finally{
    await context.close();
    await browser.close();
  }
})().catch(err=>{console.error(err);process.exitCode=1;});
