'use strict';
/* Fresh Chromium profiles and synthetic GPS only; never inspect personal data. */
const assert=require('node:assert/strict');
const fs=require('node:fs');
const {chromium}=require('playwright');

(async()=>{
  const binary=['/usr/bin/google-chrome','/usr/bin/google-chrome-stable','/usr/bin/chromium']
    .find(x=>fs.existsSync(x));
  if(!binary)throw Error('Chromium/Chrome unavailable');
  const browser=await chromium.launch({headless:true,executablePath:binary,args:['--no-sandbox']});
  const settings={viewport:{width:393,height:844},deviceScaleFactor:2,isMobile:true,
    hasTouch:true,locale:'el-GR',timezoneId:'Europe/Athens',serviceWorkers:'allow'};
  const base='https://seemsfunny21.github.io';
  const gameKeys=new Set(['sudokufunny','reversifunny']);
  async function openApp(page,key){
    if(gameKeys.has(key)){
      await page.locator('#tab-games').click();
      await page.locator('#gamesHub [data-game="'+key+'"]').click();
    }else{
      await page.locator('#tab-'+key).click();
    }
  }
  try{
    const context=await browser.newContext(settings);
    const page=await context.newPage();
    await page.goto(base+'/applications/',{waitUntil:'domcontentloaded',timeout:45000});
    assert.equal(await page.locator('nav.tabs button.tab').count(),6);
    await page.locator('#tab-games').click();
    assert.equal(await page.locator('#tab-games').getAttribute('aria-selected'),'true');
    assert.equal(await page.locator('#gamesHub').isVisible(),true);
    assert.equal(await page.locator('#gamesHub button[data-game]').count(),2);
    assert.equal(await page.locator('#gamesHub [data-game="sudokufunny"]').isVisible(),true);
    assert.equal(await page.locator('#gamesHub [data-game="reversifunny"]').isVisible(),true);

    const apps=[
      ['voltes','.hero-scene'],
      ['douleia','.routes-hero-art'],
      ['reminder','.reminder-hero-art'],
      ['seemsfunny','.pegasus-hero-art'],
      ['Parking','.parking-hero-art'],
      ['sudokufunny','.sudoku-hero-art'],
      ['reversifunny','.reversi-hero-art']
    ];
    const live=[];
    for(const [key,selector] of apps){
      if(gameKeys.has(key)){
        const ok=await page.request.get(base+'/'+key+'/index.html',{timeout:15000})
          .then(r=>r.ok()).catch(()=>false);
        if(!ok){
          console.log('PENDING '+key+' first-time GitHub Pages activation');
          continue;
        }
      }
      live.push([key,selector]);
    }
    const heights=[];
    for(const [key,selector] of live){
      await openApp(page,key);
      const hero=page.frameLocator('#frame-'+key).locator(selector);
      await hero.waitFor({state:'visible',timeout:40000});
      await hero.evaluate(el=>el.decode?.().catch(()=>{}));
      const box=await hero.boundingBox();
      assert.ok(box&&box.width>260&&box.height>=72&&box.height<=120,
        'Visible aligned banner: '+key);
      assert.equal(await hero.evaluate(el=>el.complete&&el.naturalWidth>0),true,'Hero loaded: '+key);
      heights.push({key,height:Math.round(box.height*10)/10});
      const tab=gameKeys.has(key)?'games':key;
      assert.equal(await page.locator('#tab-'+tab).getAttribute('aria-selected'),'true');
    }
    assert.ok(Math.max(...heights.map(x=>x.height))-Math.min(...heights.map(x=>x.height))<=3,
      'Unified banner heights: '+JSON.stringify(heights));
    console.log('PASS Six Applications tabs, Games hub and available aligned banners',heights);

    for(const width of [393,360]){
      await page.setViewportSize({width,height:844});
      const geometry=[];
      for(const [key,selector] of live){
        await openApp(page,key);
        const hero=page.frameLocator('#frame-'+key).locator(selector);
        await hero.waitFor({state:'visible',timeout:30000});
        if(key==='seemsfunny')await hero.evaluate(async el=>{
          const view=el.closest('.view');
          if(view)await Promise.all(view.getAnimations().map(x=>x.finished.catch(()=>{})));
        });
        const b=await hero.boundingBox();
        assert.ok(b,'Banner '+key+' at '+width);
        geometry.push({key,x:+b.x.toFixed(1),y:+b.y.toFixed(1),
          width:+b.width.toFixed(1),height:+b.height.toFixed(1)});
      }
      for(const field of ['height','width','x','y']){
        const span=Math.max(...geometry.map(x=>x[field]))-Math.min(...geometry.map(x=>x[field]));
        assert.ok(span<=(field==='width'?12:field==='x'?7:field==='y'?12:3),
          'Inconsistent banner '+field+' at '+width+': '+JSON.stringify(geometry));
      }
      const fits=await page.locator('nav.tabs').evaluate(el=>
        el.scrollWidth<=el.clientWidth+1&&
        Array.from(el.querySelectorAll('.tab')).every(b=>b.scrollWidth<=b.clientWidth+1));
      assert.equal(fits,true,'All six top tabs fit at '+width);
      console.log('PASS Games and other app header geometry at '+width,JSON.stringify(geometry));
    }

    if(live.some(x=>x[0]==='sudokufunny')){
      await openApp(page,'sudokufunny');
      const sudoku=page.frameLocator('#frame-sudokufunny');
      await sudoku.locator('#resumeButton').waitFor({state:'visible',timeout:25000});
      await sudoku.locator('#resumeButton').click();
      await page.waitForFunction(()=>document.querySelector('#frame-sudokufunny')?
        .contentWindow?.document.querySelector('#pauseOverlay')?.hidden===true);
      await page.locator('#tab-games').click();
      await page.waitForFunction(()=>document.querySelector('#frame-sudokufunny')?
        .contentWindow?.document.querySelector('#pauseOverlay')?.hidden===false);
      await page.locator('#gamesHub [data-game="sudokufunny"]').click();
      assert.equal(await sudoku.locator('#pauseOverlay').isVisible(),true);
      console.log('PASS Sudoku pauses when Games hub reopens');
    }
    if(live.some(x=>x[0]==='reversifunny')){
      await openApp(page,'reversifunny');
      const reversi=page.frameLocator('#frame-reversifunny');
      await reversi.locator('#resumeButton').waitFor({state:'visible',timeout:25000});
      await reversi.locator('#resumeButton').click();
      await page.locator('#tab-voltes').click();
      await page.waitForFunction(()=>document.querySelector('#frame-reversifunny')?
        .contentWindow?.document.querySelector('#pauseOverlay')?.hidden===false);
      await openApp(page,'reversifunny');
      assert.equal(await reversi.locator('#pauseOverlay').isVisible(),true);
      console.log('PASS Reversi pauses across Applications navigation');
    }
    await context.close();

    const desktop=await browser.newContext({viewport:{width:1366,height:900},
      locale:'el-GR',timezoneId:'Europe/Athens',serviceWorkers:'allow'});
    const deskPage=await desktop.newPage();
    await deskPage.goto(base+'/applications/',{waitUntil:'domcontentloaded',timeout:45000});
    assert.equal(await deskPage.locator('nav.tabs button.tab').count(),6);
    await deskPage.locator('#tab-games').click();
    assert.equal(await deskPage.locator('#gamesHub button[data-game]').count(),2);
    for(const [key] of live){
      await openApp(deskPage,key);
      await deskPage.locator('#frame-'+key).waitFor({state:'visible',timeout:35000});
      await deskPage.frameLocator('#frame-'+key).locator('body')
        .waitFor({state:'visible',timeout:35000});
      assert.equal(await deskPage.locator('iframe.app-frame.active').count(),1,
        'One visible frame: '+key);
    }
    assert.equal(await deskPage.evaluate(()=>
      document.documentElement.scrollWidth<=document.documentElement.clientWidth+1),
      true,'No desktop overflow');
    console.log('PASS Games hub and all published apps in desktop Chromium');
    await desktop.close();

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
