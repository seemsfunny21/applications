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
      // Image elements can appear before a remote PWA's stylesheets finish
      // loading. Measure only once its mobile responsive rules have applied.
      const styled=await hero.evaluate(el=>new Promise(resolve=>{
        const start=Date.now();
        const check=()=>{
          const b=el.getBoundingClientRect();
          if(b.width>260&&b.width<=innerWidth+2&&b.height>=72&&b.height<=120){
            resolve(true);return;
          }
          if(Date.now()-start>=15000){resolve(false);return;}
          setTimeout(check,150);
        };
        check();
      }));
      if(!styled){
        console.log('STYLE LOAD DIAGNOSTIC '+key+' '+JSON.stringify(
          await hero.evaluate(el=>({ready:document.readyState,
            width:innerWidth,rect:el.getBoundingClientRect().toJSON(),
            styles:[...document.querySelectorAll('link[rel=stylesheet]')].map(l=>
              ({url:l.href,loaded:Boolean(l.sheet)}))}))
        ));
      }
      await hero.evaluate(el=>el.decode?.().catch(()=>{}));
      const box=await hero.boundingBox();
      if(!box||box.width<=260||box.height<72||box.height>120){
        console.log('BANNER GEOMETRY DIAG '+key+' '+JSON.stringify({
          box,viewport:await page.evaluate(()=>({w:innerWidth,h:innerHeight})),
          frame:await page.locator('#frame-'+key).boundingBox()
        }));
      }
      assert.ok(box&&box.width>260&&box.height>=72&&box.height<=120,
        'Visible aligned banner: '+key+': '+JSON.stringify(box));
      let loaded=await hero.evaluate(el=>el.complete&&el.naturalWidth>0);
      if(!loaded){
        // GitHub Pages sometimes serves a partially available image while
        // a new deployment propagates. Diagnose and retry before failing.
        const imageDetails=await hero.evaluate(async el=>{
          const src=el.currentSrc||el.src;
          try{
            const r=await fetch(src,{cache:'reload'});
            return {src,status:r.status,type:r.headers.get('content-type'),
              length:Number(r.headers.get('content-length')||0),complete:el.complete,
              naturalWidth:el.naturalWidth};
          }catch(e){return {src,error:String(e),complete:el.complete,naturalWidth:el.naturalWidth}}
        });
        console.log('IMAGE LOAD DIAGNOSTIC '+key+' '+JSON.stringify(imageDetails));
        loaded=await hero.evaluate(el=>new Promise(resolve=>{
          const src=el.currentSrc||el.src;
          const retry=new Image();
          const timer=setTimeout(()=>resolve(false),8000);
          retry.onload=()=>{clearTimeout(timer);resolve(retry.naturalWidth>0)};
          retry.onerror=()=>{clearTimeout(timer);resolve(false)};
          retry.src=src+'?desktop-test-retry='+Date.now();
        }));
      }
      assert.equal(loaded,true,'Hero loaded: '+key);
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
      await page.waitForFunction(()=>document.querySelector('#frame-sudokufunny')?.contentWindow?.document.querySelector('#pauseOverlay')?.hidden===true);
      await page.locator('#tab-games').click();
      await page.waitForFunction(()=>document.querySelector('#frame-sudokufunny')?.contentWindow?.document.querySelector('#pauseOverlay')?.hidden===false);
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
      await page.waitForFunction(()=>document.querySelector('#frame-reversifunny')?.contentWindow?.document.querySelector('#pauseOverlay')?.hidden===false);
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
    // Both games must be able to enter native browser fullscreen from their
    // embedded iframe, not just when opened directly at their own GitHub URL.
    for(const key of ['sudokufunny','reversifunny']){
      if(!live.some(item=>item[0]===key))continue;
      await openApp(deskPage,key);
      const frame=deskPage.frameLocator('#frame-'+key);
      const toggle=frame.locator('#fullscreenButton');
      await toggle.waitFor({state:'visible',timeout:20000});
      const boardBefore=await frame.locator('.board-wrap').boundingBox();
      await toggle.click();
      await deskPage.waitForFunction(()=>Boolean(document.fullscreenElement),null,{timeout:8000});
      const expanded=await frame.locator('.board-wrap').boundingBox();
      const pressed=await toggle.getAttribute('aria-pressed');
      assert.equal(pressed,'true','Native fullscreen is active in '+key);
      assert.ok(expanded&&boardBefore&&expanded.width>boardBefore.width+10,
        'Embedded '+key+' board expands on fullscreen: '+JSON.stringify({before:boardBefore.width,after:expanded?.width}));
      await toggle.click();
      await deskPage.waitForFunction(()=>!document.fullscreenElement,null,{timeout:8000});
      assert.equal(await toggle.getAttribute('aria-pressed'),'false');
      console.log('PASS Embedded '+key+' enters and exits true fullscreen');
    }
    assert.equal(await deskPage.evaluate(()=>
      document.documentElement.scrollWidth<=document.documentElement.clientWidth+1),
      true,'No desktop overflow');
    console.log('PASS Games hub and all published apps in desktop Chromium');

    // Confirm the familiar centered proportions remain in the desktop browser.
    await deskPage.setViewportSize({width:1920,height:1080});
    const classic={};
    for(const [key,selector] of [
      ['voltes','.shell'],['douleia','.wrap'],['reminder','.screen-split'],
      ['seemsfunny','.exercise-list'],['Parking','.app']
    ]){
      await openApp(deskPage,key);
      const frame=deskPage.frameLocator('#frame-'+key);
      const el=frame.locator(selector);
      await el.waitFor({state:'visible',timeout:30000});
      classic[key]=await el.boundingBox();
    }
    assert.ok(classic.voltes?.width<=1000,'Cycling reverts to its centered 960px layout');
    assert.ok(classic.douleia?.width<=1100,'Work routes revert to centered 1030px layout');
    assert.ok(classic.Parking?.width<=450,'Parking reverts to original 430px layout');
    assert.ok(classic.seemsfunny?.width>=280&&classic.seemsfunny.width<=320,
      'Pegasus restores its previous exercise list width');
    await openApp(deskPage,'reminder');
    const reminder=deskPage.frameLocator('#frame-reminder');
    const wizard=await reminder.locator('.wizard-half').boundingBox();
    const list=await reminder.locator('.list-half').boundingBox();
    assert.ok(wizard&&list&&list.y>=wizard.y+wizard.height-6,
      'Reminders reverts to the previous vertical split');
    // The Reminder navigation must behave like the mobile bottom bar,
    // not like the old left desktop sidebar, at laptop and TV widths.
    for(const [width,height] of [[1366,768],[1920,1080]]){
      await deskPage.setViewportSize({width,height});
      await openApp(deskPage,'reminder');
      const remind=deskPage.frameLocator('#frame-reminder');
      const sidebar=await remind.locator('.sidebar').boundingBox();
      const content=await remind.locator('.content-area').boundingBox();
      const nav=await remind.locator('.main-nav').boundingBox();
      const layout=await remind.locator('.main-nav').evaluate(el=>getComputedStyle(el).gridTemplateColumns);
      assert.ok(sidebar&&sidebar.y>=height-90&&sidebar.width<=720&&sidebar.width>=650,
        'Reminder navigation moves to bottom at '+width+': '+JSON.stringify(sidebar));
      assert.ok(content&&content.width<=720&&content.x>=(width-720)/2-2,
        'Reminder content stays centered: '+JSON.stringify(content));
      assert.ok(nav&&nav.y>=sidebar.y&&layout.trim().split(/\s+/).length===4,
        'Reminder bottom navigation has four balanced tabs at '+width);
      const firstNav=remind.locator('.main-nav [data-filter="today"]');
      await firstNav.click();
      assert.ok((await firstNav.getAttribute('class')).includes('active'),
        'Reminder bottom navigation stays usable at '+width);
      console.log('PASS Reminder bottom navigation '+width+'x'+height);
    }
    console.log('PASS Classic app layouts at 1920x1080',JSON.stringify(classic));
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
