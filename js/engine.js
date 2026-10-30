/* 赌神智慧树 · table engine shared by both games: seats, chips, pots, hand end, stats, per-seat views. Runs on the host (or solo). */
'use strict';

/* =====================================================================
   ENGINE — runs only on the host (or in solo mode). S is authoritative.
   ===================================================================== */
let S=null,timer=null;
const P=()=>S.players;
const nextIdx=(from,pred)=>nextIn(S,from,pred);
function log(t,cls){S.log.push({t,cls:cls||''});if(S.log.length>400)S.log.splice(0,S.log.length-400)}
const isBot=p=>p.kind==='ai';
const DISC_GRACE=15000;
const present=p=>p.kind!=='remote'||p.connected;
function delay(){
  const base={slow:950,normal:600,fast:220}[S.cfg.speed]||600;
  if(S.cfg.ff&&!P().some(p=>!isBot(p)&&alive(p)&&present(p)))return 60;
  return base;
}
const FEMALE_BOTS=new Set(['小美','Lina','Mia']);
function mkPlayer(id,name,kind,style,cfg,gender){return {id,name,kind,style,gender:gender==='f'?'f':'m',stack:cfg.stack,rebuys:0,out:false,busted:false,connected:true,cards:[],bet:0,total:0,folded:false,allIn:false,inHand:false,lastAction:'',won:0,shown:false,handName:'',pre:null,post:[],line:[],
  st:{h:0,vp:0,pf:0,tbO:0,tb:0,bets:0,calls:0,fbO:0,fb:0},hf:null}}
function commitHand(){
  const ps=P().filter(p=>p.inHand);
  ps.forEach(p=>{const f=p.hf;if(f){p.st.vp+=f.vp;p.st.pf+=f.pf;p.st.tbO+=f.tbO;p.st.tb+=f.tb}p.hf=null});
  /* who won chips from whom: each loser's loss is split across winners by their share of the winnings */
  const nets=ps.map(p=>({id:p.id,net:p.won-p.total}));
  const gain=nets.filter(x=>x.net>0),sumG=gain.reduce((a,x)=>a+x.net,0);
  if(!sumG)return;
  nets.filter(x=>x.net<0).forEach(l=>gain.forEach(g=>{const k=l.id+'>'+g.id;S.flow[k]=(S.flow[k]||0)+(-l.net)*g.net/sumG}));
}
const flowVs=(flow,p,seat)=>(flow[p+'>'+seat]||0)-(flow[seat+'>'+p]||0);
/* fill or repair any missing / invalid setting before a game starts (form, restored room, older saved prefs) */
function normalizeCfg(c){
  c={...c};
  const num=(v,d,ok)=>{v=+v;return Number.isFinite(v)&&ok(v)?v:d};
  c.game=['zjh','ddz'].includes(c.game)?c.game:'holdem';
  c.players=Math.round(num(c.players,6,v=>v>=2&&v<=MAX_SEATS));
  c.ante=num(c.ante,20,v=>v>0);c.zcap=num(c.zcap,10,v=>v>=2);c.zrounds=num(c.zrounds,10,v=>v>=2);
  if(c.game==='zjh'){c.sb=c.ante;c.bb=c.ante}
  else if(c.game==='ddz'){c.players=3;c.laizi=!!c.laizi;c.base=num(c.base,20,v=>v>0);c.ddcap=num(c.ddcap,64,v=>v>=1);c.sb=c.bb=c.ante=c.base}
  else{c.bb=num(c.bb,20,v=>v>0);c.sb=num(c.sb,c.bb/2,v=>v>0&&v<=c.bb)}
  c.stack=Math.round(num(c.stack,c.bb*100,v=>v>=c.bb*(c.game==='ddz'?20:10)));
  if(!['mixed',...Object.keys(STYLES)].includes(c.style))c.style='mixed';
  if(!['slow','normal','fast'].includes(c.speed))c.speed='normal';
  return c;
}
function startGame(cfg,humans){
  cfg=normalizeCfg(cfg);
  clearTimeout(timer);
  voiceClear();
  const keys=Object.keys(STYLES),players=[];
  humans.forEach(h=>{const p=mkPlayer(players.length,h.name,h.kind,null,cfg,h.gender);p.cid=h.cid||'';players.push(p)});
  if(cfg.aiFill){
    const used=new Set(humans.map(h=>h.name));let k=0;
    while(players.length<cfg.players){const base=NAMES[k%NAMES.length];let nm=base;k++;while(used.has(nm))nm+='·';used.add(nm);const sk=cfg.style==='mixed'?pickArch():cfg.style,bp=mkPlayer(players.length,nm,'ai',sk,cfg,FEMALE_BOTS.has(base)?'f':'m');bp.ai=genAI(sk);if(cfg.game==='ddz')bp.ddArch=ddPickArch();players.push(bp)}
  }
  S={gone:[],ddWait:[],cfg,players,dealer:Math.floor(Math.random()*players.length),handNo:0,board:[],deck:[],street:'',currentBet:0,minRaise:cfg.bb,raises:0,needAct:[],toAct:-1,phase:'playing',log:[],msg:'',sbId:-1,bbId:-1,preRaisers:[],flow:{}};
  NET.conns.clear();
  humans.forEach((h,i)=>{if(h.conn){h.conn.seat=i;NET.conns.set(i,h.conn)}});
  resetT();
  startHand();
}
function shuffle(){const d=[];for(let c=0;c<52;c++)d.push(c);for(let i=51;i>0;i--){const j=Math.floor(Math.random()*(i+1));[d[i],d[j]]=[d[j],d[i]]}return d}
function startHand(){
  clearTimeout(timer);
  const cfg=S.cfg;
  if(isD(S))ddSeatChanges();
  for(const p of P()){
    if(p.stack>0||p.out)continue;
    if(isBot(p)){
      if(cfg.rebuy){p.stack=cfg.stack;p.rebuys++;log(`${p.name} 补码 ${fmt(cfg.stack)}`,'board-l')}
      else if(isD(S))ddReplaceBot(p);
      else{p.out=true;log(`${p.name} 输光离桌`,'board-l')}
    }else p.busted=true;
  }
  P().forEach(p=>Object.assign(p,{cards:[],bet:0,total:0,folded:false,allIn:false,lastAction:'',won:0,shown:false,handName:'',pre:null,post:[],line:[],inHand:false,seen:false,zs:0,revealTo:[],lostCmp:false,foldAt:0,revealName:''}));
  /* 斗地主 deals a dropped player in too: the bot plays their turns until they are back */
  const live=P().filter(p=>!p.out&&p.stack>0&&(present(p)||isD(S)));
  if(!live.some(p=>!isBot(p))){S.phase='busted';S.msg='真人玩家的筹码都输光了，补码后继续';sync();return}
  if(live.length<2){S.phase='waiting';S.msg='玩家不足 2 人，等待有人加入或补码';sync();return}
  if(isD(S)&&live.length<3){S.phase='waiting';S.msg='斗地主需要 3 个人，等待有人补码或入座';sync();return}
  live.forEach(p=>{p.inHand=true;p.st.h++;p.hf={vp:0,pf:0,tbO:0,tb:0}});
  if(isZ(S))return zDeal(live);
  if(isD(S))return ddDeal(live);
  S.handNo++;S.board=[];S.msg='';
  S.dealer=nextIdx(S.dealer,p=>p.inHand);
  S.deck=shuffle();
  for(let r=0;r<2;r++){let i=S.dealer;for(let k=0;k<live.length;k++){i=nextIdx(i,p=>p.inHand);P()[i].cards.push(S.deck.pop())}}
  const sbI=live.length===2?S.dealer:nextIdx(S.dealer,p=>p.inHand);
  const bbI=nextIdx(sbI,p=>p.inHand);
  S.sbId=sbI;S.bbId=bbI;S.preRaisers=[];
  log(`第 ${S.handNo} 手`,'sep');
  post(P()[sbI],cfg.sb,'小盲');post(P()[bbI],cfg.bb,'大盲');
  S.street='preflop';S.currentBet=cfg.bb;S.minRaise=cfg.bb;S.raises=0;
  S.needAct=P().map(canAct);
  S.toAct=nextIdx(bbI,canAct);
  S.phase='playing';
  proceed();
}
function put(p,amt){amt=Math.min(amt,p.stack);p.stack-=amt;p.bet+=amt;p.total+=amt;if(p.stack===0)p.allIn=true;return amt}
function post(p,amt,label){const a=put(p,amt);p.lastAction=`${label} ${fmt(a)}`;log(`${p.name}：${label} ${fmt(a)}`)}
function winUncontested(w){
  const pot=potOf(S);w.stack+=pot;w.won=pot;
  S.msg=`${w.name} 赢得底池 ${fmt(pot)}（其他人都弃牌）`;log(S.msg,'win-l');
  P().forEach(p=>p.bet=0);endHand();
}
/* main pot and side pots: each level goes to the best score among players who paid into it */
function distributePots(al,u,pick){
  const contrib=P().filter(p=>p.total>0);
  const levels=[...new Set(contrib.map(p=>p.total))].sort((a,b)=>a-b);
  let prev=0,carry=0;const results=[];
  for(const L of levels){
    let amt=carry;carry=0;for(const p of contrib)amt+=Math.max(0,Math.min(p.total,L)-prev);
    const elig=al.filter(p=>p.total>=L);prev=L;
    if(!elig.length){carry=amt;continue}
    const ws=pick?pick(elig):(()=>{const best=Math.max(...elig.map(p=>p.score));return elig.filter(p=>p.score===best)})();
    const order=[];let i=S.dealer;for(let k=0;k<P().length;k++){i=nextIdx(i,()=>true);if(ws.includes(P()[i]))order.push(P()[i])}
    const share=Math.floor(amt/ws.length/u)*u;let rem=amt-share*ws.length;
    order.forEach(w=>{let g=share;if(rem>0){const x=Math.min(rem,u);g+=x;rem-=x}w.stack+=g;w.won+=g});
    results.push({amt,ws});
  }
  if(carry>0&&results.length){const w=results[results.length-1].ws[0];w.stack+=carry;w.won+=carry}
}
function endHand(){
  commitHand();
  /* 「亮出所有人的底牌」: name the hands nobody showed down; 德州 folded hands use the board dealt when they folded */
  if(S.cfg.showAll&&!isD(S))P().forEach(p=>{if(p.inHand&&p.cards.length&&!(p.shown&&!p.folded&&p.handName))
    p.revealName=isZ(S)?(S.cfg.z235&&z235(p.cards)?'235':zName(zEval(p.cards))):handName(evalCards([...p.cards,...S.board.slice(0,p.folded?p.foldAt||0:5)]))});
  S.phase='handover';sync();
  P().filter(p=>isBot(p)&&p.won-p.total>=S.cfg.bb*15).forEach(p=>{if(Math.random()<0.3)botChat(p,['运气不错','谢谢老板','这把舒服','承让承让'])});
  if(S.cfg.auto){const hn=S.handNo;clearTimeout(timer);timer=setTimeout(()=>{if(S&&S.phase==='handover'&&S.handNo===hn)startHand()},NET.role==='solo'?2400:3600)}
}
function doRebuy(p){
  if(!p||isBot(p)||p.stack>0||p.inHand)return;
  p.stack=S.cfg.stack;p.rebuys++;p.busted=false;log(`${p.name} 补码 ${fmt(S.cfg.stack)}`,'board-l');
  if(S.phase==='busted'||S.phase==='waiting')startHand();else sync();
}
function hostSettle(reason){
  clearTimeout(timer);let note='';
  if(S.phase==='playing'||S.phase==='runout'){P().forEach(p=>{if(p.inHand){p.stack+=p.total;p.total=0;p.bet=0}});note='最后一手没打完，已退回所有人这手投入的筹码。'}
  S.phase='settled';
  const standings=P().concat(S.gone||[]).map(p=>({id:p.id,name:p.name,kind:p.kind,style:p.style,stack:p.stack,rebuys:p.rebuys,out:p.out,ddArch:p.ddArch,net:p.stack-S.cfg.stack*(1+p.rebuys),st:p.st,ai:p.ai||null}));
  const m={t:'settle',standings,reason:reason||'',note,cfg:S.cfg,flow:S.flow};
  for(const c of NET.conns.values())c.send(m);
  /* 斗地主: people still waiting for a seat hear that this round is over */
  (S.ddWait||[]).forEach(e=>{if(e.conn)e.conn.send(ddWaitMsg({ended:true}))});
  onSettle(m,0);
}

/* ---------- per-seat view: each player only receives their own hole cards ---------- */
function viewFor(seat){
  const reveal=S.cfg.reveal&&NET.role==='solo';
  return {
    cfg:S.cfg,me:seat,dealer:S.dealer,handNo:S.handNo,board:S.board.slice(),street:S.street,currentBet:S.currentBet,minRaise:S.minRaise,raises:S.raises,
    toAct:S.toAct,phase:S.phase,msg:S.msg,dd:S.dd?ddPublic(S.dd):null,sbId:S.sbId,bbId:S.bbId,preRaisers:S.preRaisers.slice(),log:S.log.slice(-80),ev:S.ev||null,stake:S.stake||0,round:S.round||0,
    players:S.players.map(p=>{
      const showAll=S.cfg.showAll&&S.phase==='handover'&&p.inHand;
      /* 炸金花: a blind player cannot see their own cards; a compare shows both hands to the two players involved */
      const vis=isZ(S)?((p.id===seat&&(p.seen||(S.phase!=='playing'&&S.phase!=='runout')))||(p.shown&&!p.folded)||(p.revealTo||[]).includes(seat)||(reveal&&p.id!==seat)||showAll)
        :(p.id===seat||(p.shown&&!p.folded)||reveal||showAll);
      return {id:p.id,name:p.name,kind:p.kind,style:p.style,stack:p.stack,bet:p.bet,total:p.total,folded:p.folded,allIn:p.allIn,inHand:p.inHand,out:p.out,busted:p.busted,connected:p.connected,
        st:p.st,vs:flowVs(S.flow,p.id,seat),gender:p.gender,
        lastAction:p.lastAction,won:p.won,shown:p.shown,handName:p.handName,revealName:showAll?p.revealName||'':'',rebuys:p.rebuys,cards:p.inHand?(vis?p.cards.slice():p.cards.map(()=>null)):[],seen:!!p.seen,zs:p.zs||0,lostCmp:!!p.lostCmp,pre:p.pre,post:p.post.slice(),line:p.line.slice()};
    })
  };
}
function sync(){
  if(!S)return;
  /* the host's card travels with each state, so a guest joining mid-game can check it */
  const hostCard=NET.role==='host'&&typeof myCard==='function'?myCard():null;
  for(const [seat,c] of NET.conns)if(P()[seat]&&P()[seat].connected)c.send({t:'state',v:viewFor(seat),hostCard});
  applyView(viewFor(0));
  hostSave();
}
/* ---------- chat (host relays every message to everyone) ---------- */
const chatLast={};
function hostChat(pid,text){
  if(!S)return;
  text=String(text||'').replace(/[\u0000-\u001f]/g,'').trim().slice(0,40);if(!text)return;
  const p=P()[pid];if(!p)return;
  const now=Date.now();if(chatLast[pid]&&now-chatLast[pid]<1200)return;chatLast[pid]=now;
  const m={t:'chat',pid,name:p.name,gender:p.gender,text};
  for(const [seat,c] of NET.conns)if(P()[seat]&&P()[seat].connected)c.send(m);
  onChat(m);
  if(!isBot(p)&&Math.random()<0.25){
    const bots=P().filter(q=>isBot(q)&&!q.out);
    if(bots.length)botChat(rand(bots),['哈哈','有道理','你猜','专心打牌','跟了就知道']);
  }
}
function botChat(p,lines){const id=p.id,line=rand(lines);setTimeout(()=>{if(S&&S.phase!=='settled')hostChat(id,line)},700+Math.random()*900)}
