/* 赌神智慧树 · 德州扑克: hand evaluator, GTO preflop charts, opponent ranges, coach, exploit advice, bots and the betting rounds */
'use strict';

/* ---------- hand evaluator: score = category<<20 | five 4-bit ranks ---------- */
const RC=new Int8Array(13),SM=new Int32Array(4),SC=new Int8Array(4);
function sHigh(m){for(let h=12;h>=4;h--){const x=31<<(h-4);if((m&x)===x)return h}return (m&0x100F)===0x100F?3:-1}
function pack(cat,a){let v=0;for(let i=0;i<5;i++)v=(v<<4)|(a[i]||0);return (cat<<20)|v}
function kick(ex,n){const a=[];for(let r=12;r>=0&&a.length<n;r--)if(RC[r]&&ex.indexOf(r)<0)a.push(r);return a}
function evalCards(cs){
  RC.fill(0);SM.fill(0);SC.fill(0);let all=0;
  for(let i=0;i<cs.length;i++){const c=cs[i],r=c>>2,s=c&3;RC[r]++;SM[s]|=1<<r;SC[s]++;all|=1<<r}
  let flush=-1;
  for(let s=0;s<4;s++)if(SC[s]>=5){
    const h=sHigh(SM[s]);if(h>=0)return pack(8,[h]);
    const a=[];for(let r=12;r>=0&&a.length<5;r--)if(SM[s]>>r&1)a.push(r);flush=pack(5,a);
  }
  let q=-1,t1=-1,t2=-1,p1=-1,p2=-1;
  for(let r=12;r>=0;r--){const n=RC[r];if(n===4)q=r;else if(n===3){if(t1<0)t1=r;else if(t2<0)t2=r}else if(n===2){if(p1<0)p1=r;else if(p2<0)p2=r}}
  if(q>=0)return pack(7,[q,...kick([q],1)]);
  if(t1>=0&&(t2>=0||p1>=0))return pack(6,[t1,Math.max(t2,p1)]);
  if(flush>=0)return flush;
  const st=sHigh(all);if(st>=0)return pack(4,[st]);
  if(t1>=0)return pack(3,[t1,...kick([t1],2)]);
  if(p1>=0&&p2>=0)return pack(2,[p1,p2,...kick([p1,p2],1)]);
  if(p1>=0)return pack(1,[p1,...kick([p1],3)]);
  return pack(0,kick([],5));
}
function handName(score){const c=score>>20;if(c===8&&((score>>16)&15)===12)return '皇家同花顺';return CAT[c]}

/* Monte Carlo equity vs nOpp random hands */
function equity(hole,board,nOpp,iters){
  if(nOpp<=0)return 1;
  const used=new Set([...hole,...board]);const deck=[];for(let c=0;c<52;c++)if(!used.has(c))deck.push(c);
  const need=5-board.length,D=deck.length,draw=need+2*nOpp;let score=0;
  const mine=new Array(7),opp=new Array(7);
  for(let it=0;it<iters;it++){
    for(let k=0;k<draw;k++){const j=k+Math.floor(Math.random()*(D-k));const t=deck[k];deck[k]=deck[j];deck[j]=t}
    for(let k=0;k<5;k++){const c=k<board.length?board[k]:deck[k-board.length];mine[k+2]=c;opp[k+2]=c}
    mine[0]=hole[0];mine[1]=hole[1];
    const my=evalCards(mine);let ties=0,lost=false;
    for(let o=0;o<nOpp;o++){opp[0]=deck[need+2*o];opp[1]=deck[need+2*o+1];const s=evalCards(opp);if(s>my){lost=true;break}if(s===my)ties++}
    if(!lost)score+=1/(ties+1);
  }
  return score/iters;
}

/* ---------- GTO preflop charts (approx. 6-max, 100BB) ---------- */
const R13='23456789TJQKA';
const CH={
  RFI:{
    EP:'44+,A9s+,A5s-A4s,KTs+,QTs+,JTs,T9s,98s,AJo+,KQo',
    UTG:'22+,A2s+,K9s+,Q9s+,J9s+,T9s,98s,87s,76s,ATo+,KJo+,QJo',
    HJ:'22+,A2s+,K7s+,Q9s+,J9s+,T8s+,97s+,86s+,75s+,65s,54s,ATo+,KTo+,QTo+,JTo',
    CO:'22+,A2s+,K4s+,Q7s+,J7s+,T7s+,96s+,85s+,75s+,64s+,54s,A8o+,KTo+,QTo+,JTo,T9o',
    BTN:'22+,A2s+,K2s+,Q2s+,J4s+,T6s+,95s+,85s+,74s+,63s+,53s+,43s,A2o+,K8o+,Q9o+,J9o+,T8o+,98o,87o',
    SB:'22+,A2s+,K2s+,Q4s+,J6s+,T6s+,96s+,85s+,75s+,64s+,54s,A2o+,K9o+,Q9o+,J9o+,T9o,98o',
    HU_SB:'22+,A2s+,K2s+,Q2s+,J2s+,T2s+,92s+,83s+,73s+,63s+,52s+,42s+,32s,A2o+,K2o+,Q4o+,J6o+,T6o+,96o+,86o+,76o,65o'
  },
  VS:{ /* facing one open: [3-bet, call] */
    IP_early:['QQ+,AKs,AKo,A5s','JJ-66,AQs-ATs,KQs,KJs,QJs,JTs,T9s,98s,AQo'],
    IP_late:['TT+,AJs+,KQs,A5s-A4s,AQo+','99-22,ATs-A6s,KJs-KTs,QTs+,J9s+,T9s,98s,87s,76s,AJo,KQo'],
    SB_early:['JJ+,AQs+,AKo,A5s,KQs',''],
    SB_late:['88+,ATs+,KTs+,QJs,JTs,A5s-A3s,AJo+,KQo',''],
    BB_early:['QQ+,AKs,AKo,A5s','JJ-22,AQs-A2s,KTs+,Q9s+,J9s+,T8s+,97s+,86s+,76s,65s,54s,AQo-ATo,KJo+,QJo'],
    BB_late:['TT+,AJs+,KQs,A5s-A4s,AQo+','22+,A2s+,K2s+,Q5s+,J6s+,T6s+,96s+,85s+,74s+,63s+,53s+,43s,A2o+,K8o+,Q9o+,J9o+,T8o+,98o,87o,76o'],
    BB_hu:['88+,A8s+,KTs+,QJs,A5s-A2s,ATo+,KQo','22+,A2s+,K2s+,Q2s+,J4s+,T5s+,95s+,84s+,74s+,63s+,53s+,43s,A2o+,K5o+,Q8o+,J8o+,T8o+,97o+,87o,76o']
  },
  V3:{ /* facing a 3-bet: [4-bet, call] */
    early:['QQ+,AKs,AKo,A5s','JJ-88,AQs-AJs,KQs,QJs,JTs,AQo'],
    late:['QQ+,AKs,AKo,A5s','JJ-66,AQs-ATs,KQs-KJs,QJs,JTs,T9s,98s,AQo-AJo,KQo'],
    cold:['KK+,AKs','QQ-JJ,AKo,AQs']
  },
  V4:{opener:['QQ+,AKs,AKo',''],cold:['KK+,AKs','']}
};
const POS_CN={EP:'前位',UTG:'枪口位',HJ:'劫位',CO:'关煞位',BTN:'庄位',SB:'小盲',BB:'大盲',HU_SB:'单挑小盲'};
function hk(h,l,s){return h===l?R13[h]+R13[h]:R13[Math.max(h,l)]+R13[Math.min(h,l)]+s}
function handKey(c){const a=c[0]>>2,b=c[1]>>2;return a===b?hk(a,a,''):hk(a,b,(c[0]&3)===(c[1]&3)?'s':'o')}
const pcache={};
function parseRange(str){
  if(pcache[str])return pcache[str];
  const set=new Set(),RI=ch=>R13.indexOf(ch);
  for(const raw of (str||'').split(',')){
    const tok=raw.trim();if(!tok)continue;
    const plus=tok.endsWith('+'),t=plus?tok.slice(0,-1):tok;
    if(t.includes('-')){
      const [a,b]=t.split('-');
      if(a[0]===a[1]){for(let r=RI(b[0]);r<=RI(a[0]);r++)set.add(hk(r,r,''))}
      else{const h=RI(a[0]);for(let k=RI(b[1]);k<=RI(a[1]);k++)set.add(hk(h,k,a[2]))}
    }else if(t[0]===t[1]){const r=RI(t[0]);for(let x=r;x<=(plus?12:r);x++)set.add(hk(x,x,''))}
    else{const h=RI(t[0]),k=RI(t[1]);for(let x=k;x<=(plus?h-1:k);x++)set.add(hk(h,x,t[2]))}
  }
  return pcache[str]=set;
}
const COMBOS={};
for(let a=0;a<52;a++)for(let b=a+1;b<52;b++){const k=handKey([a,b]);(COMBOS[k]=COMBOS[k]||[]).push([a,b])}
const ALL_KEYS=Object.keys(COMBOS);
const comboCount=keys=>keys.reduce((s,k)=>s+(COMBOS[k]?COMBOS[k].length:0),0);
function chartPos(pos,n){
  if(pos==='BTN/SB')return 'HU_SB';
  if(['BB','SB','BTN','CO','HJ'].includes(pos))return pos;
  if(pos==='UTG')return n===4?'CO':n===5?'HJ':n>=7?'EP':'UTG';
  if(pos==='UTG+1')return 'EP';
  return 'UTG';
}
const isLate=cp=>['CO','BTN','SB','HU_SB'].includes(cp);
function mkChart(rs,cs){const ch={};parseRange(cs).forEach(k=>ch[k]='c');parseRange(rs).forEach(k=>ch[k]='r');return ch}

function posName(st,p){
  if(!p.inHand)return '';
  const order=[],n=st.players.length;
  for(let k=0;k<n;k++){const q=st.players[(st.dealer+k)%n];if(q.inHand)order.push(q.id)}
  return (POS[order.length]||[])[order.indexOf(p.id)]||'';
}
function gtoPreflop(st,p,maxTo){
  const n=st.players.filter(q=>q.inHand).length,pos=posName(st,p),cp=chartPos(pos,n),key=handKey(p.cards),bb=st.cfg.bb,r=st.raises;
  const toCall=Math.min(st.currentBet-p.bet,p.stack);
  let chart,scen,rl,fl='弃牌',sizeTo;
  if(r===0){
    const limpers=st.players.filter(q=>q!==p&&alive(q)&&q.id!==st.bbId&&q.bet>=bb).length;
    if(cp==='BB'){chart=mkChart(CH.RFI.HJ,'');rl='加注';fl='过牌';sizeTo=(4+limpers)*bb;scen=`${limpers} 人平跟入池，你在大盲。强牌加注惩罚跛入者，其余免费看翻牌。`}
    else{chart=mkChart(CH.RFI[cp],'');rl=limpers?'加注隔离':'开池加注';sizeTo=((cp==='SB'?3:2.5)+limpers)*bb;
      scen=limpers?`前面 ${limpers} 人平跟（跛入），按${POS_CN[cp]}开池范围加注隔离。`:`前面无人入池，你在 ${pos}（${POS_CN[cp]}）。`}
  }else if(r===1){
    const op=st.players[st.preRaisers[0]],oc=chartPos(posName(st,op),n);
    const k=cp==='BB'?(oc==='HU_SB'?'BB_hu':isLate(oc)?'BB_late':'BB_early'):cp==='SB'?(isLate(oc)?'SB_late':'SB_early'):(isLate(oc)?'IP_late':'IP_early');
    chart=mkChart(...CH.VS[k]);rl='3-bet';sizeTo=st.currentBet*(cp==='SB'||cp==='BB'?4:3);
    scen=`${esc(op.name)}（${posName(st,op)}）开池加注，你在 ${pos}。`;
  }else if(r===2){
    const opened=st.preRaisers[0]===p.id;
    chart=mkChart(...CH.V3[opened?(isLate(cp)?'late':'early'):'cold']);rl='4-bet';sizeTo=st.currentBet*2.3;
    const tb=st.players[st.preRaisers[1]];
    scen=opened?`你开池后被${tb?esc(tb.name):'对手'} 3-bet。`:'前面已经有人加注和 3-bet。';
  }else{
    chart=mkChart(...CH.V4[st.preRaisers.includes(p.id)?'opener':'cold']);rl='全下';sizeTo=maxTo;
    scen='已经到了 4-bet 以上，只用最强的牌继续。';
  }
  const a=chart[key]||'f';
  let rec;
  if(a==='r'&&maxTo>st.currentBet){const to=Math.min(maxTo,Math.max(roundU(st,sizeTo),st.currentBet+st.minRaise));rec={type:'raise',to,allIn:to>=maxTo}}
  else if(a!=='f')rec={type:toCall>0?'call':'check'};
  else rec={type:toCall>0?'fold':'check'};
  const labels={r:rl,c:'跟注',f:fl};
  const contPct=comboCount(Object.keys(chart))/1326;
  const why=`${scen}${key} 在这里的 GTO 策略是<b>${labels[a]}</b>。这个局面下约 ${pct(contPct)} 的起手牌会继续。`;
  return {rec,why,chart,key,cp,labels,premium:parseRange('JJ+,AQs+,AKo').has(key),trash:!parseRange(CH.RFI.BTN).has(key)&&!parseRange(CH.VS.BB_late[1]).has(key)};
}

/* ---------- opponent range model ---------- */
let RANK=null;
function ensureRank(){
  if(RANK)return RANK;
  const sc=ALL_KEYS.map(k=>[k,equity(COMBOS[k][0],[],1,400)]).sort((x,y)=>y[1]-x[1]);
  let cum=0;RANK=sc.map(([k])=>{const lo=cum/1326;cum+=COMBOS[k].length;return {k,lo}});
  return RANK;
}
function band(lo,hi){return ensureRank().filter(x=>x.lo>=lo&&x.lo<hi).map(x=>x.k)}
const popc=x=>{let n=0;while(x){x&=x-1;n++}return n};
/* 0 = nothing, 1 = draw, 2 = made hand using a hole card, 3 = two pair or better using a hole card */
function handClass(c0,c1,b){
  const bc=b.length?evalCards(b)>>20:0,hc=evalCards([c0,c1,...b])>>20;
  if(hc>bc)return hc>=2?3:2;
  if(b.length<5){
    const suit=[0,0,0,0];[c0,c1,...b].forEach(c=>suit[c&3]++);
    for(let s=0;s<4;s++)if(suit[s]>=4&&((c0&3)===s||(c1&3)===s))return 1;
    let m=0,hb=0;
    const add=(c,h)=>{const r=(c>>2)+1;m|=1<<r;if(r===13)m|=1;if(h){hb|=1<<r;if(r===13)hb|=1}};
    add(c0,1);add(c1,1);b.forEach(c=>add(c,0));
    for(let w=0;w<=9;w++){const win=31<<w;if(popc(m&win)>=4&&(hb&win))return 1}
  }
  return 0;
}
function passLine(c0,c1,post,board){
  for(const r of post){
    const cls=handClass(c0,c1,board.slice(0,r.n));
    const pr=r.k==='a'?(cls>=2?1:cls===1?0.8:0.3):r.k==='c'?(cls>=2?1:cls===1?0.9:0.4):(cls>=3?0.55:1);
    if(Math.random()>pr)return false;
  }
  return true;
}
const STAMP=new Int32Array(52);let stampN=0;
function equityRanges(hole,board,opps,iters){
  const dead=new Set([...hole,...board]),deck=[];for(let c=0;c<52;c++)if(!dead.has(c))deck.push(c);
  const mine=new Array(7),tmp=new Array(7),oh=new Array(opps.length);let score=0;
  for(let it=0;it<iters;it++){
    const st=++stampN;
    for(let o=0;o<opps.length;o++){
      const cb=opps[o].combos;let pick=null;
      for(let t=0;t<24;t++){
        const x=cb[Math.floor(Math.random()*cb.length)];
        if(STAMP[x[0]]===st||STAMP[x[1]]===st)continue;
        if(!pick)pick=x;
        if(!opps[o].post.length||passLine(x[0],x[1],opps[o].post,board)){pick=x;break}
      }
      if(!pick){const f=deck.filter(c=>STAMP[c]!==st);pick=[f[0],f[1]]}
      STAMP[pick[0]]=st;STAMP[pick[1]]=st;oh[o]=pick;
    }
    for(let k=0;k<5;k++){
      if(k<board.length)mine[k+2]=board[k];
      else{let c;do{c=deck[Math.floor(Math.random()*deck.length)]}while(STAMP[c]===st);STAMP[c]=st;mine[k+2]=c}
      tmp[k+2]=mine[k+2];
    }
    mine[0]=hole[0];mine[1]=hole[1];
    const my=evalCards(mine);let ties=0,lost=false;
    for(let o=0;o<opps.length;o++){tmp[0]=oh[o][0];tmp[1]=oh[o][1];const s=evalCards(tmp);if(s>my){lost=true;break}if(s===my)ties++}
    if(!lost)score+=1/(ties+1);
  }
  return score/iters;
}
function buildCombos(keys,dead){
  const out=[];for(const k of keys)for(const c of (COMBOS[k]||[]))if(!dead.has(c[0])&&!dead.has(c[1]))out.push(c);
  return out;
}

/* ---------- coach (runs on each player's own device, from their own view) ---------- */
function advise(st,p){
  const opps=st.players.filter(q=>q!==p&&alive(q)),opp=opps.length;
  const dead=new Set([...p.cards,...st.board]);
  const rs=opps.map(q=>{let combos=buildCombos(q.pre||ALL_KEYS,dead);if(!combos.length)combos=buildCombos(ALL_KEYS,dead);return {combos,post:q.post||[]}});
  const e=opp?equityRanges(p.cards,st.board,rs,1500):1;
  const eRand=equity(p.cards,st.board,opp,600);
  const oppInfo=opps.map(q=>({name:q.name,line:(q.line||[]).join(' → ')||'尚未行动',pct:q.pre?comboCount(q.pre)/1326:1,post:(q.post||[]).some(r=>r.k!=='x')}));
  const pot=potOf(st),toCall=Math.min(st.currentBet-p.bet,p.stack);
  const fair=1/(opp+1),strong=fair+(1-fair)*0.35;
  const maxTo=p.bet+p.stack,canRaise=maxTo>st.currentBet;
  const sizeTo=f=>Math.min(maxTo,st.currentBet+Math.max(st.minRaise,roundU(st,f*(pot+toCall))));
  const po=toCall>0?toCall/(pot+toCall):0;
  const evCall=e*(pot+toCall)-toCall;
  let rec,why,pre=null;
  if(st.street==='preflop'){pre=gtoPreflop(st,p,maxTo);rec=pre.rec;why=pre.why}
  else if(toCall===0){
    if(e>=strong&&canRaise){rec={type:'raise',to:sizeTo(0.66)};why=`胜率 ${pct(e)} 明显高于平均水平 ${pct(fair)}（${opp} 名对手时每人平均胜率），下注约 2/3 底池让较弱的牌付钱。`}
    else{rec={type:'check'};why=e>=fair?`胜率 ${pct(e)} 略高于平均 ${pct(fair)}，但不算强，免费看牌更稳。`:`胜率 ${pct(e)} 低于平均 ${pct(fair)}，没有理由主动投入筹码，过牌即可。`}
  }else{
    if(e<po){rec={type:'fold'};why=`跟注需要至少 ${pct(po)} 的胜率才不亏（底池赔率），你只有 ${pct(e)}。长期每次跟注约亏 ${fmt(-evCall)}。`;
      if(e>po*0.85&&st.street!=='river')why+=' 差距不大，如果对手筹码很深、你中牌后能多赢，可以考虑跟注（隐含赔率）。'}
    else if(e>=strong&&canRaise){rec={type:'raise',to:sizeTo(0.75)};why=`胜率 ${pct(e)} 远超所需的 ${pct(po)}，牌力领先，加注扩大底池获取价值。`}
    else{rec={type:'call'};why=`胜率 ${pct(e)} 高于底池赔率要求的 ${pct(po)}，跟注长期有利（每次约 +${fmt(evCall)}），但牌力不足以加注。`}
  }
  if(rec.type==='raise'&&rec.to>=maxTo)rec.allIn=true;
  const made=st.board.length?handName(evalCards([...p.cards,...st.board])):preflopDesc(p.cards);
  return {e,eRand,oppInfo,pre,opp,pot,toCall,po,evCall,fair,strong,rec,why,made,street:st.street,hand:st.handNo,cards:[...p.cards],board:[...st.board],pos:posName(st,p),bb:st.cfg.bb,cb:st.currentBet};
}
/* ---------- opponent profiles + exploit advice ---------- */
const MIN_H=12;
const pct0=x=>Math.round(x*100)+'%';
function profile(p){
  const s=p.st||{h:0},h=s.h||0;
  const vpip=h?s.vp/h:0,pfr=h?s.pf/h:0,af=s.calls?s.bets/s.calls:(s.bets||0),fvb=s.fbO?s.fb/s.fbO:null,acts=(s.bets||0)+(s.calls||0);
  let type='样本不足',key='unknown';
  if(h>=MIN_H){
    if(vpip>=0.45&&af<1.2){type='跟注站';key='station'}
    else if(vpip>=0.31&&(af>=1.4||pfr>=vpip*0.5)){type='松凶';key='lag'}
    else if(vpip<=0.22&&af<2&&(fvb==null||fvb>=0.45)){type='紧弱';key='nit'}
    else if(vpip<=0.3&&(pfr>=vpip*0.5||af>=2)){type='紧凶';key='tag'}
    else{type='常规';key='reg'}
  }
  return {h,vpip,pfr,af,fvb,fbO:s.fbO||0,acts,type,key};
}
const PROFILE_PILL={station:'info',lag:'bad',maniac:'bad',nit:'good',tag:'warn',reg:'brass',zagg:'bad',zblind:'info',znit:'good',unknown:''};
const EXPLOIT_TIP={
  station:'很少弃牌：别诈唬他，中等牌也下注拿价值，下注尺寸可以加大。',
  lag:'下注范围很宽：中等牌多跟注抓诈唬，少主动诈唬他。',
  nit:'遇到下注常常弃牌：多偷盲、多诈唬；他反击时通常是强牌。',
  tag:'打法标准：接近 GTO 即可，别乱诈唬。',
  reg:'没有明显漏洞：按 GTO 打。',
  maniac:'极度激进，什么牌都敢加注：别和他比诈唬，用中强牌跟到底让他自己撞上来。',
  unknown:'样本不足：先按 GTO 打，继续观察。'
};
function exploitAdvice(st,p,a){
  const opps=st.players.filter(q=>q!==p&&alive(q));if(!opps.length)return null;
  const toCall=a.toCall,maxTo=p.bet+p.stack,canRaise=maxTo>st.currentBet,pot=a.pot,bb=st.cfg.bb;
  const sizeTo=f=>Math.min(maxTo,st.currentBet+Math.max(st.minRaise,roundU(st,f*(pot+toCall))));
  const key=handKey(p.cards),nm=q=>esc(q.name);
  const out=(rec,target,text)=>({rec,target,text});
  if(st.street==='preflop'){
    const n=st.players.filter(q=>q.inHand).length,cp=chartPos(posName(st,p),n);
    if(st.raises===0&&toCall>0&&isLate(cp)&&a.rec.type!=='raise'&&canRaise&&parseRange(CH.RFI.BTN).has(key)){
      const blinds=[st.sbId,st.bbId].map(i=>st.players[i]).filter(q=>q&&q!==p&&alive(q));
      if(blinds.length&&blinds.every(q=>profile(q).key==='nit'))
        return out({type:'raise',to:Math.min(maxTo,roundU(st,2.5*bb))},blinds.map(q=>q.name).join('、'),`盲注位的 ${blinds.map(nm).join('、')} 都很紧，遇到加注常常弃牌，可以用更宽的范围偷盲。`);
    }
    if(st.raises===1){
      const op=st.players[st.preRaisers[0]],pr=profile(op);
      if(pr.h>=MIN_H&&pr.pfr>=0.28&&a.rec.type==='call'&&canRaise&&parseRange('99+,ATs+,KJs+,QJs,AJo+,KQo').has(key))
        return out({type:'raise',to:Math.min(maxTo,roundU(st,st.currentBet*3))},op.name,`${nm(op)} 开池加注率 ${pct0(pr.pfr)}，范围很宽，${key} 可以直接 3-bet 拿价值。`);
      if(pr.key==='nit'&&a.rec.type==='call'&&!parseRange('TT+,AQs+,AKo').has(key))
        return out({type:'fold'},op.name,`${nm(op)} 很紧（入池率 ${pct0(pr.vpip)}），他开池通常是强牌，${key} 这类边缘牌弃掉更好。`);
    }
    if(opps.length===1){const pr=profile(opps[0]);return out(null,opps[0].name,`${nm(opps[0])}（${pr.type}）${EXPLOIT_TIP[pr.key]}`)}
    return null;
  }
  const tgt=toCall>0?(opps.find(q=>q.bet===st.currentBet)||opps[0]):(opps.length===1?opps[0]:null);
  if(!tgt)return null;
  const pr=profile(tgt);
  if(toCall===0){
    if(pr.fvb!=null&&pr.fbO>=6&&pr.fvb>=0.6&&a.rec.type==='check'&&canRaise)
      return out({type:'raise',to:sizeTo(0.5)},tgt.name,`${nm(tgt)} 面对下注的弃牌率是 ${pct0(pr.fvb)}。半池诈唬只要他弃牌超过 33% 就有利可图。`);
    if(pr.key==='station'&&a.rec.type==='raise')
      return out({type:'raise',to:sizeTo(1)},tgt.name,`${nm(tgt)} 是跟注站，强牌把下注加大到 1 倍底池，他照样会跟。`);
    if(pr.key==='station'&&a.rec.type==='check')
      return out(null,tgt.name,`${nm(tgt)} 是跟注站，诈唬他没用，过牌是对的。`);
  }else if(pr.h>=MIN_H&&pr.acts>=8){
    if(pr.af>=2.5&&a.rec.type==='fold'&&a.e>=a.po*0.75)
      return out({type:'call'},tgt.name,`${nm(tgt)} 激进度 ${pr.af.toFixed(1)} 很高，下注里诈唬多，胜率差一点也可以跟注抓诈唬。`);
    if(pr.af<=0.8&&a.rec.type==='call'&&a.e<a.po*1.4)
      return out({type:'fold'},tgt.name,`${nm(tgt)} 很少主动下注（激进度 ${pr.af.toFixed(1)}），他下注通常是强牌，边缘牌弃掉更好。`);
  }
  return out(null,tgt.name,`${nm(tgt)}（${pr.type}）${EXPLOIT_TIP[pr.key]}`);
}

function preflopDesc(c){const r1=c[0]>>2,r2=c[1]>>2;if(r1===r2)return '口袋对子';return ((c[0]&3)===(c[1]&3)?'同花':'不同花')+(Math.abs(r1-r2)===1?'连张':'')}
function recLabel(rec,toCall,cb){
  if(!rec)return '';
  if(rec.type==='fold')return '弃牌';
  if(rec.type==='check')return '过牌';
  if(rec.type==='call')return `跟注 ${fmt(toCall)}`;
  return (rec.allIn?'全下 ':(cb===0?'下注 ':'加注到 '))+fmt(rec.to);
}
function gradePre(a,type){
  const g=a.pre,want=a.rec.type,L=g.labels;
  const r=(k,note)=>({g:k,note,loss:0});
  if(type===want)return r('good',`符合 GTO 范围：${g.key} 在这里应该${want==='raise'?L.r:want==='call'?'跟注':want==='check'?'过牌':'弃牌'}。`);
  if(want==='raise'&&type==='call')return r('minor',`GTO 范围里 ${g.key} 应该${L.r}，只跟注会让对手便宜看翻牌。`);
  if(want==='raise'&&type==='check')return r('minor',`${g.key} 可以加注，惩罚平跟入池的对手。`);
  if(want==='raise'&&type==='fold')return r(g.premium?'mistake':'minor',`${g.key} 在${L.r}范围里，弃牌太紧了。`);
  if(want==='call'&&type==='raise')return r('ok',`比 GTO 更激进。${g.key} 在这里通常只跟注。`);
  if(want==='call'&&type==='fold')return r('minor',`${g.key} 有足够价值跟注，弃牌偏紧。`);
  if(want==='fold')return r(g.trash?'mistake':'minor',`${g.key} 不在这个局面的 GTO 入池范围里，长期玩这类牌会亏。`);
  if(want==='check'&&type==='raise')return r('ok','大盲可以免费看翻牌，加注偏激进。');
  if(want==='check'&&type==='fold')return r('mistake','大盲可以免费看翻牌，不该弃牌。');
  return r('ok','');
}
function grade(a,type){
  if(a.pre)return gradePre(a,type);
  const bb=a.bb,rt=a.rec.type;let g='good',note='和建议一致。',loss=0;
  if(a.toCall>0){
    if(type==='fold'){if(rt!=='fold'){loss=Math.max(0,a.evCall);g=loss>=bb?'mistake':'minor';note=`胜率够跟注却弃牌了，放弃了约 ${fmt(loss)} 的期望收益。`}}
    else if(rt==='fold'){loss=Math.max(0,-a.evCall);g=loss>=bb?'mistake':'minor';note=`胜率不够还继续投入，这次约亏 ${fmt(loss)} 的期望值。`+(type==='raise'?'加注可能逼走对手（诈唬），但要控制频率。':'')}
    else if(type==='call'&&rt==='raise'){g='minor';note='牌很强，只跟注会少赢。可以加注拿价值。'}
    else if(type==='raise'&&rt==='call'){g='ok';note='偏激进。胜率够跟，但加注会让强牌对手入池，小心被反加。'}
  }else{
    if(type==='fold'){loss=a.e*a.pot;g='mistake';note='可以免费过牌却弃牌了，平白放弃了这手牌的权益。'}
    else if(type==='check'&&rt==='raise'){g='minor';note='牌力领先却过牌，错过了从对手那里拿价值的机会。'}
    else if(type==='raise'&&rt==='check'){g='ok';note=a.e<a.fair*0.8?'这是一次诈唬。偶尔可以，但频率太高会亏。':'下注偏薄，被跟注时常常落后。'}
  }
  return {g,note,loss};
}

/* public-action stats for opponent profiling */
function trackStats(p,type,toCall){
  const s=p.st,f=p.hf;if(!f)return;
  if(S.street==='preflop'){
    if(type==='call'||type==='raise')f.vp=1;
    if(type==='raise')f.pf=1;
    if(S.raises===1){f.tbO=1;if(type==='raise')f.tb=1}
  }else{
    if(type==='raise')s.bets++;else if(type==='call')s.calls++;
    if(toCall>0){s.fbO++;if(type==='fold')s.fb++}
  }
}
function proceed(){
  if(isZ(S))return zProceed();
  if(isD(S))return ddProceed();
  if(S.phase!=='playing')return;
  const al=P().filter(alive);
  if(al.length===1)return winUncontested(al[0]);
  const actors=P().filter(canAct).length;
  const needs=p=>S.needAct[p.id]&&canAct(p)&&(actors>1||p.bet<S.currentBet);
  if(!P().some(needs))return endStreet();
  if(S.toAct<0||!needs(P()[S.toAct]))S.toAct=nextIdx(S.toAct<0?S.dealer:S.toAct,needs);
  const p=P()[S.toAct],id=p.id,hn=S.handNo;
  sync();
  clearTimeout(timer);
  const still=()=>S&&S.phase==='playing'&&S.toAct===id&&S.handNo===hn;
  if(isBot(p))timer=setTimeout(()=>{if(still())aiAct(p)},delay());
  else if(!present(p))timer=setTimeout(()=>{if(still())act(p,S.currentBet>p.bet?'fold':'check')},Math.max(400,(p.discAt||0)+DISC_GRACE-Date.now()));
}
function trackRange(p,type){
  if(type==='fold')return;
  if(S.street==='preflop'){
    const prior=S.raises,n=P().filter(q=>q.inHand).length;let nr=null,label='';
    if(type==='raise'){
      if(prior===0){const cp=chartPos(posName(S,p),n);nr=cp==='BB'?band(0,.15):[...parseRange(CH.RFI[cp])];label=`${posName(S,p)} 开池加注`}
      else if(prior===1){nr=band(0,.07);label='3-bet'}
      else{nr=band(0,.03);label=prior===2?'4-bet':'再加注'}
      S.preRaisers.push(p.id);
    }else if(type==='call'){
      if(prior===0){nr=band(.04,.55);label='平跟入池'}
      else if(prior===1){nr=p.id===S.bbId?band(.03,.62):band(.04,.4);label='跟注加注'}
      else{nr=band(.02,.14);label='跟注 3-bet'}
    }else label='大盲过牌';
    if(nr){if(p.pre){const s=new Set(nr),x=p.pre.filter(k=>s.has(k));p.pre=x.length?x:nr}else p.pre=nr}
    p.line.push(label);
  }else{
    p.post.push({n:S.board.length,k:type==='raise'?'a':type==='call'?'c':'x'});
    p.line.push(STREET_CN[S.street]+(type==='raise'?(S.currentBet===0?'下注':'加注'):type==='call'?'跟注':'过牌'));
  }
}
function act(p,type,to){
  if(isZ(S))return zAct(p,type,to);
  if(isD(S))return ddAct(p,type,to);
  const toCall=Math.min(S.currentBet-p.bet,p.stack);
  if(type==='raise'&&!(to>0))to=S.currentBet+S.minRaise;
  if(type==='raise'&&Math.min(to,p.bet+p.stack)<=S.currentBet)type=toCall>0?'call':'check';
  if(type==='call'&&toCall===0)type='check';
  if(type==='check'&&toCall>0)type='fold';
  if(type==='raise'){const minTo=S.currentBet+S.minRaise;if(to<minTo)to=minTo}
  trackStats(p,type,toCall);
  trackRange(p,type);
  const wasOpen=S.currentBet===0;
  let text='';
  if(type==='fold'){p.folded=true;p.foldAt=S.board.length;text='弃牌'}
  else if(type==='check'){text='过牌'}
  else if(type==='call'){put(p,toCall);text=p.allIn?`跟注 ${fmt(toCall)}（全下）`:`跟注 ${fmt(toCall)}`}
  else{
    to=Math.min(to,p.bet+p.stack);
    const prev=S.currentBet;put(p,to-p.bet);
    const inc=to-prev;if(inc>=S.minRaise)S.minRaise=inc;
    S.currentBet=to;S.raises++;
    P().forEach(q=>{if(q.id!==p.id&&canAct(q))S.needAct[q.id]=true});
    text=(prev===0?'下注 ':'加注到 ')+fmt(to)+(p.allIn?'（全下）':'');
  }
  S.needAct[p.id]=false;p.lastAction=text;log(`${p.name}：${text}`);
  S.ev={seq:(S.ev?S.ev.seq:0)+1,pid:p.id,type,allIn:p.allIn&&type!=='fold'&&type!=='check',open:wasOpen};
  if(isBot(p)){
    if(S.ev.allIn&&Math.random()<0.35)botChat(p,['梭了！','我全下了，你敢跟吗','来吧，一把定输赢']);
    else if(type==='fold'&&toCall>=S.cfg.bb*10&&Math.random()<0.12)botChat(p,['这把我不玩了','算了算了','你赢了']);
  }
  S.toAct=nextIdx(p.id,q=>canAct(q)&&S.needAct[q.id]);
  proceed();
}
function dealNext(){
  const n=S.street==='preflop'?3:1;
  for(let i=0;i<n;i++)S.board.push(S.deck.pop());
  S.street=S.street==='preflop'?'flop':S.street==='flop'?'turn':'river';
  log(`${STREET_CN[S.street]}：${S.board.map(cardTxt).join(' ')}`,'board-l');
}
function endStreet(){
  P().forEach(p=>{p.bet=0;if(alive(p))p.lastAction=p.allIn?'全下':''});
  S.currentBet=0;S.minRaise=S.cfg.bb;S.raises=0;
  if(S.street==='river')return showdown();
  if(P().filter(canAct).length<=1){S.phase='runout';P().forEach(p=>{if(alive(p))p.shown=true});S.msg='全下，直接发完公共牌';return runOut()}
  dealNext();
  S.needAct=P().map(canAct);S.toAct=nextIdx(S.dealer,canAct);
  proceed();
}
function runOut(){sync();const hn=S.handNo;clearTimeout(timer);timer=setTimeout(()=>{if(!S||S.handNo!==hn||S.phase!=='runout')return;if(S.street==='river')showdown();else{dealNext();runOut()}},Math.max(600,delay()*1.4))}
function showdown(){
  const al=P().filter(alive),u=S.cfg.sb;
  al.forEach(p=>{p.score=evalCards([...p.cards,...S.board]);p.shown=true;p.handName=handName(p.score)});
  distributePots(al,u);
  const top=P().filter(p=>p.won>0).sort((a,b)=>b.won-a.won);
  S.msg=top.map(w=>`${w.name} 以${w.handName}赢得 ${fmt(w.won)}`).join('；');
  al.forEach(p=>log(`${p.name} 亮牌 ${p.cards.map(cardTxt).join(' ')}：${p.handName}`));
  log(S.msg,'win-l');
  P().forEach(p=>{p.bet=0;delete p.score});
  endHand();
}
/* ---------- AI ---------- */
/* preflop: start from the GTO chart, then bend it by the bot's style */
function aiPreflop(p){
  const maxTo=p.bet+p.stack,g=gtoPreflop(S,p,maxTo),toCall=Math.min(S.currentBet-p.bet,p.stack),r=Math.random();
  const wide=parseRange(CH.RFI.BTN).has(g.key),prem=g.premium,A=p.ai||(p.ai=genAI(p.style)),r2=Math.random();
  let t=g.chart[g.key]||'f';
  if(t==='f'){
    if(wide&&r<A.loosenWide)t=r2<A.raiseUp&&S.raises===0?'r':'c';
    else if(toCall>0&&toCall<=S.cfg.bb*4&&r2<A.loosenAny)t='c';
  }else if(t==='c'){
    if(r<A.raiseUp)t='r';else if(!prem&&r2<A.tighten)t='f';
  }else if(!prem){
    if(r<A.passive)t='c';else if(r2<A.tighten*0.6)t=S.raises===0?'f':'c';
  }
  if(t==='r'&&(S.raises>=4||maxTo<=S.currentBet))t='c';
  if(t==='r')return act(p,'raise',g.rec.type==='raise'?g.rec.to:Math.min(maxTo,roundU(S,Math.max(S.currentBet+S.minRaise,S.currentBet*3))));
  if(t==='c')return act(p,toCall>0?'call':'check');
  return act(p,toCall>0?'fold':'check');
}
function aiAct(p){
  if(isZ(S))return zAiAct(p);
  if(S.street==='preflop')return aiPreflop(p);
  const st=p.ai||STYLES[p.style]||STYLES.tag;
  const opp=P().filter(q=>q!==p&&alive(q)).length;
  const e=equity(p.cards,S.board,opp,S.board.length?240:180);
  const pot=potOf(S),toCall=Math.min(S.currentBet-p.bet,p.stack);
  const fair=1/(opp+1),strong=fair+(1-fair)*0.33;
  const r=Math.random(),eAdj=e+st.loose;
  const maxTo=p.bet+p.stack,canRaise=maxTo>S.currentBet&&S.raises<4;
  const sizeTo=f=>Math.min(maxTo,S.currentBet+Math.max(S.minRaise,roundU(S,f*(pot+toCall))));
  if(toCall===0){
    if(canRaise&&((e>=strong&&r<st.aggr+0.15)||(r<st.bluff&&eAdj>fair*0.55)))return act(p,'raise',sizeTo(0.5+Math.random()*0.5));
    return act(p,'check');
  }
  const po=toCall/(pot+toCall);
  if(eAdj+st.margin<po){
    if(canRaise&&S.street!=='river'&&r<st.bluff*0.5)return act(p,'raise',sizeTo(0.7));
    return act(p,'fold');
  }
  if(canRaise&&e>=strong&&r<st.aggr)return act(p,'raise',sizeTo(0.6+Math.random()*0.4));
  return act(p,'call');
}
