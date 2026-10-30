/* Minimal headless-Chrome helper over the DevTools protocol, shared by the asset, layout and bundle tools. */
import {spawn} from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
export const CHROME='/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
export const sleep=ms=>new Promise(r=>setTimeout(r,ms));
/* Start headless Chrome on a debugging port; kill() stops it and removes its temp profile. */
export async function startChrome(port=9341,extra=[]){
  const dir=fs.mkdtempSync(path.join(os.tmpdir(),'cdp-'));
  const c=spawn(CHROME,['--headless=new','--disable-gpu','--remote-debugging-port='+port,'--user-data-dir='+dir,...extra,'about:blank'],{stdio:'ignore'});
  let up=false;
  for(let i=0;i<75&&!up;i++){try{await (await fetch(`http://127.0.0.1:${port}/json/version`)).json();up=true}catch(e){await sleep(200)}}
  const kill=()=>{c.kill();try{fs.rmSync(dir,{recursive:true,force:true})}catch(e){}};
  if(!up){kill();throw new Error('Chrome did not start on port '+port)}
  return {port,kill};
}
/* Open a tab. transparent:true makes screenshots keep the alpha channel. errs collects page exceptions. */
export async function openPage(port,{w=390,h=844,mobile=false,url='about:blank',transparent=false}={}){
  const t=await (await fetch(`http://127.0.0.1:${port}/json/new?about:blank`,{method:'PUT'})).json();
  const ws=new WebSocket(t.webSocketDebuggerUrl);
  await new Promise((res,rej)=>{ws.onopen=res;ws.onerror=rej});
  let id=0;const pend={},errs=[];
  ws.onmessage=e=>{
    const m=JSON.parse(e.data);
    if(m.id&&pend[m.id]){pend[m.id](m);delete pend[m.id]}
    if(m.method==='Runtime.exceptionThrown')errs.push((m.params.exceptionDetails.exception?.description||m.params.exceptionDetails.text||'').slice(0,200));
  };
  const send=(method,params={})=>new Promise((res,rej)=>{const i=++id;pend[i]=m=>m.error?rej(new Error(method+': '+m.error.message)):res(m.result);ws.send(JSON.stringify({id:i,method,params}))});
  const ev=async expr=>{
    const r=await send('Runtime.evaluate',{expression:expr,awaitPromise:true,returnByValue:true});
    if(r.exceptionDetails){errs.push('eval: '+(r.exceptionDetails.exception?.description||r.exceptionDetails.text||'').slice(0,200));return undefined}
    return r.result?.value;
  };
  await send('Runtime.enable');await send('Page.enable');
  const land=w>h;
  await send('Emulation.setDeviceMetricsOverride',{width:w,height:h,deviceScaleFactor:mobile?2.75:1,mobile,screenOrientation:{type:land?'landscapePrimary':'portraitPrimary',angle:land?90:0}});
  if(mobile)await send('Emulation.setTouchEmulationEnabled',{enabled:true,maxTouchPoints:5});
  if(transparent)await send('Emulation.setDefaultBackgroundColorOverride',{color:{r:0,g:0,b:0,a:0}});
  if(url&&url!=='about:blank'){
    await send('Page.navigate',{url});
    for(let i=0;i<150&&(await ev('document.readyState'))!=='complete';i++)await sleep(100);
  }
  /* Screenshot to a file; the format follows the extension (png/webp/jpg). opts: {clip, quality, fullPage}. */
  const shot=async(file,opts={})=>{
    const ext=path.extname(file).slice(1).toLowerCase(),format=ext==='jpg'?'jpeg':ext||'png';
    const p={format,captureBeyondViewport:!!opts.clip||!!opts.fullPage};
    if(format!=='png')p.quality=opts.quality||82;
    if(opts.clip)p.clip={scale:1,...opts.clip};
    const img=await send('Page.captureScreenshot',p);
    fs.writeFileSync(file,Buffer.from(img.data,'base64'));
  };
  return {send,ev,shot,errs,close:()=>{try{ws.close()}catch(e){}}};
}
