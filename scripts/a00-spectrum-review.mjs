import {chromium} from '@playwright/test';
import {writeFile,mkdir} from 'node:fs/promises';
import assert from 'node:assert/strict';
const dir='/tmp/a00-spectrum-review';await mkdir(dir,{recursive:true});
const browser=await chromium.launch({headless:false});
const page=await browser.newPage({viewport:{width:1440,height:900}});
const errors=[];page.on('pageerror',e=>errors.push(String(e)));
await page.goto('http://127.0.0.1:5173/?mode=video&scene=03&end=07');
const result=[];
for(const [headline,file,palette] of [['Haslam — 408 MHz · Radio','radio','grayscale'],['Planck HFI — 100 GHz','planck','planck'],['Herschel SPIRE 250 µm — Far infrared','herschel','native']]){
 await page.waitForFunction(h=>document.querySelector('#headline')?.textContent===h,headline,{timeout:90000});
 await page.waitForTimeout(2000);
 const state=await page.evaluate(()=>{const v=window.astroViewerDemo.viewer,h=v.getActiveHiPS();return {url:h.baseURL,format:h.format,colorMap:h.colorMap.name,range:h.getFITSDisplayRange(undefined),command:document.querySelector('#api-command').textContent};});
 assert.equal(state.colorMap,palette);assert(!state.command.includes('ensureLayer'));assert(state.command.includes(`changeColorMap("${palette}")`));
 if(file==='radio'){assert.equal(state.format,'fits');assert(state.range);}
 await page.screenshot({path:`${dir}/${file}.png`});result.push({file,...state});console.log(file,JSON.stringify(state));
}
await page.waitForFunction(()=>document.querySelector('#headline')?.textContent==='Return to M42',undefined,{timeout:180000});
await page.waitForTimeout(7000);
const snapshot=()=>page.evaluate(()=>{const v=window.astroViewerDemo.viewer;return {center:v.getCenterCoordinates().astroDeg,fov:v.getFoV().minFoV};});
const before=await snapshot();
await page.waitForFunction(()=>document.querySelector('#headline')?.textContent==='M42 — optical sky',undefined,{timeout:15000});
const after=await snapshot();
assert(Math.abs(before.center.ra-after.center.ra)<.01);assert(Math.abs(before.center.dec-after.center.dec)<.01);assert(Math.abs(before.fov-after.fov)<.01);assert(Math.abs(after.fov-2.5)<.02);
await page.screenshot({path:`${dir}/continuous-compositing.png`});
const audit=await page.evaluate(()=>window.astroViewerDemo.audit);
assert.deepEqual(errors,[]);await writeFile(`${dir}/results.json`,JSON.stringify({result,before,after,audit,errors},null,2));
console.log('03→04 continuous',JSON.stringify({before,after,audit,errors}));await browser.close();
