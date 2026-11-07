import {chromium} from '@playwright/test';
import {mkdir,writeFile} from 'node:fs/promises';
const scene=process.argv[2]??'01';
const end=process.argv[3];
const dir=`/tmp/a00-playback-${scene}${end?"-review":""}`;await mkdir(dir,{recursive:true});
const browser=await chromium.launch({headless:false});
const page=await browser.newPage({viewport:{width:1440,height:900}});
const errors=[];page.on('pageerror',e=>errors.push(String(e)));page.on('console',m=>{if(m.type()==='error')console.log('BROWSER',m.text().slice(0,350));});
await page.goto(`http://127.0.0.1:5173/?mode=video&scene=${scene}${end?`&end=${end}`:""}`);
let last='';let n=0;let completed=false;const frames=[];const started=Date.now();
for(let i=0;i<900;i++){
 await page.waitForTimeout(1000);
 const state=await page.evaluate(()=>({caption:document.querySelector('#scene')?.textContent+' '+document.querySelector('#headline')?.textContent,status:document.querySelector('#status')?.textContent,audit:window.astroViewerDemo?.audit}));
 if(state.caption!==last){last=state.caption;console.log(last);frames.push({caption:last,seconds:(Date.now()-started)/1000,file:`${String(n+1).padStart(3,"0")}.png`});await page.waitForTimeout(1600);await page.screenshot({path:`${dir}/${String(++n).padStart(3,'0')}.png`});}
 if(state.status==='A00 complete'||state.status.startsWith('A00 review complete')||state.status==='A00 failed'){console.log(JSON.stringify(state));completed=state.status==='A00 complete'||state.status.startsWith('A00 review complete');break;}
}
await writeFile(`${dir}/frames.json`,JSON.stringify(frames,null,2));
await writeFile(`${dir}/errors.json`,JSON.stringify(errors,null,2));console.log('errors',errors);await browser.close();

if(!completed||errors.length)process.exitCode=1;
