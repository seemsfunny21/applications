'use strict';
/* Safe mobile-browser smoke tests. Fresh browser profile; no real user storage.
   Do not screenshot or log private app contents or send mutations to Supabase. */
const assert=require('node:assert/strict');
const fs=require('node:fs');
const {chromium}=require('playwright');

(async()=>{
  const binary=['/usr/bin/google-chrome','/usr/bin/google-chrome-stable','/usr/bin/chromium'].find(x=>fs.existsSync(x));
  if(!binary)throw Error('Chromium/Chrome system binary unavailable');
  const browser=await chromium.launch({headless:true,executablePath:binary,args:['--no-sandbox']});
  const settings={
    viewport:{width:393,height:844},deviceScaleFactor:2,isMobile:true,hasTouch:true,
    locale:'el-GR',timezoneId:'Europe/Athens',serviceWorkers:'allow'
  };
  const base='https://seemsfunny21.github.io';
  try{
    const context=await browser.newContext(settings);
    const page=await context.newPage();
    await page.goto(base+'/applications/',{waitUntil:'domcontentloaded',timeout:45000});
    const apps=[
      ['voltes','.hero-scene'],
      ['douleia','.routes-hero-art'],
      ['reminder','.reminder-hero-art'],
      ['seemsfunny','.pegasus-hero-art'],
      ['Parking','.parking-hero-art']
    ];
    assert.equal(await page.locator('nav.tabs button.tab').count(),5);
    const heights=[];
    for(const [key,selector] of apps){
      await page.locator('#tab-'+key).click();
      const frame=page.frameLocator('#frame-'+key);
      const hero=frame.locator(selector);
      await hero.waitFor({state:'visible',timeout:40000});
      await hero.evaluate(el=>el.decode?.().catch(()=>{}));
      const box=await hero.boundingBox();
      assert.ok(box && box.width>260,'Banner is visible on mobile: '+key);
      assert.ok(box.height>=72 && box.height<=120,'Banner height in mobile range: '+key+' = '+box.height);
      const loaded=await hero.evaluate(el=>el.complete&&el.naturalWidth>0);
      assert.equal(loaded,true,'Hero image loads: '+key);
      heights.push({key,height:Math.round(box.height*10)/10});
      const selected=await page.locator('#tab-'+key).getAttribute('aria-selected');
      assert.equal(selected,'true','Applications tab selection: '+key);
    }
    const min=Math.min(...heights.map(x=>x.height)),max=Math.max(...heights.map(x=>x.height));
    assert.ok(max-min<=3,'Five mobile headers should have a shared height: '+JSON.stringify(heights));
    console.log('PASS Five application banners load at aligned mobile heights',heights);

    // All five apps were changed since the previous live test; verify actual
    // positioning and widths, not just banner heights, at two phone sizes.
    const phoneMetrics=[];
    for(const width of [393,360]){
      await page.setViewportSize({width,height:844});
      const result=[];
      for(const [key,selector] of apps){
        await page.locator('#tab-'+key).click();
        const hero=page.frameLocator('#frame-'+key).locator(selector);
        await hero.waitFor({state:'visible',timeout:30000});
        // Pegasus has a 300ms translateY(15px) entrance animation. Measure
        // its settled position, not a transient first frame.
        if(key==='seemsfunny'){
          await hero.evaluate(async el=>{
            const view=el.closest('.view');
            if(view)await Promise.all(view.getAnimations().map(a=>a.finished.catch(()=>{})));
          });
        }
        const box=await hero.boundingBox();
        assert.ok(box,'Visible banner for '+key+' at '+width+'px');
        result.push({app:key,width:+box.width.toFixed(1),
          x:+box.x.toFixed(1),y:+box.y.toFixed(1),height:+box.height.toFixed(1)});
      }
      const span=k=>Math.max(...result.map(x=>x[k]))-Math.min(...result.map(x=>x[k]));
      assert.ok(span('height')<=3,'Banner height inconsistency '+width+': '+JSON.stringify(result));
      assert.ok(span('width')<=12,'Banner width inconsistency '+width+': '+JSON.stringify(result));
      assert.ok(span('x')<=7,'Banner horizontal offset '+width+': '+JSON.stringify(result));
      assert.ok(span('y')<=12,'Banner top offset '+width+': '+JSON.stringify(result));
      const tabsFit=await page.locator('nav.tabs').evaluate(el=>
        el.scrollWidth<=el.clientWidth+1 && Array.from(el.querySelectorAll('.tab')).every(btn=>btn.scrollWidth<=btn.clientWidth+1)
      );
      assert.ok(tabsFit,'Applications navigation is clipped at '+width+'px');
      phoneMetrics.push({phoneWidth:width,align:result});
    }
    console.log('PASS Mobile geometry, header symmetry, and five tabs at 360/393px',JSON.stringify(phoneMetrics));
    await context.close();

    // Also verify every tab at desktop width. Pegasus intentionally routes to
    // its separate desktop dashboard; don't assume it has a mobile hero there.
    const desktopContext=await browser.newContext({
      viewport:{width:1366,height:900},locale:'el-GR',
      timezoneId:'Europe/Athens',serviceWorkers:'allow'
    });
    const desktopPage=await desktopContext.newPage();
    await desktopPage.goto(base+'/applications/',{waitUntil:'domcontentloaded',timeout:45000});
    assert.equal(await desktopPage.locator('nav.tabs button.tab').count(),5);
    for(const [key] of apps){
      await desktopPage.locator('#tab-'+key).click();
      const frame=desktopPage.locator('#frame-'+key);
      await frame.waitFor({state:'visible',timeout:35000});
      await desktopPage.frameLocator('#frame-'+key).locator('body')
        .waitFor({state:'visible',timeout:35000});
      assert.equal(await desktopPage.locator('iframe.app-frame.active').count(),1,
        'One desktop app visible: '+key);
      assert.equal(await desktopPage.locator('#tab-'+key).getAttribute('aria-selected'),
        'true','Desktop tab state: '+key);
    }
    assert.equal(await desktopPage.evaluate(()=>
      document.documentElement.scrollWidth<=document.documentElement.clientWidth+1
    ),true,'Applications desktop launcher has no horizontal overflow');
    console.log('PASS Five Applications tabs open in desktop Chromium without launcher overflow');
    await desktopContext.close();

    // An isolated, blank phone browser with synthetic GPS; this never sees or
    // changes a person's location. Real GPS hardware cannot be tested remotely.
    const parkingContext=await browser.newContext(settings);
    const parkingPage=await parkingContext.newPage();
    await parkingPage.addInitScript(()=>{
      window.__mockGps={lat:39.65,lon:20.85};
      Object.defineProperty(navigator,'geolocation',{configurable:true,value:{
        watchPosition(success){
          success({coords:{latitude:window.__mockGps.lat,longitude:window.__mockGps.lon,accuracy:12}});
          return 1;
        },clearWatch(){}
      }});
      window.__mapsOpened=[];
      window.open=(url)=>{window.__mapsOpened.push(url);return null;};
    });
    await parkingPage.route(/(?:photon\.komoot\.io|nominatim\.openstreetmap\.org)/,route=>route.abort());
    await parkingPage.goto(base+'/Parking/',{waitUntil:'domcontentloaded',timeout:45000});
    for(let n=1;n<=6;n++){
      await parkingPage.evaluate(i=>window.__mockGps={lat:39.65+i*.001,lon:20.85+i*.001},n);
      await parkingPage.locator('#save').click();
      await parkingPage.waitForFunction(expected=>document.querySelector('#history-count')?.textContent===expected,
        Math.min(n,5)+'/5',{timeout:10000});
      assert.equal(await parkingPage.locator('#save').isDisabled(),false);
    }
    assert.equal(await parkingPage.locator('#history-list .parking-history-item').count(),5);
    await parkingPage.locator('#history-toggle').click();
    await parkingPage.locator('#history-list .parking-history-item:last-child button').first().click();
    const captured=await parkingPage.evaluate(()=>window.__mapsOpened.at(-1));
    assert.ok(captured.includes('mlat=39.652'),'Older stored parking location opens, not current one');
    console.log('PASS Mobile browser: 6 synthetic saves, last-five history, open historic map');

    // Offline reload with service worker: history persists without Internet.
    await parkingPage.evaluate(()=>navigator.serviceWorker.ready);
    await parkingContext.setOffline(true);
    await parkingPage.reload({waitUntil:'domcontentloaded',timeout:20000});
    assert.equal(await parkingPage.locator('#history-count').textContent(),'5/5');
    assert.equal(await parkingPage.locator('#history-list .parking-history-item').count(),5);
    console.log('PASS Mobile browser: parking history survives an offline reload');
    await parkingContext.close();
  }finally{await browser.close();}
})().catch(e=>{console.error('FAIL mobile smoke:',e.message);process.exitCode=1;});
