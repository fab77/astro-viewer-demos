import {chromium} from '@playwright/test';
const b=await chromium.launch({headless:false});const p=await b.newPage({viewport:{width:1440,height:900}});
p.on('console',m=>{if(['error','warning'].includes(m.type()))console.log(m.type(),m.text().slice(0,450));});
p.on('requestfailed',r=>console.log('FAILED',r.url(),r.failure()));
p.on('response',r=>{if(r.url().endsWith('.fits'))console.log('FITS',r.status(),r.url());});
await p.goto('http://127.0.0.1:5173/?mode=video&scene=09');await p.waitForFunction(()=>document.querySelector('#headline')?.textContent==='FITS — linear grayscale',undefined,{timeout:60000});
for(let i=0;i<4;i++){await p.waitForTimeout(5000);console.log(await p.evaluate(()=>{const h=window.astroViewerDemo.viewer.getActiveHiPS();return {layers:window.astroViewerDemo.viewer.getActiveHiPSLayers().map(l=>({url:l.baseURL,opacity:l.opacity,format:l.format})),format:h.format,range:h.getFITSDisplayRange(undefined),stats:h.getDebugStats()}}));await p.screenshot({path:`/tmp/a00-fits-${i}.png`});}
await b.close();
