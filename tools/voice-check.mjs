/* Voice-message button check in headless Chrome: mouse click-to-talk with 发送 / 取消, the 15 s progress bar
   and timeout auto-cancel, and hold-to-talk on touch. The microphone and MediaRecorder are faked in the page.
     node tools/voice-check.mjs        exits 1 on any failure */
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import {startChrome,openPage,sleep} from './cdp.mjs';

const ROOT=path.resolve(path.dirname(new URL(import.meta.url).pathname),'..');
const TYPES={'.html':'text/html','.js':'text/javascript','.css':'text/css','.webp':'image/webp','.png':'image/png','.mp3':'audio/mpeg','.json':'application/json','.svg':'image/svg+xml'};
const srv=http.createServer((req,res)=>{
  const f=path.join(ROOT,decodeURIComponent(req.url.split('?')[0]).replace(/^\/+/,'')||'index.html');
  if(!f.startsWith(ROOT)||!fs.existsSync(f)||fs.statSync(f).isDirectory()){res.writeHead(404);res.end();return}
  res.writeHead(200,{'Content-Type':TYPES[path.extname(f)]||'application/octet-stream'});fs.createReadStream(f).pipe(res);
});
const PORT=8768;await new Promise(r=>srv.listen(PORT,'127.0.0.1',r));

const FAKE=`(()=>{
  window.__sent=[];sendVoice=(d,dur)=>__sent.push(dur);
  navigator.mediaDevices.getUserMedia=async()=>({getTracks:()=>[{stop(){}}]});
  class FakeRec{constructor(){this.state='inactive';this.mimeType='audio/webm'}
    static isTypeSupported(t){return t.startsWith('audio/webm')}
    start(){this.state='recording';this.iv=setInterval(()=>this.ondataavailable&&this.ondataavailable({data:new Blob(['x'])}),250)}
    stop(){clearInterval(this.iv);this.state='inactive';setTimeout(()=>this.onstop&&this.onstop(),0)}}
  window.MediaRecorder=FakeRec;return true})()`;

const C=await startChrome(9381);let pass=0,fail=0;const out=[];
const ok=(c,msg)=>{c?pass++:(fail++,out.push('FAIL '+msg))};
try{
  /* desktop: mouse */
  {
    const p=await openPage(C.port,{w:1280,h:800,url:`http://127.0.0.1:${PORT}/index.html`});
    await p.ev(`localStorage.setItem('dushen-terms-v1','1');document.querySelectorAll('.consent-bg').forEach(e=>e.remove());true`);
    await p.ev(`document.querySelector('[data-game="holdem"]').click();document.getElementById('start-btn').click();true`);await sleep(600);
    await p.ev(FAKE);
    await p.ev(`document.getElementById('chat-bubble').click();true`);await sleep(300);
    const at=async sel=>p.ev(`(()=>{const r=document.querySelector('${sel}').getBoundingClientRect();return [r.left+r.width/2,r.top+r.height/2]})()`);
    const click=async sel=>{const [x,y]=await at(sel);for(const type of ['mousePressed','mouseReleased'])await p.send('Input.dispatchMouseEvent',{type,x,y,button:'left',clickCount:1});};
    ok((await p.ev(`document.getElementById('ptt').textContent`))==='点击说话','desktop idle label 点击说话');
    await click('#ptt');await sleep(1200);
    ok(/^发送 \d/.test(await p.ev(`document.getElementById('ptt').textContent`)),'recording label 发送 N″');
    ok(await p.ev(`!!document.getElementById('ptt-x')`),'取消 shown above the button');
    const bar=await p.ev(`parseFloat(document.querySelector('#ptt .ptt-bar').style.width)`);
    ok(bar>3&&bar<15,'progress bar ≈ elapsed/15 ('+bar+'%)');
    const xr=await p.ev(`(()=>{const a=document.getElementById('ptt-x').getBoundingClientRect(),b=document.getElementById('ptt').getBoundingClientRect();return a.bottom<=b.top+1})()`);
    ok(xr,'取消 sits above the button');
    await click('#ptt');await sleep(300);
    ok((await p.ev(`__sent.length`))===1,'clicking 发送 sends');
    ok((await p.ev(`document.getElementById('ptt').textContent`))==='点击说话'&&!(await p.ev(`!!document.getElementById('ptt-x')`)),'back to idle after send');
    await click('#ptt');await sleep(900);await click('#ptt-x');await sleep(300);
    ok((await p.ev(`__sent.length`))===1&&/已取消/.test(await p.ev(`(document.getElementById('toast')||{}).textContent||''`)),'取消 drops the clip');
    await click('#ptt');await sleep(900);await p.send('Input.dispatchKeyEvent',{type:'keyDown',key:'Escape',code:'Escape'});await sleep(300);
    ok((await p.ev(`__sent.length`))===1&&!(await p.ev(`!!REC.rec`)),'Escape cancels');
    await click('#ptt');await sleep(15600);
    ok((await p.ev(`__sent.length`))===1,'15 s timeout does not send');
    ok(/15 秒，已自动取消/.test(await p.ev(`(document.getElementById('toast')||{}).textContent||''`)),'timeout toast');
    ok((await p.ev(`document.getElementById('ptt').textContent`))==='点击说话','idle after timeout');
    out.push(...p.errs.map(e=>'ERR '+e));fail+=p.errs.length;p.close();
  }
  /* phone: touch hold-to-talk */
  {
    const p=await openPage(C.port,{w:393,h:873,mobile:true,url:`http://127.0.0.1:${PORT}/index.html`});
    await p.ev(`localStorage.setItem('dushen-terms-v1','1');document.querySelectorAll('.consent-bg').forEach(e=>e.remove());true`);
    await p.ev(`document.querySelector('[data-game="holdem"]').click();document.getElementById('start-btn').click();true`);await sleep(600);
    await p.ev(FAKE);
    await p.ev(`document.getElementById('chat-bubble').click();true`);await sleep(300);
    const [x,y]=await p.ev(`(()=>{const r=document.getElementById('ptt').getBoundingClientRect();return [r.left+r.width/2,r.top+r.height/2]})()`);
    ok((await p.ev(`document.getElementById('ptt').textContent`))==='按住说话','phone idle label 按住说话');
    const touch=(type,pts)=>p.send('Input.dispatchTouchEvent',{type,touchPoints:pts});
    await touch('touchStart',[{x,y}]);await sleep(1200);
    ok(/^松开发送 \d/.test(await p.ev(`document.getElementById('ptt').textContent`)),'holding label 松开发送');
    ok(await p.ev(`!!document.querySelector('#ptt .ptt-bar')`)&&!(await p.ev(`!!document.getElementById('ptt-x')`)),'phone: bar shown, no 取消 button');
    await touch('touchEnd',[]);await sleep(300);
    ok((await p.ev(`__sent.length`))===1,'release sends');
    await touch('touchStart',[{x,y}]);await sleep(15600);
    ok((await p.ev(`__sent.length`))===1&&/已自动取消/.test(await p.ev(`(document.getElementById('toast')||{}).textContent||''`)),'phone: 15 s timeout cancels');
    await touch('touchEnd',[]);await sleep(300);
    ok((await p.ev(`__sent.length`))===1,'release after timeout sends nothing');
    out.push(...p.errs.map(e=>'ERR '+e));fail+=p.errs.length;p.close();
  }
}finally{C.kill();srv.close()}
out.forEach(l=>console.log(l));
console.log(`voice: ${pass} passed, ${fail} failed`);
process.exit(fail?1:0);
