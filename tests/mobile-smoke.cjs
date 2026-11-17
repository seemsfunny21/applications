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
    await context.close();

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
    await parkingPage.locator('#history-panel summary').click();
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
