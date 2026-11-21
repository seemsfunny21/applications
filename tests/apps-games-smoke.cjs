'use strict';
/* Layout smoke test: fresh browser context, no player data and no game moves. */
const assert=require('node:assert/strict');
const fs=require('node:fs');
const {chromium}=require('playwright');

(async()=>{
  const executablePath=['/usr/bin/google-chrome','/usr/bin/google-chrome-stable','/usr/bin/chromium'].find(fs.existsSync);
  if(!executablePath)throw Error('Chromium/Chrome unavailable');
  const browser=await chromium.launch({headless:true,executablePath,args:['--no-sandbox']});
  const context=await browser.newContext({viewport:{width:1366,height:768},locale:'el-GR',serviceWorkers:'block'});
  const page=await context.newPage();
  const keys=['sudokufunny','reversifunny','minesweeperfunny','solitairefunny','chessfunny',
    'tavlifunny','tichufunny','tichufunnyonline','monopolyfunny','quizfunny'];
  const findings=[];
  try{
    await page.goto('http://127.0.0.1:8765/apps/',{waitUntil:'domcontentloaded',timeout:25000});
    assert.equal(await page.locator('#gamesList [data-game]').count(),10,'Exactly ten games offered');
    for(const key of keys){
      await page.locator('#gamesList [data-game="'+key+'"]').click();
      assert.equal(await page.locator('#pane-games.is-maximized').count(),1,'Game expands: '+key);
      const iframe=page.locator('#gamesFrame iframe.game-iframe');
      assert.equal(await iframe.count(),1,'Exactly one game frame: '+key);
      const rect=await iframe.boundingBox();
      assert.ok(rect&&rect.width>=1360&&rect.height>=700,'Full-size game frame: '+key+' '+JSON.stringify(rect));
      const frame=await iframe.contentFrame();
      const target=new URL(await iframe.getAttribute('src'),page.url());
      await frame.waitForURL(url=>url.origin===target.origin&&url.pathname===target.pathname,{timeout:25000});
      await frame.waitForLoadState('domcontentloaded',{timeout:25000});
      const data=await frame.evaluate(()=>{
        const root=document.documentElement,body=document.body;
        return {
          title:document.title,
          buttons:document.querySelectorAll('button').length,
          viewport:[innerWidth,innerHeight],
          document:[root.scrollWidth,root.scrollHeight],
          hasHorizontalOverflow:root.scrollWidth>root.clientWidth+2,
          hasVerticalOverflow:root.scrollHeight>root.clientHeight+2,
          text:(body?.innerText||'').slice(0,90)
        };
      });
      assert.ok(data.title&&data.buttons>0,'Real game document loaded: '+key+' '+JSON.stringify(data));
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
    console.log('PASS /apps: ten game URLs, initial HTML, full-screen fit, and back navigation');
    console.log('LAYOUT_AUDIT '+JSON.stringify(findings));
  }finally{
    await context.close();
    await browser.close();
  }
})().catch(err=>{console.error(err);process.exitCode=1;});
