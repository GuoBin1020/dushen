/* 赌神智慧树 · the plain part of networking: room ids, the one-tab lock, saved sessions, names, leaving a room.
   Single-player needs these too. The online code itself (PeerJS, LAN codes, host and guest) is sealed in
   js/net-online.enc.js and opens with a valid card (js/card.js). */
'use strict';

/* =====================================================================
   NETWORK — PeerJS (internet) or hand-exchanged WebRTC codes (LAN)
   ===================================================================== */
const NET={role:'solo',net:'internet',peer:null,code:'',host:null,conns:new Map(),lanSlots:[],guestPc:null,settled:false,reconnecting:false,me:null};
/* per-tab client id: survives a refresh, so the host can give a returning player their seat back */
const randId=()=>crypto.randomUUID?crypto.randomUUID().replace(/-/g,'').slice(0,16):Math.random().toString(36).slice(2)+Date.now().toString(36);
const CID=(()=>{try{let c=sessionStorage.getItem('holdem-cid');if(!c){c=randId();sessionStorage.setItem('holdem-cid',c)}return c}catch(e){return 'c'+randId()}})();
/* per-room player id, kept 2 days after last use. localStorage instead of a cookie: file:// pages cannot store cookies. */
const ID_TTL=2*864e5;
/* only one id is kept: joining a different room replaces it */
function roomIdentity(code,fresh){
  let o=null;
  if(!fresh)try{o=JSON.parse(localStorage.getItem('holdem-id')||'null')}catch(e){}
  if(!o||o.room!==code||!o.id||!(o.exp>Date.now()))o={room:code,id:code+'-'+randId()};
  o.exp=Date.now()+ID_TTL;
  if(!fresh)try{localStorage.setItem('holdem-id',JSON.stringify(o))}catch(e){}
  return o.id;
}
function purgeIdentities(){
  try{
    for(let i=localStorage.length-1;i>=0;i--){const k=localStorage.key(i);if(k&&k.startsWith('holdem-id-'))localStorage.removeItem(k)}
    const o=JSON.parse(localStorage.getItem('holdem-id')||'null');if(o&&!(o.exp>Date.now()))localStorage.removeItem('holdem-id');
  }catch(e){}
}
/* one tab per room: a Web Lock named after the room. Another tab may take it over; the old tab then disconnects. */
const ROOMLOCK={code:null,release:null};
function holdLock(code,opts){
  return new Promise(res=>{
    if(ROOMLOCK.code===code)return res(true);
    if(!navigator.locks){ROOMLOCK.code=code;return res(true)}
    navigator.locks.request('holdem-'+code,opts,lock=>{
      if(!lock){res(false);return}
      ROOMLOCK.code=code;res(true);
      return new Promise(rel=>{ROOMLOCK.release=()=>{ROOMLOCK.code=null;ROOMLOCK.release=null;rel()}});
    }).catch(e=>{if(e&&e.name==='AbortError'&&ROOMLOCK.code===code){ROOMLOCK.code=null;ROOMLOCK.release=null;onRoomTakenOver()}});
  });
}
/* hosts and guests lock separately, so one browser can host a room and join it as a guest for testing */
const claimRoom=(code,role)=>holdLock((role||'guest')+':'+code,{ifAvailable:true});
const takeoverRoom=(code,role)=>holdLock((role||'guest')+':'+code,{steal:true});
function releaseRoom(){if(ROOMLOCK.release)ROOMLOCK.release();ROOMLOCK.code=null}
let PENDING=null;
/* run go(freshIdentity) once this tab may use the room; otherwise ask how to resolve the clash */
async function withRoom(code,go,allowNew,role){
  if(await claimRoom(code,role))return go(false);
  PENDING={code,go,role};
  showBanner(`房间 ${esc(code)} 已经在本浏览器的另一个标签页打开了。`,
    '<button class="btn sm primary" data-act="takeover">在这里继续（另一页会断开）</button>'+(allowNew?'<button class="btn sm" data-act="newid">用新身份加入（多开测试）</button>':'')+'<button class="btn sm" data-act="cancel-room">取消</button>');
}
function onRoomTakenOver(){
  const role=NET.role;NET.settled=true;NET.reconnecting=false;NET.owner=false;
  const quiet=c=>{if(c){c.onclose=null;c.close()}};
  if(role==='guest')quiet(NET.host);
  if(role==='host'){clearTimeout(timer);for(const c of NET.conns.values())quiet(c);if(LOBBY)LOBBY.humans.forEach(h=>quiet(h.conn));try{NET.peer&&NET.peer.destroy()}catch(e){}NET.peer=null}
  try{sessionStorage.removeItem('holdem-session');sessionStorage.removeItem('holdem-host')}catch(e){}
  showBanner('这个房间已经在另一个标签页继续了，本页已断开。','<button class="btn sm" data-act="home">返回首页</button>');
}
let LOBBY=null,GL=null;
const CODE_CH='ABCDEFGHJKMNPQRSTUVWXYZ23456789';
const newCode=()=>Array.from({length:6},()=>rand(CODE_CH)).join('');
const peerId=code=>'eg-holdem-lt-'+code.toUpperCase();
let saveTimer=null;
function hostSave(){
  if(NET.role!=='host'||NET.net!=='internet')return;
  clearTimeout(saveTimer);
  saveTimer=setTimeout(()=>{
    if(!NET.owner)return;
    try{
      const s=JSON.stringify({at:Date.now(),code:NET.code,
        S,lobby:!S&&LOBBY?{cfg:LOBBY.cfg,humans:LOBBY.humans.filter(h=>h.kind==='local').map(h=>({name:h.name,kind:h.kind,gender:h.gender,cid:h.cid}))}:null,T:slimT(),CHAT});
      sessionStorage.setItem('holdem-host',s);
      localStorage.setItem('holdem-host-last',s);
    }catch(e){}
  },400);
}
function cleanName(s){return String(s||'').replace(/[\u0000-\u001f<>]/g,'').trim().slice(0,12)||'玩家'}
function uniqueName(name,taken){let n=name,i=2;while(taken.includes(n))n=name+i++;return n}
function saveSession(o){try{const cur=JSON.parse(sessionStorage.getItem('holdem-session')||'{}');sessionStorage.setItem('holdem-session',JSON.stringify({...cur,...o,at:Date.now()}))}catch(e){}}
function slimT(){return {...T,decisions:T.decisions.slice(-200).map(d=>({...d,pre:d.pre?{...d.pre,chart:null}:null})),last:null}}
function leaveAll(){
  clearTimeout(timer);clearTimeout(saveTimer);
  try{sessionStorage.removeItem('holdem-session');sessionStorage.removeItem('holdem-host');if(NET.owner)localStorage.removeItem('holdem-host-last')}catch(e){}
  releaseRoom();NET.owner=false;NET.cid=null;voiceClear();if(REC.rec)recStop(true);
  NET.reconnecting=false;CHAT=[];
  try{NET.host&&NET.host.send({t:'leave',forGood:true})}catch(e){}
  for(const c of NET.conns.values())c.close();
  if(LOBBY)LOBBY.humans.forEach(h=>h.conn&&h.conn.close());
  NET.lanSlots.forEach(s=>{try{s.pc.close()}catch(e){}});
  try{NET.host&&NET.host.close()}catch(e){}
  try{NET.peer&&NET.peer.destroy()}catch(e){}
  Object.assign(NET,{role:'solo',peer:null,code:'',host:null,lanSlots:[],guestPc:null,settled:false});NET.conns.clear();
  S=null;V=null;LOBBY=null;GL=null;SETTLE=null;
}
