/* 赌神智慧树 · this device's client state: my view V, my stats T, local preferences */
'use strict';

/* =====================================================================
   CLIENT — what this device shows. V is my view, T my own stats.
   ===================================================================== */
let V=null,T=null,ADV=null,SETTLE=null,CHAT=[];
const LOCAL={mode:'live',sfx:true,voice:true,vmsg:true};
try{LOCAL.mode=localStorage.getItem('holdem-coach')==='after'?'after':'live';LOCAL.sfx=localStorage.getItem('holdem-sfx')!=='0';LOCAL.voice=localStorage.getItem('holdem-voice')!=='0';LOCAL.vmsg=localStorage.getItem('holdem-vmsg')!=='0'}catch(e){}
function resetT(){T={hist:[],decisions:[],hands:0,vpip:0,pfr:0,won:0,cur:-1,rec:-1,start:0,flags:{},last:null}}
