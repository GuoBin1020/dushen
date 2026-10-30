/* 赌神智慧树 · 炸金花: hand ranking, blind/seen betting, compare, bots, coach and table pieces */
'use strict';

/* =====================================================================
   ZHA JIN HUA (炸金花): 3 cards, blind/seen betting, compare to knock players out.
   Same table, network, ledger and chat as hold'em; only the hand flow differs.
   Rules used: ante each hand; a blind player pays 1x the stake, a player who has looked pays 2x;
   raises lift the stake up to a cap; from round 2 a player may pay one call to compare with
   another player, and the smaller hand (ties: whoever asked) is out; at the round limit everyone left shows down.
   ===================================================================== */
const isZ=st=>!!(st&&st.cfg&&st.cfg.game==='zjh');
const ZCAT=['单张','对子','顺子','金花','同花顺','豹子'];
/* score = category<<12 | three 4-bit ranks; A-2-3 is the smallest straight */
function zEval(c){
  const r=c.map(x=>x>>2).sort((a,b)=>b-a),s=c.map(x=>x&3);
  const flush=s[0]===s[1]&&s[1]===s[2];
  let st=-1;
  if(r[0]-r[1]===1&&r[1]-r[2]===1)st=r[0];
  else if(r[0]===12&&r[1]===1&&r[2]===0)st=1;
  let cat,k;
  if(r[0]===r[2]){cat=5;k=[r[0]]}
  else if(st>=0&&flush){cat=4;k=[st]}
  else if(flush){cat=3;k=r}
  else if(st>=0){cat=2;k=[st]}
  else if(r[0]===r[1]||r[1]===r[2]){cat=1;k=[r[1],r[0]===r[1]?r[2]:r[0]]}
  else{cat=0;k=r}
  return (cat<<12)|((k[0]||0)<<8)|((k[1]||0)<<4)|(k[2]||0);
}
const zName=sc=>ZCAT[sc>>12];
/* 2-3-5 of mixed suits: the smallest high-card hand, but it beats 豹子 when the rule is on */
const z235=c=>{const r=c.map(x=>x>>2).sort((a,b)=>b-a),s=c.map(x=>x&3);return r[0]===3&&r[1]===1&&r[2]===0&&!(s[0]===s[1]&&s[1]===s[2])};
function zBeats(a,b,cfg){
  if(cfg&&cfg.z235){const ta=zEval(a)>>12===5,tb=zEval(b)>>12===5;if(z235(a)&&tb)return true;if(z235(b)&&ta)return false}
  return zEval(a)>zEval(b);
}
/* winners among several hands: whoever nobody beats; a 235 / 豹子 / other cycle falls back to plain ranking */
function zWinners(elig,cfg){
  const unbeaten=elig.filter(x=>elig.every(y=>y===x||!zBeats(y.cards,x.cards,cfg)));
  if(unbeaten.length)return unbeaten;
  const best=Math.max(...elig.map(p=>p.score));return elig.filter(p=>p.score===best);
}
let ZALL=null;
/* share of all 22,100 three-card hands this hand beats (ties count half) */
function zPct(sc){
  if(!ZALL){ZALL=[];for(let a=0;a<52;a++)for(let b=a+1;b<52;b++)for(let c=b+1;c<52;c++)ZALL.push(zEval([a,b,c]));ZALL.sort((x,y)=>x-y)}
  const A=ZALL,bound=le=>{let lo=0,hi=A.length;while(lo<hi){const m=(lo+hi)>>1;if(le?A[m]<=sc:A[m]<sc)lo=m+1;else hi=m}return lo};
  const lo=bound(false),hi=bound(true);
  return (lo+(hi-lo)/2)/A.length;
}
const zCanAct=p=>alive(p)&&!p.allIn;
const zCost=(st,p)=>(p.seen?2:1)*st.stake;
function zLevels(st){const a=st.cfg.ante;return [2,3,5,8,10,15,20].map(x=>x*a).filter(v=>v>st.stake&&v<=st.cfg.zcap*a)}
/* an opponent who has looked and keeps paying probably holds the top part of the deck */
const zFloor=q=>q.seen?Math.min(0.85,0.2+0.12*(q.zs||0)):0;
function zWinVs(pc,q){const f=zFloor(q),read=pc<=f?0.04:(pc-f)/(1-f);return 0.85*read+0.15*pc}
const zWin=(pc,opps)=>opps.reduce((w,q)=>w*zWinVs(pc,q),1);

function zDeal(live){
  const cfg=S.cfg;
  S.handNo++;S.board=[];S.msg='';
  S.dealer=nextIdx(S.dealer,p=>p.inHand);S.deck=shuffle();
  for(let r=0;r<3;r++){let i=S.dealer;for(let k=0;k<live.length;k++){i=nextIdx(i,p=>p.inHand);P()[i].cards.push(S.deck.pop())}}
  log(`第 ${S.handNo} 手`,'sep');
  live.forEach(p=>{const a=put(p,cfg.ante);p.lastAction=`底注 ${fmt(a)}`});
  log(`每人下底注 ${fmt(cfg.ante)}`);
  Object.assign(S,{street:'zjh',stake:cfg.ante,round:1,raises:0,preRaisers:[],sbId:-1,bbId:-1,currentBet:0,minRaise:0});
  S.toAct=nextIdx(S.dealer,zCanAct);
  S.phase='playing';
  zProceed();
}
function zProceed(){
  if(S.phase!=='playing')return;
  const al=P().filter(alive);
  if(al.length===1)return winUncontested(al[0]);
  const actors=P().filter(zCanAct);
  if(actors.length<=1)return zShowdown('其他人都已全下，直接亮牌比大小');
  if(S.round>S.cfg.zrounds)return zShowdown(`已到 ${S.cfg.zrounds} 轮上限，所有人亮牌比大小`);
  if(S.toAct<0||!zCanAct(P()[S.toAct]))S.toAct=nextIdx(S.toAct<0?S.dealer:S.toAct,zCanAct);
  const p=P()[S.toAct],id=p.id,hn=S.handNo,mark=S.zseq=(S.zseq||0)+1;
  sync();clearTimeout(timer);
  const still=()=>S&&S.phase==='playing'&&S.toAct===id&&S.handNo===hn&&S.zseq===mark;
  if(isBot(p))timer=setTimeout(()=>{if(still())zAiAct(p)},delay());
  else if(!present(p))timer=setTimeout(()=>{if(still())zAct(p,'fold')},Math.max(400,(p.discAt||0)+DISC_GRACE-Date.now()));
}
function zStat(p,type,wonCmp){
  const s=p.st;
  s.zacts=(s.zacts||0)+1;if(!p.seen)s.zblind=(s.zblind||0)+1;
  if(type==='raise')s.zraise=(s.zraise||0)+1;
  if(type==='fold')s.zfold=(s.zfold||0)+1;
  if(type==='compare'){s.zcmp=(s.zcmp||0)+1;if(wonCmp)s.zcmpw=(s.zcmpw||0)+1}
}
function zAct(p,type,arg){
  if(S.phase!=='playing'||S.toAct!==p.id)return;
  const nextEv=o=>{S.ev={seq:(S.ev?S.ev.seq:0)+1,pid:p.id,...o}};
  if(type==='look'){
    if(p.seen)return;
    p.seen=true;p.lastAction='看牌';log(`${p.name}：看牌`);nextEv({type:'look'});sync();return;
  }
  if(type==='check')type='fold';
  let cost=zCost(S,p);
  if(type==='raise'){
    const lv=zLevels(S).filter(v=>p.stack>(p.seen?2:1)*v);
    const ns=lv.includes(+arg)?+arg:lv[0];
    if(ns){S.stake=ns;cost=zCost(S,p)}else type='call';
  }
  if(type==='compare'&&(S.round<2||p.stack<cost||!P()[+arg]||P()[+arg]===p||!alive(P()[+arg])))type='call';
  if((type==='call'||type==='raise')&&p.stack<=cost)type='allin';
  let text='',extra={},cmpWon=false;
  if(type==='fold'){p.folded=true;text='弃牌'}
  else if(type==='call'){put(p,cost);text=`${p.seen?'跟注':'闷跟'} ${fmt(cost)}`;if(p.seen)p.zs++}
  else if(type==='raise'){put(p,cost);S.raises++;text=`${p.seen?'加注':'闷加'}到单注 ${fmt(S.stake)}（付 ${fmt(cost)}）`;p.zs+=p.seen?2:1}
  else if(type==='allin'){const a=put(p,p.stack);text=`全下 ${fmt(a)}`;p.zs+=2}
  else{
    const t=P()[+arg];put(p,cost);
    cmpWon=zBeats(p.cards,t.cards,S.cfg);
    const loser=cmpWon?t:p;
    loser.folded=true;loser.lostCmp=true;
    p.revealTo.push(t.id);t.revealTo.push(p.id);
    text=`和 ${t.name} 比牌（付 ${fmt(cost)}）`;
    extra={target:t.id,loser:loser.id};
    log(`${p.name}：${text}`);log(`比牌结果：${loser.name} 出局`,'win-l');
    loser.lastAction='比牌输了';
    if(!cmpWon)text='';
    const w=cmpWon?p:t;if(isBot(w)&&Math.random()<0.3)botChat(w,['就这？','比就比','承让承让']);
  }
  if(text)p.lastAction=text;
  if(type!=='compare')log(`${p.name}：${text}`);
  nextEv({type,allIn:type==='allin',...extra});
  zStat(p,type,cmpWon);
  if(isBot(p)&&type==='allin'&&Math.random()<0.35)botChat(p,['梭了！','我全下了，你敢跟吗']);
  /* turn passes on; going past the dealer starts the next round */
  const n=P().length,rel=i=>((i-S.dealer)%n+n)%n,nx=nextIdx(p.id,zCanAct);
  if(nx>=0&&rel(nx)<=rel(p.id))S.round++;
  S.toAct=nx;
  zProceed();
}
function zShowdown(reason){
  const al=P().filter(alive);
  al.forEach(p=>{p.score=zEval(p.cards);p.shown=true;p.handName=S.cfg.z235&&z235(p.cards)?'235':zName(p.score)});
  distributePots(al,S.cfg.sb,elig=>zWinners(elig,S.cfg));
  const top=P().filter(p=>p.won>0).sort((a,b)=>b.won-a.won);
  S.msg=(reason?reason+'。':'')+top.map(w=>`${w.name} 以${w.handName}赢得 ${fmt(w.won)}`).join('；');
  al.forEach(p=>log(`${p.name} 亮牌 ${p.cards.map(cardTxt).join(' ')}：${p.handName}`));
  log(S.msg,'win-l');
  P().forEach(p=>{p.bet=0;delete p.score});
  endHand();
}
/* bots: stay blind while it is cheap (longer for loose personalities), then play the seen hand on its estimated win chance */
function zAiAct(p){
  const A=p.ai||(p.ai=genAI(p.style)),ante=S.cfg.ante,opps=P().filter(q=>q!==p&&alive(q)),n=opps.length;
  if(!p.seen){
    const blindRounds=1+Math.round(A.loosenWide*4+A.loosenAny*2);
    if(S.round<=blindRounds&&S.stake<=ante*(2+A.loosenWide*4)&&Math.random()>0.1){
      const lv=zLevels(S).filter(v=>p.stack>v);
      if(lv.length&&Math.random()<A.raiseUp*0.4)return zAct(p,'raise',lv[0]);
      return zAct(p,'call');
    }
    zAct(p,'look');
  }
  const pc=zPct(zEval(p.cards)),win=zWin(pc,opps),pot=potOf(S),cost=zCost(S,p),ev=win*(pot+cost)-cost,r=Math.random();
  const lv=zLevels(S).filter(v=>p.stack>2*v),canCmp=S.round>=2&&p.stack>=cost;
  if(lv.length&&win>=0.72-A.aggr*0.15&&r<A.aggr)return zAct(p,'raise',lv[Math.min(lv.length-1,win>0.9?1:0)]);
  if(lv.length&&pc<0.5&&r<A.bluff*0.4)return zAct(p,'raise',lv[0]);
  if(canCmp&&n===1&&win>=0.5-A.margin)return zAct(p,'compare',opps[0].id);
  if(ev+A.margin*pot>=0||r<A.bluff*0.3)return zAct(p,'call');
  if(canCmp&&win>=0.35&&r<0.5){const t=opps.slice().sort((a,b)=>zFloor(a)-zFloor(b))[0];return zAct(p,'compare',t.id)}
  return zAct(p,'fold');
}

/* ---------- 炸金花: coach, grading, profiles, table pieces ---------- */
function zAdvise(st,p){
  const opps=st.players.filter(q=>q!==p&&alive(q)),n=opps.length,pot=potOf(st),cost=zCost(st,p),ante=st.cfg.ante;
  const lv=zLevels(st).filter(v=>p.stack>(p.seen?2:1)*v),canCmp=st.round>=2&&p.stack>=cost&&n>0,po=cost/(pot+cost);
  const base={game:'zjh',opp:n,pot,toCall:cost,po,street:'zjh',hand:st.handNo,round:st.round,seen:p.seen,bb:ante,cb:st.stake,
    cards:p.seen?[...p.cards]:[],oppInfo:opps.map(q=>({name:q.name,line:(q.seen?'已看牌':'闷牌')+(q.zs?` · 看牌后跟注或加注 ${q.zs} 次`:''),pct:1-zFloor(q),post:false}))};
  if(!p.seen){
    const lookNow=st.round>=3||st.stake>=ante*3||pot>=ante*12;
    return {...base,e:0,eRand:0,evCall:0,rec:{type:lookNow?'look':'call'},
      why:lookNow?`底池已经 ${fmt(pot)}（${Math.round(pot/ante)} 倍底注），再闷下去风险太大，先看牌再决定。`
        :`现在闷跟只要 ${fmt(cost)}，看牌后跟注要翻倍（${fmt(cost*2)}）。前几轮很便宜，可以先闷着。`};
  }
  const sc=zEval(p.cards),pc=zPct(sc),win=zWin(pc,opps),winR=Math.pow(pc,n),ev=win*(pot+cost)-cost;
  const weakest=opps.slice().sort((a,b)=>zFloor(a)-zFloor(b))[0];
  const note235=st.cfg.z235&&z235(p.cards)?' 你拿的是 235，平时是最小的单张，只有遇到豹子才能赢。':'';
  let rec,why;
  if(win>=0.65&&lv.length){rec={type:'raise',to:lv[0]};why=`${zName(sc)}强于 ${pct(pc)} 的牌，估计胜率 ${pct(win)}，加注让对手多付钱。`}
  else if(canCmp&&n===1&&win>=0.5){rec={type:'compare',target:opps[0].id,tname:opps[0].name};why=`只剩一个对手，你估计领先（胜率 ${pct(win)}），比牌直接锁定底池，免得被对方继续加注。`}
  else if(ev>=0){rec={type:'call'};why=`跟注需要 ${pct(po)} 的胜率，你估计有 ${pct(win)}，跟下去长期有利（约 ${sgn(ev)}）。`}
  else if(canCmp&&win>=0.4&&weakest){rec={type:'compare',target:weakest.id,tname:weakest.name};why=`一直跟下去不划算，但胜率还有 ${pct(win)}。花一次跟注和看起来最弱的 ${esc(weakest.name)} 比牌，比继续耗更省钱。`}
  else{rec={type:'fold'};why=`跟注需要 ${pct(po)} 的胜率，你只有约 ${pct(win)}。${zName(sc)}在这里偏弱，弃牌止损。`}
  return {...base,e:win,eRand:winR,pct:pc,name:note235?'235':zName(sc),evCall:ev,rec,why:why+note235};
}
function zRecLabel(rec,a){
  if(!rec)return '';const t=rec.type;
  if(t==='look')return '看牌';if(t==='fold')return '弃牌';if(t==='allin')return '全下';
  if(t==='call')return (a.seen?'跟注 ':'闷跟 ')+fmt(a.toCall);
  if(t==='raise')return `加到单注 ${fmt(rec.to)}`;
  if(t==='compare')return `和 ${esc(rec.tname||'对手')} 比牌`;
  return t;
}
function zGrade(a,type){
  const rt=a.rec.type,bb=a.bb,r=(g,note,loss=0)=>({g,note,loss});
  if(type===rt)return r('good','和建议一致。');
  if(!a.seen){
    if(type==='fold')return r('minor','闷牌时弃牌等于白送底注，至少先看一眼牌再决定。');
    if(rt==='look')return r('minor','底池已经变大，继续闷牌风险高，建议先看牌。');
    if(type==='raise')return r('ok','闷牌加注很激进，偶尔可以给对手压力。');
    if(type==='compare')return r('ok','闷牌比牌全凭运气，相当于抛硬币。');
    return r('ok','');
  }
  const ev=a.evCall;
  if(type==='fold'&&ev>0)return r(ev>=bb?'mistake':'minor',`胜率够跟注却弃牌了，放弃了约 ${fmt(ev)} 的期望收益。`,ev);
  if(rt==='fold'){const loss=Math.max(0,-ev);return r(loss>=bb?'mistake':'minor',type==='compare'?`牌力偏弱，比牌输面大，这次约亏 ${fmt(loss)} 的期望值。`:`胜率不够还继续投入，这次约亏 ${fmt(loss)} 的期望值。`,loss)}
  if(rt==='raise'&&type==='call')return r('minor','牌很强，只跟注会少赢，可以加注让对手多付钱。');
  if(rt==='compare'&&type==='call')return r('ok','也可以，不过你领先时直接比牌能早点锁定底池。');
  if(rt==='call'&&type==='compare')return r('ok','比牌会马上分出胜负，你的牌力一般，结果比较看运气。');
  if(type==='raise')return r('ok','偏激进，牌力一般时加注容易被大牌反超。');
  return r('ok','');
}
function zDetail(a){
  if(!a.seen)return `<div class="stats">
    <div class="stat"><div class="k">你的牌</div><div class="v">还没看</div><div class="s">闷牌中</div></div>
    <div class="stat"><div class="k">闷跟 / 看牌后跟</div><div class="v">${fmt(a.toCall)} / ${fmt(a.toCall*2)}</div><div class="s">单注 ${fmt(a.cb)}</div></div>
    <div class="stat"><div class="k">底池</div><div class="v">${fmt(a.pot)}</div><div class="s">${Math.round(a.pot/a.bb)} 倍底注</div></div>
    <div class="stat"><div class="k">轮数</div><div class="v">第 ${a.round} 轮</div><div class="s">${a.opp} 名对手</div></div>
  </div>${oppsHTML(a)}`;
  return `<div class="stats">
    <div class="stat"><div class="k">你的牌型</div><div class="v">${a.name}</div><div class="s">强于 ${pct(a.pct)} 的牌</div></div>
    <div class="stat"><div class="k">胜率（按对手行为估计）</div><div class="v">${pct(a.e)}</div><div class="s">对随机牌 ${pct(a.eRand)}</div></div>
    <div class="stat"><div class="k">跟注额 / 所需胜率</div><div class="v">${fmt(a.toCall)}</div><div class="s">需要 ${pct(a.po)}</div></div>
    <div class="stat"><div class="k">跟注期望</div><div class="v ${a.evCall>=0?'pos':'neg'}">${sgn(a.evCall)}</div><div class="s">底池 ${fmt(a.pot)}</div></div>
  </div>${meter(a.e,a.po)}${oppsHTML(a)}`;
}
function zProfile(p){
  const s=p.st||{},h=s.h||0,acts=s.zacts||0;
  const blind=acts?(s.zblind||0)/acts:0,raise=acts?(s.zraise||0)/acts:0,fold=h?(s.zfold||0)/h:0;
  let type='样本不足',key='unknown';
  if(h>=10){
    if(raise>=0.3){type='激进';key='zagg'}
    else if(blind>=0.5){type='爱闷';key='zblind'}
    else if(fold>=0.6){type='保守';key='znit'}
    else if(fold<=0.3&&raise<0.15){type='跟注站';key='station'}
    else{type='常规';key='reg'}
  }
  return {h,acts,blind,raise,fold,cmp:s.zcmp||0,cmpw:s.zcmpw||0,type,key};
}
const ZTIP={
  zagg:'加注很多，里面诈唬不少：中等牌也可以跟，或者直接和他比牌。',
  zblind:'喜欢闷牌，牌力基本是随机的：你看牌后有对子以上就占优。',
  znit:'经常弃牌：多加注施压就能拿下底池，他留到最后通常是好牌。',
  station:'很少弃牌：别诈唬他，有好牌就多加注拿价值。',
  reg:'没有明显漏洞：按牌力打。',
  unknown:'样本不足，继续观察。'
};
const zProfileRow=(p,v)=>{const z=zProfile(p);return `<td class="r num">${z.h}</td><td class="r num">${z.acts?pct0(z.blind):'—'}</td><td class="r num">${z.acts?pct0(z.raise):'—'}</td><td class="r num">${z.h?pct0(z.fold):'—'}</td><td class="r num">${z.cmp?`${z.cmpw}/${z.cmp}`:'—'}</td><td><span class="pill ${PROFILE_PILL[z.key]||''}">${z.type}</span></td>`};
const Z_PROFILE_HEAD='<th class="r">手</th><th class="r">闷牌</th><th class="r">加注</th><th class="r">弃牌</th><th class="r">比牌胜/次</th><th>类型</th>';
function zRenderActions(el,m){
  const live=coachOn()&&LOCAL.mode==='live',a=live?getAdvice():null,rt=a?a.rec.type:'';
  const mark=(t,x)=>live&&rt===t&&(x==null||a.rec.to===x||a.rec.target===x)?' is-rec':'';
  const cost=zCost(V,m),canCall=m.stack>cost;
  const lv=zLevels(V).filter(v=>m.stack>(m.seen?2:1)*v);
  const opps=V.players.filter(q=>q.id!==m.id&&alive(q)),canCmp=V.round>=2&&m.stack>=cost;
  el.innerHTML=`
   <div class="act-row">
     ${m.seen?'':`<button class="btn${mark('look')}" data-act="zlook">看牌</button>`}
     <button class="btn${mark('fold')}" data-act="fold">弃牌</button>
     ${canCall?`<button class="btn primary${mark('call')}" data-act="call">${m.seen?'跟注':'闷跟'} ${fmt(cost)}</button>`:`<button class="btn primary${mark('allin')}" data-act="allin">全下 ${fmt(m.stack)}</button>`}
   </div>
   ${lv.length?`<div class="act-row"><span class="rec-hint">加注到单注：</span>${lv.map(v=>`<button class="btn sm${mark('raise',v)}" data-act="zraise" data-v="${v}">${fmt(v)}（付 ${fmt((m.seen?2:1)*v)}）</button>`).join('')}</div>`:''}
   <div class="act-row"><span class="rec-hint">比牌：</span>${canCmp?opps.map(q=>`<button class="btn sm${mark('compare',q.id)}" data-act="zcmp" data-t="${q.id}">和 ${esc(q.name)} 比（付 ${fmt(cost)}）</button>`).join(''):`<span class="rec-hint">${V.round<2?'第 2 轮起才能比牌':'筹码不够比牌'}</span>`}</div>
   ${live?`<div class="rec-hint">教练建议：<b>${zRecLabel(a.rec,a)}</b></div>`:coachOn()?'<div class="rec-hint">练习模式：先自己决定，行动后右侧会显示分析。</div>':''}
   <div class="rec-hint">闷牌跟注付 1 倍单注，看牌后付 2 倍；比牌时牌小或一样大的发起方出局。</div>`;
}
function zRulesHTML(){
  const ex=[[[48,49,50],'豹子','三张一样'],[[47,43,39],'同花顺','同花色的顺子'],[[51,35,19],'金花','三张同花色'],[[46,40,33],'顺子','三张连续，A-2-3 最小'],[[44,45,22],'对子','两张一样'],[[51,38,17],'单张','以上都不是，比最大的一张'],[[0,5,14],'235','不同花色的 2、3、5：最小的单张，但开启规则时能吃豹子']];
  return `<h2>炸金花规则</h2><p class="lead">每人 3 张牌，比牌型大小。可以不看牌（闷牌）下注，也可以看牌后再决定。</p>
  <h3>一手牌的流程</h3>
  <ol><li>每人先下底注，发 3 张牌，都扣着。</li><li>从庄位（D）下家开始轮流行动，一圈算一轮。</li><li>只剩一个人时他赢走底池；到轮数上限还剩多人，就全部亮牌比大小。</li></ol>
  <h3>每次轮到你，可以</h3>
  <dl class="terms"><div><dt>看牌：</dt><dd style="display:inline">免费，看完还要继续选下面的动作。看牌后跟注要付双倍。</dd></div><div><dt>跟注：</dt><dd style="display:inline">闷牌付 1 倍单注，看牌后付 2 倍。</dd></div><div><dt>加注：</dt><dd style="display:inline">把单注提高到更高档位，之后所有人按新单注跟。</dd></div><div><dt>比牌：</dt><dd style="display:inline">第 2 轮起可用。付一次跟注的钱，和指定的人私下比大小，小的出局；一样大时发起比牌的人输。</dd></div><div><dt>弃牌：</dt><dd style="display:inline">放弃这手，已下的钱不退。</dd></div></dl>
  <h3>牌型从大到小</h3>
  <p class="muted" style="margin:0 0 8px;font-size:12.5px">开启「2-3-5 吃豹子」时：两人比牌，235 遇到豹子算 235 赢；多人亮牌出现循环（235、豹子和其他牌同时在场）时，按普通大小比较。</p>
  <div class="ranks">${ex.map(([cs,n,d],i)=>`<div class="rank-row"><span class="i">${i+1}</span><span>${n}</span><span class="mini">${cs.map(c=>cardHTML(c)).join('')} <span class="muted" style="font-size:12px;margin-left:6px">${d}</span></span></div>`).join('')}</div>
  <h3>教练怎么算</h3>
  <dl class="terms"><div><dt>牌力百分位：</dt><dd>你的牌强于所有 22,100 种三张组合中的多少。</dd></div><div><dt>估计胜率：</dt><dd>闷牌的对手按随机牌算；看过牌还一直跟注、加注的对手，按他的牌在前面的部分算，跟得越多估得越强。</dd></div><div><dt>所需胜率：</dt><dd>跟注额 ÷（底池 + 跟注额），胜率高于它跟注才划算。</dd></div></dl>`;
}
