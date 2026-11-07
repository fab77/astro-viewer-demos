import { chromium } from '@playwright/test';
import { mkdir, writeFile } from 'node:fs/promises';
const dir=process.env.A00_SURVEY_DIR??'/tmp/a00-surveys'; await mkdir(dir,{recursive:true});
const browser=await chromium.launch({headless:false});
const page=await browser.newPage({viewport:{width:1440,height:900}});
await page.goto('http://127.0.0.1:5173/');
await page.waitForFunction(()=>window.astroViewerDemo?.ready,undefined,{timeout:60000});
const cases=[
 ['states-galex-m101','https://stpubdata.s3.us-east-1.amazonaws.com/mast/skybackgrounds/GALEXColor/',210.8023,54.3489,.5],
 ['states-galex-m51','https://stpubdata.s3.us-east-1.amazonaws.com/mast/skybackgrounds/GALEXColor/',202.469575,47.195258,.5],
 ['states-sdss-m45','https://skies.esac.esa.int/SDSS9Color/',56.75,24.1167,5],
 ['states-hst-m41','https://skies.esac.esa.int/HST/ACS/',101.49917,-20.71611,1],
 ['states-2mass-m41','https://skies.esac.esa.int/2MASSColor/',101.49917,-20.71611,1],
 ['states-hst-m101','https://skies.esac.esa.int/HST/ACS/',210.8023,54.3489,.5],
 ['review-radio','https://skies.esac.esa.int/Haslam/Haslam408_dsds_Remazeilles2014_mod_HiPS/',83.8221,-5.3911,60],
 ['review-planck','https://skies.esac.esa.int/pla/HFI_SkyMap_100_2048_R3_00_full_HiPS/',83.8221,-5.3911,20],
 ['review-nuv','https://alasky.cds.unistra.fr/GALEX/GALEXGR6_7_NUV/',202.469575,47.195258,.5],
 ['review-fuv','https://alasky.cds.unistra.fr/GALEX/GALEXGR6_7_FUV/',202.469575,47.195258,.5],
 ['review-xray','https://cdaftp.cfa.harvard.edu/cxc-hips/',202.469575,47.195258,.5],
 ['review-gamma','https://skies.esac.esa.int/FermiColor/',83.8221,-5.3911,60],
 ['herschel-m45','https://skies.esac.esa.int/Herschel/SPIRE250/',56.75,24.1167,5],
 ['galex-m45','https://stpubdata.s3.us-east-1.amazonaws.com/mast/skybackgrounds/GALEXColor/',56.75,24.1167,5],
 ['chandra-m45','https://cdaftp.cfa.harvard.edu/cxc-hips/',56.75,24.1167,5],
 ['dss-m45','https://cdn.skies.esac.esa.int/DSSColor/',56.75,24.1167,5],
 ['sdss-m42','https://skies.esac.esa.int/SDSS9Color/',83.8221,-5.3911,2.5],
 ['herschel-m42','https://skies.esac.esa.int/Herschel/SPIRE250/',83.8221,-5.3911,2.5],
 ['galex-m42','https://stpubdata.s3.us-east-1.amazonaws.com/mast/skybackgrounds/GALEXColor/',83.8221,-5.3911,2.5],
 ['chandra-m42','https://cdaftp.cfa.harvard.edu/cxc-hips/',83.8221,-5.3911,2.5],
 ['2mass-m42','https://skies.esac.esa.int/2MASSColor/',83.8221,-5.3911,2.5],
 ['wise-m42','https://skies.esac.esa.int/AllWISEColor/',83.8221,-5.3911,2.5],
 ['sdss-m51','https://skies.esac.esa.int/SDSS9Color/',202.469575,47.195258,.5],
 ['planck-m42','https://skies.esac.esa.int/pla/HFI_SkyMap_100_2048_R3_00_full_HiPS/',83.8221,-5.3911,2.5],
 ['fermi-m42','https://skies.esac.esa.int/FermiColor/',83.8221,-5.3911,2.5],
 ['haslam-m42','https://skies.esac.esa.int/Haslam/Haslam408_dsds_Remazeilles2014_mod_HiPS/',83.8221,-5.3911,2.5],
];
const results=[];
for(const [name,url,ra,dec,fov] of cases.filter(c=>!process.argv[2]||c[0].includes(process.argv[2]))){
 try {
 await page.evaluate(async({url,ra,dec,fov,processRadio})=>{const v=window.astroViewerDemo.viewer;v.goTo(ra,dec);v.setFoV(fov);const h=v.getActiveHiPSLayers().find(h=>h.baseURL.replace(/\/+$/,'')===url.replace(/\/+$/,''))??await v.addHiPSFromUrl(url);for(const l of v.getActiveHiPSLayers())v.setHiPSOpacity(l,l===h?1:0);v.setActiveHiPS(h);v.changeColorMap(url.includes("HFI_SkyMap")?"planck":"native");if(url.includes("Haslam") && processRadio){v.changeHiPSFormat("fits");v.changeColorMap("grayscale");v.setHiPSFITSRangeMode("robust");v.setHiPSFITSScaleFunction("sqrt");}},{url,ra,dec,fov,processRadio:process.env.A00_RADIO_FITS==="1"});
 await page.waitForTimeout(12000);
 const result=await page.evaluate(()=>{const h=window.astroViewerDemo.viewer.getActiveHiPS();return {stats:h.getDebugStats(),properties:Object.fromEntries(h.properties)}});
 await page.screenshot({path:`${dir}/${name}.png`});results.push({name,...result}); console.log(name,JSON.stringify(result.stats));
 }catch(e){results.push({name,error:String(e)});console.log(name,String(e));}
}
await writeFile(`${dir}/results${process.argv[2]?"-"+process.argv[2]:""}.json`,JSON.stringify(results,null,2));await browser.close();
