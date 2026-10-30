/* 赌神智慧树 · sound effects, spoken actions and push-to-talk voice messages */
'use strict';

/* ---------- sound: sampled effects (assets/sfx), synthesized with Web Audio as fallback ---------- */
const SND={ctx:null,buf:{}};
function actx(){
  if(!SND.ctx){try{SND.ctx=new (window.AudioContext||window.webkitAudioContext)()}catch(e){return null}}
  if(SND.ctx.state==='suspended')SND.ctx.resume();
  return SND.ctx;
}
document.addEventListener('pointerdown',()=>{if(LOCAL.sfx){actx();sfxLoad()}},{passive:true});
/* decode every SFX_FILES entry once; a file that fails to load or decode is skipped */
let sfxLoading=null;
function sfxLoad(){
  if(sfxLoading)return sfxLoading;
  const c=actx();if(!c)return Promise.resolve();
  sfxLoading=Promise.all(Object.keys(SFX_FILES).map(async key=>{
    const list=await Promise.all(SFX_FILES[key].map(async f=>{
      try{const r=await fetch(assetURL(f));if(!r.ok)return null;return await c.decodeAudioData(await r.arrayBuffer())}catch(e){return null}
    }));
    const ok=list.filter(Boolean);if(ok.length)SND.buf[key]=ok;
  })).then(()=>{},()=>{});
  return sfxLoading;
}
/* play a random sample of this kind; false means nothing played, so the caller synthesizes instead */
function sample(key,at=0,vol=1){
  const c=LOCAL.sfx&&actx(),l=SND.buf[key];if(!c||!l||!l.length)return false;
  try{
    const s=c.createBufferSource(),g=c.createGain();
    s.buffer=l[Math.floor(Math.random()*l.length)];g.gain.value=vol;
    s.connect(g).connect(c.destination);s.start(c.currentTime+at);return true;
  }catch(e){return false}
}
function tone(f,dur,o={}){
  const c=LOCAL.sfx&&actx();if(!c)return;
  const t=c.currentTime+(o.at||0),osc=c.createOscillator(),g=c.createGain();
  osc.type=o.type||'sine';osc.frequency.setValueAtTime(f,t);if(o.slide)osc.frequency.exponentialRampToValueAtTime(o.slide,t+dur);
  g.gain.setValueAtTime(0.0001,t);g.gain.exponentialRampToValueAtTime(o.vol||0.2,t+0.01);g.gain.exponentialRampToValueAtTime(0.0001,t+dur);
  osc.connect(g).connect(c.destination);osc.start(t);osc.stop(t+dur+0.03);
}
function noise(dur,o={}){
  const c=LOCAL.sfx&&actx();if(!c)return;
  const t=c.currentTime+(o.at||0),len=Math.max(1,Math.floor(c.sampleRate*dur)),buf=c.createBuffer(1,len,c.sampleRate),d=buf.getChannelData(0);
  for(let i=0;i<len;i++)d[i]=(Math.random()*2-1)*(1-i/len);
  const s=c.createBufferSource();s.buffer=buf;
  const f=c.createBiquadFilter();f.type=o.type||'bandpass';f.frequency.setValueAtTime(o.freq||3000,t);if(o.sweep)f.frequency.exponentialRampToValueAtTime(o.sweep,t+dur);f.Q.value=o.q||1;
  const g=c.createGain();g.gain.setValueAtTime(o.vol||0.25,t);g.gain.exponentialRampToValueAtTime(0.0001,t+dur);
  s.connect(f).connect(g).connect(c.destination);s.start(t);
}
const SFX={
  chips(n=3,at=0){if(sample(n<=3?'chipLay':'chipStack',at))return;for(let i=0;i<n;i++){noise(.05,{at:at+i*.045,freq:4200+Math.random()*1500,q:8,vol:.35});tone(2600+Math.random()*600,.05,{at:at+i*.045,vol:.05,type:'triangle'})}},
  check(){tone(150,.09,{vol:.35});tone(125,.09,{at:.12,vol:.3})},
  fold(){if(sample('shove'))return;noise(.22,{freq:1800,sweep:500,type:'lowpass',vol:.22})},
  deal(n=4,shuffle=true){if(SND.buf.slide&&SND.buf.slide.length){if(shuffle)sample('shuffle');for(let i=0;i<n;i++)sample('slide',i*.09);return}for(let i=0;i<n;i++)noise(.06,{at:i*.09,freq:2500,q:2,vol:.25})},
  flip(){if(sample('place'))return;noise(.07,{freq:2000,q:1.5,vol:.3});tone(700,.05,{at:.02,vol:.04})},
  ding(){tone(880,.25,{vol:.12});tone(1320,.3,{at:.08,vol:.08})},
  allin(){tone(180,.6,{type:'sawtooth',vol:.08,slide:900});tone(60,.7,{at:.55,vol:.5,slide:38});noise(.5,{at:.55,freq:900,type:'lowpass',vol:.3});SFX.chips(8,.6);sample('collide',.6)},
  win(){[523,659,784,1047].forEach((f,i)=>tone(f,.25,{at:i*.09,type:'triangle',vol:.15}));if(!sample('handle',.1))SFX.chips(6,.1)},
  pot(){if(sample('handle'))return;SFX.chips(5)},
  clash(){tone(520,.12,{type:'square',vol:.07});tone(260,.28,{at:.12,type:'square',vol:.07});noise(.22,{at:.06,freq:1500,vol:.22})},
  fanfare(good){
    const seq=good?[523,659,784,1047,1319]:[440,392,349,330];
    seq.forEach((f,i)=>tone(f,good?.35:.45,{at:i*(good?.12:.2),type:good?'triangle':'sine',vol:.16}));
    if(good)SFX.chips(10,.6);
  }
};
/* ---------- voice: browser speech synthesis, voice + pitch chosen by gender ---------- */
const VOICES={list:[]};
function loadVoices(){try{VOICES.list=speechSynthesis.getVoices().filter(v=>/^(zh|cmn)/i.test(v.lang))}catch(e){}}
if('speechSynthesis' in window){loadVoices();try{speechSynthesis.onvoiceschanged=loadVoices}catch(e){}}
const MALE_RE=/li-?mu|yun|kang|han|male|男|gang|zhiwei|liang/i,FEMALE_RE=/ting|mei|sin-?ji|yu-?shu|shasha|lili|female|女|xiao(xiao|yi|mo)|huihui|yaoyao/i;
function pickVoice(g){
  const cn=VOICES.list.filter(v=>/CN|cmn/i.test(v.lang)),pool=cn.length?cn:VOICES.list;
  return pool.find(v=>(g==='f'?FEMALE_RE:MALE_RE).test(v.name)&&!(g==='f'?MALE_RE:FEMALE_RE).test(v.name))||null;
}
function say(text,g){
  if(!LOCAL.voice||!('speechSynthesis' in window))return;
  try{
    const u=new SpeechSynthesisUtterance(text),v=pickVoice(g);
    u.lang='zh-CN';if(v)u.voice=v;
    /* when no voice of that gender is installed, pitch alone keeps male and female apart */
    u.pitch=g==='f'?(v?1.1:1.5):(v?0.95:0.55);u.rate=1.12;u.volume=0.9;
    if(speechSynthesis.speaking||speechSynthesis.pending)speechSynthesis.cancel();
    speechSynthesis.speak(u);
  }catch(e){}
}

/* ---------- voice messages: push-to-talk clips, relayed by the host like chat ---------- */
/* clips live only in memory (object URLs). They are dropped when the page opens and when a new game starts. */
const VMSG={store:new Map(),queue:[],cur:null,curId:null,manual:false,mine:new Set()};
const VMAX_SEC=15,VMAX_LEN=160000;
function voiceClear(){
  stopVoice();VMSG.queue=[];
  for(const v of VMSG.store.values())try{URL.revokeObjectURL(v.url)}catch(e){}
  VMSG.store.clear();VMSG.mine.clear();
  CHAT=CHAT.filter(c=>!c.voice);
  if($('#chat-list'))renderChat();
}
function stopVoice(){if(VMSG.cur){VMSG.cur.onended=VMSG.cur.onerror=null;VMSG.cur.pause();VMSG.cur=null}VMSG.curId=null;VMSG.manual=false;markPlaying()}
/* manual plays jump the queue; an interrupted automatic clip goes back to the front and replays later */
function playVoice(id,manual){
  const v=VMSG.store.get(id);if(!v)return;
  if(VMSG.cur){const was=VMSG.curId,wasManual=VMSG.manual;stopVoice();if(!wasManual&&was&&was!==id)VMSG.queue.unshift(was)}
  VMSG.queue=VMSG.queue.filter(q=>q!==id);
  const a=new Audio(v.url);VMSG.cur=a;VMSG.curId=id;VMSG.manual=!!manual;
  const done=()=>{if(VMSG.cur!==a)return;VMSG.cur=null;VMSG.curId=null;VMSG.manual=false;markPlaying();nextVoice()};
  a.onended=a.onerror=done;
  a.play().catch(done);
  markPlaying();
}
function nextVoice(){while(!VMSG.cur&&VMSG.queue.length){const id=VMSG.queue.shift();if(VMSG.store.has(id)){playVoice(id,false);return}}}
function queueVoice(id){VMSG.queue.push(id);if(!VMSG.cur)nextVoice()}
function markPlaying(){document.querySelectorAll('[data-vplay]').forEach(b=>{const on=b.dataset.vplay===VMSG.curId;b.classList.toggle('playing',on);b.textContent=(on?'■ ':'▶ ')+b.dataset.dur+'″'})}
function dataURLtoBlob(d){const i=d.indexOf(','),head=d.slice(5,i),mime=head.split(';')[0]||'audio/webm',bin=atob(d.slice(i+1));const u=new Uint8Array(bin.length);for(let k=0;k<bin.length;k++)u[k]=bin.charCodeAt(k);return new Blob([u],{type:mime})}
const blobToDataURL=b=>new Promise((res,rej)=>{const r=new FileReader();r.onload=()=>res(r.result);r.onerror=rej;r.readAsDataURL(b)});
function onVoice(m){
  if(!m||typeof m.data!=='string'||!m.data.startsWith('data:audio/')||m.data.length>VMAX_LEN)return;
  const id=String(m.id||'').slice(0,40);if(!id||VMSG.store.has(id))return;
  let url;try{url=URL.createObjectURL(dataURLtoBlob(m.data))}catch(e){return}
  const dur=Math.max(1,Math.min(VMAX_SEC,Math.round(+m.dur||1)));
  VMSG.store.set(id,{url,dur});
  onChat({pid:Number.isInteger(m.pid)?m.pid:-1,name:String(m.name||''),gender:m.gender==='f'?'f':'m',text:'',voice:id,dur});
  if(!VMSG.mine.has(id)&&LOCAL.vmsg)queueVoice(id);
}
function sendVoice(data,dur){
  const id=randId();VMSG.mine.add(id);
  const m={t:'voice',id,dur,data};
  if(NET.role==='guest')NET.host&&NET.host.send(m);
  else if(S)hostVoice(0,null,m);
  else if(LOBBY)hostVoice(-1,null,m);
}
/* host side: validate, rate-limit, then relay to everyone (lobby or table) */
function hostVoice(pid,w,m){
  if(!m||typeof m.data!=='string'||!m.data.startsWith('data:audio/')||m.data.length>VMAX_LEN)return;
  let who;
  if(S){who=P()[pid];if(!who)return}
  else{who=w?LOBBY.humans.find(x=>x.conn===w):LOBBY.humans[0];if(!who)return;pid=-1}
  const k='V'+(S?pid:who.name),now=Date.now();if(chatLast[k]&&now-chatLast[k]<2000)return;chatLast[k]=now;
  const out={t:'voice',id:String(m.id||randId()).slice(0,40),pid,name:who.name,gender:who.gender,dur:Math.min(VMAX_SEC,+m.dur||1),data:m.data};
  if(S){for(const [seat,c] of NET.conns)if(P()[seat]&&P()[seat].connected)c.send(out)}
  else LOBBY.humans.forEach(x=>x.conn&&x.conn.send(out));
  onVoice(out);
}
/* recording needs a secure page (https, or a desktop browser's local file); phones opening a local file usually are not */
function micSupport(){
  if(!window.isSecureContext)return {ok:false,reason:'当前不是安全网址（https），浏览器不会弹出麦克风授权，也不能录音。手机上直接打开本地 HTML 文件就是这种情况。把文件放到 https 网址上打开即可使用语音。'};
  if(!navigator.mediaDevices||!navigator.mediaDevices.getUserMedia)return {ok:false,reason:'这个浏览器不支持录音。'};
  if(!window.MediaRecorder)return {ok:false,reason:'这个浏览器不支持录音（缺少 MediaRecorder）。'};
  return {ok:true};
}
let toastTimer=null;
function toast(text,ms){
  let t=$('#toast');if(!t){t=document.createElement('div');t.id='toast';t.className='toast';t.setAttribute('role','status');document.body.appendChild(t)}
  t.textContent=text;t.hidden=false;clearTimeout(toastTimer);toastTimer=setTimeout(()=>{t.hidden=true},ms||5000);
}
/* recording */
/* touch: hold to talk, release to send. mouse: click to start, click 发送 or 取消; a clip that reaches VMAX_SEC is dropped */
const REC={stream:null,rec:null,chunks:[],t0:0,timer:null,cancel:false,pressing:false,outside:false,click:false,timeout:false};
const pttFine=()=>!!(window.matchMedia&&matchMedia('(hover:hover) and (pointer:fine)').matches);
const pttIdle=()=>pttFine()?'点击说话':'按住说话';
async function recStart(){
  if(REC.rec)return;
  const sup=micSupport();
  if(!sup.ok){REC.pressing=false;document.body.classList.remove('recording');toast(sup.reason,7000);updRecBtn(-1);return}
  try{REC.stream=await navigator.mediaDevices.getUserMedia({audio:{echoCancellation:true,noiseSuppression:true}})}
  catch(e){
    REC.pressing=false;document.body.classList.remove('recording');updRecBtn(-1);
    const n=e&&e.name;
    toast(n==='NotAllowedError'||n==='SecurityError'?'麦克风被拒绝了。请检查两处：① 浏览器地址栏左侧的锁或信息图标 → 权限 → 麦克风，改为允许；② 手机「设置 → 应用 → 浏览器（如 Edge）→ 权限 → 麦克风」，改为允许。改完刷新页面。'
      :n==='NotFoundError'?'没有找到可用的麦克风。':'无法使用麦克风：'+(e&&e.message||e),9000);
    return;
  }
  if(!REC.pressing&&!REC.click){REC.stream.getTracks().forEach(t=>t.stop());REC.stream=null;toast(`麦克风已就绪，${pttFine()?'点击':'按住'}按钮说话。`,2500);return}
  const mime=['audio/webm;codecs=opus','audio/ogg;codecs=opus','audio/mp4'].find(t=>MediaRecorder.isTypeSupported&&MediaRecorder.isTypeSupported(t));
  const rec=new MediaRecorder(REC.stream,mime?{mimeType:mime,audioBitsPerSecond:24000}:{audioBitsPerSecond:24000});
  REC.rec=rec;REC.chunks=[];REC.t0=Date.now();REC.cancel=false;REC.timeout=false;
  rec.ondataavailable=e=>{if(e.data&&e.data.size)REC.chunks.push(e.data)};
  rec.onstop=recDone;
  rec.start(250);
  REC.timer=setInterval(()=>{const sec=(Date.now()-REC.t0)/1000;updRecBtn(sec);if(sec>=VMAX_SEC){REC.timeout=true;recStop(true)}},100);
  updRecBtn(0);
}
function recStop(cancel){REC.pressing=false;REC.click=false;document.body.classList.remove('recording');if(!REC.rec)return;REC.cancel=REC.cancel||cancel;clearInterval(REC.timer);try{REC.rec.state!=='inactive'&&REC.rec.stop()}catch(e){}}
async function recDone(){
  const rec=REC.rec,dur=(Date.now()-REC.t0)/1000,cancel=REC.cancel,chunks=REC.chunks;
  REC.rec=null;if(REC.stream){REC.stream.getTracks().forEach(t=>t.stop());REC.stream=null}
  updRecBtn(-1);
  if(cancel){toast(REC.timeout?`录音超过 ${VMAX_SEC} 秒，已自动取消。`:'已取消发送。',REC.timeout?3000:1500);REC.timeout=false;return}
  if(dur<0.7){toast('说话时间太短。',1500);return}
  const blob=new Blob(chunks,{type:(rec&&rec.mimeType)||'audio/webm'});
  const data=await blobToDataURL(blob);
  if(data.length>VMAX_LEN){toast('语音太长，没有发送。',2000);return}
  sendVoice(data,Math.round(dur));
}
function updRecBtn(sec){
  const b=$('#ptt');if(!b)return;
  const on=sec>=0,click=on&&!REC.pressing;
  b.classList.toggle('rec',on&&!REC.outside);b.classList.toggle('cancel',on&&REC.outside);
  const txt=!on?pttIdle():REC.outside?'松开取消':`${click?'':'松开'}发送 ${sec.toFixed(1)}″`;
  /* the bar fills over VMAX_SEC; full means the clip is dropped */
  b.innerHTML=`<span>${txt}</span>${on?`<i class="ptt-bar" style="width:${Math.min(100,sec/VMAX_SEC*100).toFixed(1)}%"></i>`:''}`;
  let x=$('#ptt-x');
  if(click&&!x&&b.parentElement){x=document.createElement('button');x.type='button';x.id='ptt-x';x.className='btn sm ptt-x';x.textContent='取消';b.parentElement.appendChild(x)}
  if(x&&!click)x.remove();
}
