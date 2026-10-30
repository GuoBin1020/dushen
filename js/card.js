/* 赌神智慧树 · online access cards: signed card codes, the clock guard, and unlocking the sealed online code */
'use strict';

/* =====================================================================
   CARDS — online play needs a card the author issues (卡号 + 卡密).
   卡密 = base64url( expiry (4 bytes, Unix minutes, big-endian) + K (32 bytes) + Ed25519 signature (64 bytes) ),
   signed over "dushen-card-v1|卡号|expiry|base64url(K)". Only the public key is here, so reading this file is not
   enough to make a card. K opens the sealed online code (js/net-online.enc.js, NaCl secretbox).
   Everything uses the bundled TweetNaCl, never crypto.subtle, so it also works where the browser has no WebCrypto
   (a file opened from a phone's file manager, an in-app browser). The rules part below never touches the page.
   ===================================================================== */
const CARD_PUB='0QyPNKj69DWjY0C3LB4-KnOWYA9If_NttX25WgI9Uso';
const CARD_MSG='dushen-card-v1';
const CARD_LEN=4+32+64;
const CLOCK_SLACK=10*60e3;
const B64U='ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_';
function b64u(bytes){
  let s='',i=0;
  for(;i+2<bytes.length;i+=3){const n=bytes[i]<<16|bytes[i+1]<<8|bytes[i+2];s+=B64U[n>>18&63]+B64U[n>>12&63]+B64U[n>>6&63]+B64U[n&63]}
  if(bytes.length-i===1){const n=bytes[i]<<16;s+=B64U[n>>18&63]+B64U[n>>12&63]}
  else if(bytes.length-i===2){const n=bytes[i]<<16|bytes[i+1]<<8;s+=B64U[n>>18&63]+B64U[n>>12&63]+B64U[n>>6&63]}
  return s;
}
function unb64u(str){
  if(typeof str!=='string'||!/^[A-Za-z0-9_-]*$/.test(str)||str.length%4===1)return null;
  const out=new Uint8Array(Math.floor(str.length*3/4));let o=0,buf=0,bits=0;
  for(const ch of str){buf=buf<<6|B64U.indexOf(ch);bits+=6;if(bits>=8){bits-=8;out[o++]=buf>>bits&255}}
  return out;
}
/* UTF-8 without TextEncoder (plain JavaScript works everywhere) */
const utf8=s=>{const b=unescape(encodeURIComponent(s)),u=new Uint8Array(b.length);for(let i=0;i<b.length;i++)u[i]=b.charCodeAt(i);return u};
const unutf8=u=>{let b='';for(let i=0;i<u.length;i++)b+=String.fromCharCode(u[i]);return decodeURIComponent(escape(b))};
/* 卡号: any text up to 32 characters, no line breaks or '|', outer spaces dropped */
const CARD_BAD_CHARS=/[|\u0000-\u001f\u007f-\u009f\u00ad\u061c\u180e\u200b-\u200f\u2028-\u202e\u2060-\u206f\ufeff\ufff9-\ufffb]/;
const LONE_SURROGATE=/[\ud800-\udbff](?![\udc00-\udfff])|(?:^|[^\ud800-\udbff])[\udc00-\udfff]/;
function cardNormNo(no){
  if(typeof no!=='string')return null;
  /* one spelling per card: NFC, and nothing invisible or direction-changing, so two cards never look the same in the lobby */
  if(LONE_SURROGATE.test(no))return null;
  const n=no.normalize('NFC').trim();
  if(!n||[...n].length>32||CARD_BAD_CHARS.test(n))return null;
  return n;
}
const cardMsg=(no,expMin,key)=>utf8(`${CARD_MSG}|${no}|${expMin}|${b64u(key)}`);
/* the author's side (generator, tests): sign a card */
function cardMake(no,expMs,key,signSecret){
  const n=cardNormNo(no);if(!n)throw new Error('bad card number');
  const expMin=Math.floor(expMs/60e3),out=new Uint8Array(CARD_LEN);
  out[0]=expMin>>>24&255;out[1]=expMin>>>16&255;out[2]=expMin>>>8&255;out[3]=expMin&255;
  out.set(key,4);out.set(nacl.sign.detached(cardMsg(n,expMin,key),signSecret),36);
  return b64u(out);
}
/* the signature only: {ok, exp, key} or {ok:false, why} */
function cardVerify(no,secret,pub=CARD_PUB){
  const bad=why=>({ok:false,why});
  const n=cardNormNo(no);if(!n)return bad('bad-no');
  const b=typeof secret==='string'?unb64u(secret.trim()):null;
  if(!b||b.length!==CARD_LEN)return bad('bad-format');
  const expMin=(b[0]<<24>>>0)+(b[1]<<16)+(b[2]<<8)+b[3],key=b.slice(4,36),sig=b.slice(36),pk=unb64u(pub);
  let good=false;
  try{good=!!pk&&pk.length===32&&nacl.sign.detached.verify(cardMsg(n,expMin,key),sig,pk)}catch(e){good=false}
  if(!good)return bad('bad-sign');
  return {ok:true,exp:expMin*60e3,key};
}
/* {ok, exp, key, why}; why: bad-no, bad-format, bad-sign, clock (device time set back), expired */
function cardCheck(no,secret,{now=Date.now(),pub=CARD_PUB,clockMin=0}={}){return cardTimes(cardVerify(no,secret,pub),now,clockMin)}
function cardTimes(v,now,clockMin){
  if(!v.ok)return v;
  if(now<clockMin-CLOCK_SLACK)return {ok:false,why:'clock',exp:v.exp};
  /* an expired card still carries K: a game already under way may be restored with it (see cardForRestore) */
  if(now>=v.exp)return {ok:false,why:'expired',exp:v.exp,key:v.key};
  return {ok:true,exp:v.exp,key:v.key};
}
function cardTime(ms){const d=new Date(ms),p=x=>String(x).padStart(2,'0');return `${d.getFullYear()}-${p(d.getMonth()+1)}-${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}`}
function cardWhyText(why,exp){
  return {'bad-no':'卡号不对：最多 32 个字符，不能有换行和「|」。','bad-format':'卡号或卡密不对，请检查卡密是否复制完整。','bad-sign':'卡号或卡密不对，请检查卡密是否复制完整。',
    expired:`这张卡已于 ${exp?cardTime(exp):'之前'} 到期，请向作者要一张新卡。`,clock:'设备时间被调回了，请把手机或电脑的时间改对后再试。'}[why]||'卡号或卡密不对。';
}
/* sealing the online code (the author's tools) and opening it (here, with K from a valid card) */
function sealMake(src,key){const n=nacl.randomBytes(24);return {v:1,n:b64u(n),ct:b64u(nacl.secretbox(utf8(src),n,key))}}
function sealOpen(sealed,key){
  try{
    if(!sealed||sealed.v!==1||!key||key.length!==32)return null;
    const n=unb64u(sealed.n),ct=unb64u(sealed.ct);if(!n||n.length!==24||!ct)return null;
    const m=nacl.secretbox.open(ct,n,key);return m?unutf8(m):null;
  }catch(e){return null}
}

/* ===== PAGE: the stored card, the clock guard, unlocking the online code, and the card dialog ===== */
const CARD_STORE='dushen-card',CLOCK_STORE='dushen-clock',RESTORE_WINDOW=2*3600e3;
let ONLINE=false;
const lsGet=k=>{try{return localStorage.getItem(k)}catch(e){return null}};
const lsSet=(k,v)=>{try{localStorage.setItem(k,v)}catch(e){}};
const lsDel=k=>{try{localStorage.removeItem(k)}catch(e){}};
/* the latest time this device has shown; a clock far behind it means the time was set back */
function clockMin(){const v=+lsGet(CLOCK_STORE);return Number.isFinite(v)?v:0}
function clockSeen(now=Date.now()){if(now>clockMin())lsSet(CLOCK_STORE,String(now))}
function storedCard(){try{const c=JSON.parse(lsGet(CARD_STORE)||'null');return c&&typeof c.no==='string'&&typeof c.secret==='string'?c:null}catch(e){return null}}
/* the stored card's signature is checked once per card; after that only the clock and the expiry are compared */
let CARD_MEMO={k:'',v:null};
function storedCheck(now=Date.now(),pub=CARD_PUB){
  const c=storedCard();if(!c)return null;
  const k=c.no+'\n'+c.secret+'\n'+pub;
  if(CARD_MEMO.k!==k)CARD_MEMO={k,v:cardVerify(c.no,c.secret,pub)};
  const r=cardTimes(CARD_MEMO.v,now,clockMin());if(r.ok)clockSeen(now);return {...r,card:c};
}
/* entering a card: the same card again keeps the clock guard; a different valid card resets it (a clock once set ahead cannot lock anyone out) */
function cardAccept(no,secret,{now=Date.now(),pub=CARD_PUB}={}){
  const sec=String(secret||'').replace(/\s+/g,''),old=storedCard(),same=!!old&&old.no===cardNormNo(no)&&old.secret===sec;
  const r=cardCheck(no,sec,{now,pub,clockMin:same?clockMin():0});
  if(r.ok){lsSet(CARD_STORE,JSON.stringify({no:cardNormNo(no),secret:sec,exp:r.exp}));lsSet(CLOCK_STORE,String(same?Math.max(clockMin(),now):now))}
  return r;
}
/* the card to show others (hello, lobby, state): only while it is valid */
function myCard(){const r=storedCheck();return r&&r.ok?{no:r.card.no,secret:r.card.secret}:null}
const onlineReady=()=>ONLINE;
/* open the sealed online code with K and run it as a page script (its functions become globals) */
function unlockOnline(key){
  if(ONLINE)return true;
  const src=sealOpen(window.DUSHEN_SEALED,key);if(!src)return false;
  const el=document.createElement('script');el.textContent=src;document.head.appendChild(el);
  ONLINE=typeof guestOnMsg==='function';return ONLINE;
}
/* page load: may an expired card still open the code to finish a game saved before it expired, within 2 hours? */
function cardForRestore(savedAt,now=Date.now()){
  const r=storedCheck(now);if(!r)return false;
  if(r.ok)return unlockOnline(r.key);
  if(r.why==='expired'&&savedAt<r.exp&&now-savedAt<RESTORE_WINDOW)return unlockOnline(r.key);
  return false;
}
/* an expired card nobody can use any more is removed */
function cardCleanup(keep){const r=storedCheck();if(r&&r.why==='expired'&&!keep)lsDel(CARD_STORE)}
/* before going online: a valid stored card opens the code; otherwise ask for one */
function ensureOnline(){
  const r=storedCheck();
  if(r&&r.ok&&unlockOnline(r.key))return Promise.resolve(true);
  return askCard(r&&!r.ok?cardWhyText(r.why,r.exp):'');
}
function askCard(note){
  return new Promise(res=>{
    const bg=document.createElement('div');bg.className='consent-bg';
    const old=storedCard();
    bg.innerHTML=`<div class="consent" role="dialog" aria-modal="true" aria-labelledby="card-t">
      <h2 id="card-t">输入卡号和卡密</h2>
      <p>联机需要作者发给你的卡号和卡密，单机不需要。卡密很长，请直接粘贴。</p>
      <label class="lbl" for="card-no">卡号</label><input type="text" id="card-no" maxlength="40" autocomplete="off" style="width:100%">
      <label class="lbl" for="card-sec" style="margin-top:8px">卡密</label><textarea id="card-sec" autocomplete="off" spellcheck="false"></textarea>
      <p class="err" id="card-err" role="alert">${esc(note||'')}</p>
      <div class="setup-actions"><button type="button" class="btn primary" id="card-yes">确定</button><button type="button" class="btn" id="card-no-btn">取消</button></div></div>`;
    document.body.appendChild(bg);
    if(old)bg.querySelector('#card-no').value=old.no;
    const done=ok=>{bg.remove();res(ok)};
    bg.querySelector('#card-yes').addEventListener('click',()=>{
      const r=cardAccept(bg.querySelector('#card-no').value,bg.querySelector('#card-sec').value);
      if(!r.ok){bg.querySelector('#card-err').textContent=cardWhyText(r.why,r.exp);return}
      if(!unlockOnline(r.key)){bg.querySelector('#card-err').textContent='这张卡打不开这个版本的联机功能，请向作者要一张新卡，或者换成最新版本。';return}
      done(true);
    });
    bg.querySelector('#card-no-btn').addEventListener('click',()=>done(false));
    (old?bg.querySelector('#card-sec'):bg.querySelector('#card-no')).focus();
  });
}
