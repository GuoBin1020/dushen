/* 赌神智慧树 · 斗地主 coach: card tracking, move scoring, advice, grading and the coach's table pieces */
'use strict';

/* =====================================================================
   COACH (斗地主). Everything here works from what one seat can see: its own hand, the cards already
   played, the bottom cards once shown, and how many cards each seat holds. The same move scoring
   drives the bots (doudizhu.js: ddBotPlay), so the coach never recommends what a bot would not play.
   The rules part below never touches the page, so tools/ddz-test.js runs it in Node.
   ===================================================================== */
/* per rank, how many cards are neither in my hand nor played yet (jokers at most one each) */
function ddUnseen(hand,out){
  const u=[4,4,4,4,4,4,4,4,4,4,4,4,4,1,1];
  hand.concat(out||[]).forEach(id=>{if(id!=null)u[ddRank(id)]--});
  return u.map(x=>Math.max(0,x));
}
/* bottom cards the landlord still holds: known to everyone once shown (empty for the landlord or before there is one) */
function ddLordBottom(v){
  const d=v.dd;if(!d||d.landlord<0||d.landlord===v.me)return [];
  const out=new Set(d.out||[]),mine=new Set((v.players[v.me].cards||[]).filter(c=>c!=null));
  return d.bottom.filter(id=>id!=null&&!out.has(id)&&!mine.has(id));
}
/* could the unseen cards make a play that beats `cls`? kickers are not checked; bombs and the rocket always count.
   With 赖子, unseen wild cards may fill any rank below the jokers (so soft bombs are possible too). */
function ddCanBeBeaten(cls,u,laizi=-1){
  if(!cls||cls.type==='rocket')return false;
  if(u[13]&&u[14])return true;
  const uW=laizi>=0?u[laizi]:0;
  /* bombs anyone could still hold, as [kind, rank] with kind 0 soft, 1 hard, 2 pure */
  const bombs=[];
  for(let r=0;r<13;r++){
    if(r===laizi){if(u[r]>=4)bombs.push([2,r]);continue}
    if(u[r]>=4)bombs.push([1,r]);else if(uW&&u[r]+uW>=4)bombs.push([0,r]);
  }
  if(cls.type==='bomb'){const K=DD_BK[cls.bk||'hard'];return bombs.some(([k,r])=>k>K||(k===K&&r>cls.main))}
  if(bombs.length)return true;
  const need={single:1,pair:2,triple:3,triple1:3,triple2:3,straight:1,pairs:2,plane:3,plane1:3,plane2:3,four2:4,four22:4}[cls.type];
  const len=['straight','pairs','plane','plane1','plane2'].includes(cls.type)?cls.len:1;
  const top=len>1?DD_TOP_SEQ:14;
  for(let lo=cls.main+1;lo+len-1<=top;lo++){
    let short=0,ok=true;
    for(let r=lo;r<lo+len;r++){
      const lack=Math.max(0,need-u[r]);
      if(lack&&r>=13){ok=false;break}
      if(r!==laizi)short+=lack;else if(lack){ok=false;break}
    }
    if(ok&&short<=uW)return true;
  }
  return false;
}

/* ---------- move scoring ----------
   Every legal play (and 不要 when there is something to beat) gets a score and a one-line reason.
   In order of weight: go out now; with two plays left, lead the one nobody can beat and keep the lead;
   otherwise fewer plays left is better and smaller cards go first. Partner and blocking rules sit on top,
   and bombs wait until an enemy is close to going out or the bomb nearly finishes the hand. */
function ddEvalMoves({hand,prev,me,landlord,counts,arch,out,laizi}){
  arch=arch||DD_ARCH.safe;const lz=laizi>=0?laizi:-1;
  const seats=Object.keys(counts).map(Number),next=seats[(seats.indexOf(me)+1)%seats.length];
  const mate=me===landlord?-1:seats.find(p=>p!==me&&p!==landlord);
  const enemies=seats.filter(p=>p!==me&&p!==mate),enemyMin=Math.min(...enemies.map(p=>counts[p]));
  const nextIsEnemy=next!==mate,unseen=ddUnseen(hand,out||[]),base=ddSplit(hand,lz).hands;
  const fromMate=prev&&prev.pid===mate,blocking=mate>=0&&prev&&prev.pid===landlord&&counts[landlord]<=5;
  /* press with the strongest only against an enemy's play: the partner's single or pair is left alone */
  const pressing=enemyMin<=2&&prev&&prev.pid!==mate&&(prev.cls.type==='single'||prev.cls.type==='pair');
  const topSingle=Math.max(...hand.map(ddRank));
  /* each way a card set can be read (with 赖子: a bomb, or something cheaper) is scored as its own move */
  const res=ddMoves(hand,prev&&prev.cls,lz).flatMap(cards=>ddChoices(cards,prev&&prev.cls,lz).map(cls=>[cards,cls])).map(([cards,cls])=>{
    const after=cards.length===hand.length?0:ddSplit(ddMinus(hand,cards),lz).hands,boss=!ddCanBeBeaten(cls,unseen,lz);
    let score,why;
    if(!after){score=1000;why='这一手出完就赢了'}
    else{
      score=-after*10;
      if(blocking||pressing){score+=cls.main*0.6;why=`${blocking?'地主':'对手'}只剩 ${blocking?counts[landlord]:enemyMin} 张，用大牌拦住他`}
      else{score-=cls.main*0.3;why=`出完还剩 ${after} 手`}
      if(after===1&&boss){score+=15;why='这手别人压不住，出完只剩最后一手，下一轮直接走'}
      if(ddIsBomb(cls)){
        const worth=enemyMin<=4||after<=2;
        score-=worth?3:25-arch.bomb*15;
        why=worth?(enemyMin<=4?`对手只剩 ${enemyMin} 张，用${ddTypeName(cls)}抢回出牌权`:`${ddTypeName(cls)}之后只剩 ${after} 手，可以炸`):'炸弹留到关键时候再用';
      }
      if(!prev&&next===mate&&counts[mate]<=2&&cards.length===counts[mate]&&!ddIsBomb(cls)){score+=30-cls.main*0.5;why=`队友只剩 ${counts[mate]} 张，送一手小牌让他走`}
      if(!prev&&nextIsEnemy&&counts[next]===1&&cls.type==='single'&&cls.main<topSingle){score-=40;why='下家只剩 1 张，不出他能接的小单张'}
      if(!prev&&nextIsEnemy&&counts[next]===2&&cls.type==='pair'){score-=40;why='下家只剩 2 张，不出他能接的对子'}
      if(fromMate){
        const help=prev.cls.type==='single'&&next===landlord&&counts[landlord]===1&&cls.type==='single';
        if(!help){score-=10+arch.team*15;why='这是队友的牌，压了反而挡队友的路'}
        else{score+=cls.main;why='地主只剩 1 张，帮队友把单张顶大'}
      }
    }
    return {cards,cls,after,boss,score,why};
  });
  if(prev){
    let score=-base*10-6,why='压了要拆牌，不如这手不要';
    if(fromMate){score+=2;why='这是队友的牌，不用压'}
    if(blocking||pressing){score-=30;why=`${blocking?'地主':'对手'}只剩 ${blocking?counts[landlord]:enemyMin} 张，这时候不要很危险`}
    if(!res.length)why='没有能压过上家的牌';
    res.push({cards:null,cls:null,after:base,boss:false,score,why});
  }
  return res.sort((a,b)=>b.score-a.score);
}

/* ---------- advice for the seat whose turn it is ----------
   Bidding and doubling compare hand strength with the coach's own thresholds (between the three bot personalities);
   play takes the best-scored move. The result also carries what the coach panel shows. */
const DD_COACH={bid:6,rob:8.5,dbl:10};
const ddSameCards=(a,b)=>!!a&&!!b&&a.length===b.length&&a.slice().sort((x,y)=>x-y).join()===b.slice().sort((x,y)=>x-y).join();
/* a play in words; with 赖子 a wild card standing for another rank reads 「赖→K」, and cards go in the order they count as */
function ddRecLabel(rec,laizi=-1){
  if(!rec)return '';
  if(rec.type==='bid')return rec.kind==='rob'?(rec.yes?'抢地主':'不抢'):(rec.yes?'叫地主':'不叫');
  if(rec.type==='double')return rec.yes?'加倍':'不加倍';
  if(rec.type==='pass')return '不要';
  const as=rec.as||(rec.cls&&rec.cls.as)||[],key=x=>x.map(a=>a.id+':'+a.rank).sort().join();
  const cls=rec.cls||(as.length?ddReadings(rec.cards,laizi).find(c=>key(c.as)===key(as)):null)||ddClassify(rec.cards,laizi);
  const stand=new Map(as.map(a=>[a.id,a.rank])),eff=id=>stand.has(id)?stand.get(id):ddRank(id);
  const faces=rec.cards.slice().sort((a,b)=>eff(a)-eff(b)||a-b).map(id=>stand.has(id)?'赖→'+DR[stand.get(id)]:DR[ddRank(id)]);
  return `${cls?ddPlayText(cls):''}（${faces.join(' ')}）`;
}
function ddAdvise(v){
  const d=v.dd,hand=v.players[v.me].cards.filter(c=>c!=null),counts={},lz=d.laizi>=0?d.laizi:-1;
  v.players.forEach((p,i)=>{counts[i]=p.cards.length});
  const sp=ddSplit(hand,lz),strength=ddStrength(hand,lz),cnt=ddCounts(hand);
  const bombs=sp.groups.filter(g=>{const c=ddClassify(g,lz);return c&&ddIsBomb(c)}).length;
  const big=[cnt[14]?'大王':'',cnt[13]?'小王':'',cnt[12]?`${cnt[12]} 张 2`:''].filter(Boolean).join('、')||'没有王和 2';
  const desc=`手牌强度 ${strength.toFixed(1)}：${bombs?bombs+' 个炸弹，':''}拆完 ${sp.hands} 手，大牌：${big}`;
  const base={game:'ddz',stage:d.stage,hand:v.handNo,strength,hands:sp.hands,bombs,counts,unseen:ddUnseen(hand,d.out||[]),lordBottom:ddLordBottom(v),alts:[],moves:[],
    lord:d.landlord,me:v.me,prevPid:d.lead&&d.lead.pid!==v.me?d.lead.pid:-1,handCards:hand.slice(),laizi:lz};
  if(d.stage==='bid'){
    const kind=d.ask?d.ask.kind:'call',th=kind==='rob'?DD_COACH.rob:DD_COACH.bid,yes=strength>=th;
    const verdict=yes?(kind==='rob'?'牌够强，建议抢':'牌够强，建议叫地主'):(kind==='rob'?'抢了风险大，建议不抢':'牌不够强，建议不叫，当农民');
    return {...base,th,rec:{type:'bid',kind,yes},why:`${desc}。${verdict}（教练的门槛是 ${th}）。`};
  }
  if(d.stage==='double'){
    const th=DD_COACH.dbl,yes=strength>=th;
    return {...base,th,rec:{type:'double',yes},why:`${desc}。${yes?'牌很强，加倍多赢':'牌不算很强，加倍风险大，建议不加倍'}（教练的门槛是 ${th}）。`};
  }
  const prev=base.prevPid>=0?{cls:d.lead.cls,pid:d.lead.pid}:null;
  const moves=ddEvalMoves({hand,prev,me:v.me,landlord:d.landlord,counts,arch:DD_ARCH.safe,out:d.out||[],laizi:lz});
  const recOf=m=>m&&m.cards?{type:'play',cards:m.cards,cls:m.cls,as:m.cls.as}:{type:'pass'};
  const top=moves[0],rec=recOf(top);
  const alts=moves.slice(0,3).map(m=>({rec:recOf(m),why:m.why,after:m.after,boss:m.boss}));
  return {...base,rec,why:top?top.why:'',alts,moves};
}
/* ---------- grading one decision against the advice ----------
   extra = how many more plays the hand needs than after the recommended move (never below 0) */
function ddGrade(a,act){
  const r=(g,note,extra=0)=>({g,note,extra});
  const rt=a.rec.type;
  if(rt==='bid'||rt==='double'){
    if(!!act.yes===a.rec.yes)return r('good','和建议一致。');
    const close=Math.abs(a.strength-a.th)<2;
    return r(close?'ok':'minor',act.yes?(close?'手牌接近门槛，叫也说得过去。':'手牌一般还要当地主或加倍，风险偏大。'):(close?'手牌接近门槛，放弃也说得过去。':'手牌够强却放弃了。'));
  }
  const recAfter=a.moves.length?a.moves[0].after:a.hands;
  const afterOf=cards=>{const m=a.moves.find(x=>ddSameCards(x.cards,cards));return m?m.after:ddSplit(ddMinus(a.handCards,cards),a.laizi).hands};
  const fromMate=a.prevPid>=0&&a.lord!==a.me&&a.prevPid!==a.lord;
  if(act.type==='pass'){
    if(rt==='pass')return r('good',fromMate?'队友的牌，不压是对的。':'和建议一致。');
    /* passing on the partner's play is only wrong when the recommended play would have gone out */
    if(fromMate)return recAfter===0?r('minor','这手可以直接出完，不用再让给队友。',a.hands):r('ok','队友的牌，不压也可以。');
    const extra=Math.max(0,a.hands-recAfter),near=a.prevPid>=0&&!fromMate&&a.counts[a.prevPid]<=5;
    return near?r('mistake','对手快出完了，该压不压。',extra):r('minor','能压的时候不压，把出牌权让给了对手。',extra);
  }
  const cls=act.cls||ddClassify(act.cards,a.laizi),bomb=cls&&ddIsBomb(cls);
  if(rt==='play'&&ddSameCards(act.cards,a.rec.cards))return r('good','和建议一致。');
  const recBomb=rt==='play'&&ddIsBomb(a.rec.cls||ddClassify(a.rec.cards,a.laizi));
  if(rt==='pass'){
    const extra=Math.max(0,afterOf(act.cards)-a.hands);
    if(fromMate)return r('minor','压了队友的牌，挡了队友的路。',extra);
    if(bomb)return r('minor','炸弹用早了，可以留到对手快出完的时候。',extra);
    return r('ok','也可以，不过教练建议这手不要。',extra);
  }
  const extra=Math.max(0,afterOf(act.cards)-recAfter);
  if(bomb&&!recBomb&&extra<2)return r('minor','炸弹用早了，可以留到对手快出完的时候。',extra);
  if(!extra)return r('ok','也可以，剩下的手数和建议一样。');
  return r(extra===1?'minor':'mistake',`这样出比建议多拆出 ${extra} 手，后面更难走完。`,extra);
}

/* =====================================================================
   COACH PIECES — run on each device from its own view V (ui.js calls these when isD(V)).
   ===================================================================== */
let DADV=null,HINT=null;
const ddAdviceKey=v=>{const d=v.dd;return [v.handNo,d.redeals,d.stage,v.toAct,d.ask&&d.ask.kind,d.lead&&d.lead.pid,d.lead&&d.lead.cards.join('.'),(d.out||[]).length,d.dblAsk.length].join('|')};
/* advice for my own turn, worked out once per position */
function ddGetAdvice(){
  const key=ddAdviceKey(V);
  if(DADV&&DADV.key===key)return DADV.a;
  const a=ddAdvise(V);DADV={key,a};return a;
}
const DD_STAGE_CN={bid:'叫地主',double:'加倍',play:'出牌'};
/* what I just did, graded, kept for the coach panel and the settlement */
function ddRecord(type,arg){
  const d=V.dd;if(!d||!['bid','double','play'].includes(d.stage))return;
  const lz=d.laizi>=0?d.laizi:-1,cards=type==='play'?(Array.isArray(arg)?arg:arg.cards):null,want=type==='play'&&!Array.isArray(arg)?arg.as:null;
  /* the reading actually played: the one picked, or the first that beats the last play */
  const prev=d.lead&&d.lead.pid!==V.me?d.lead.cls:null;
  const cls=type==='play'?(want&&ddReadings(cards,lz).find(c=>c.type===want.type&&c.main===want.main&&c.len===(want.len||1)))||ddPlayReading(cards,prev,lz):null;
  const a=ddGetAdvice(),act=type==='play'?{type,cards,cls}:type==='pass'?{type}:{type,yes:!!+arg};
  const g=ddGrade(a,act);
  const action=type==='play'?ddRecLabel({type:'play',cards,cls},lz):type==='pass'?'不要':ddRecLabel({type:a.rec.type,kind:a.rec.kind,yes:!!+arg});
  const {moves,unseen,...keep}=a;
  const rec={...keep,game:'ddz',action,type,grade:g.g,note:g.note,extra:g.extra,recText:ddRecLabel(a.rec),lossBB:0,bomb:!!(cls&&ddIsBomb(cls)),
    pressMiss:g.g==='mistake'&&type==='pass',mateHit:/队友/.test(g.note)&&type==='play',earlyBomb:/炸弹用早了/.test(g.note)};
  /* a guest keeps it aside until the host confirms the action (ddack); the host and solo play record at once */
  if(NET.role==='guest'){T.ddPending={rec,hand:V.handNo};return}
  T.decisions.push(rec);T.last=rec;
}
function ddConfirmPending(hand){
  const p=T.ddPending;T.ddPending=null;
  if(p&&p.hand===hand){T.decisions.push(p.rec);T.last=p.rec;if(V)render()}
}
/* 提示: each press picks the next play that works — the coach's pick first, then the legal plays in order */
function ddHintList(){
  const d=V.dd,hand=me().cards.filter(c=>c!=null),prev=d.lead&&d.lead.pid!==V.me?d.lead.cls:null,list=[];
  /* in 先决定 mode the coach's pick is not put first, or 提示 would give the answer away */
  if(coachOn()&&LOCAL.mode==='live'){const a=ddGetAdvice();if(a.rec.type==='play')list.push(a.rec.cards)}
  ddMoves(hand,prev,d.laizi>=0?d.laizi:-1).forEach(m=>{if(!list.some(x=>ddSameCards(x,m)))list.push(m)});
  return list;
}
function ddHint(){
  if(!myTurn()||!V.dd||V.dd.stage!=='play')return;
  const list=ddHintList();if(!list.length)return;
  const key=ddAdviceKey(V);
  if(!HINT||HINT.key!==key)HINT={key,i:0};
  DSEL=new Set(list[HINT.i%list.length]);HINT.i++;
  ddRenderHand();renderActions();
}
/* enemies down to one or two cards, as a warning line */
function ddWarnHTML(v){
  const d=v.dd;if(!d||d.stage!=='play')return '';
  const mate=d.landlord===v.me?-1:[0,1,2].find(i=>i!==v.me&&i!==d.landlord);
  return v.players.map((p,i)=>i===v.me||i===mate||!p.cards.length||p.cards.length>2?'':`<p class="dd-warn">⚠ ${i===d.landlord?'地主':'农民 '+esc(p.name)} 只剩 ${p.cards.length} 张</p>`).join('');
}
/* one cell per rank, 大王 down to 3: the rank and how many are still unseen; br marks where the strip breaks upright (after 8) */
function ddCounterCells(v,br){
  const hand=v.players[v.me].cards.filter(c=>c!=null),u=ddUnseen(hand,v.dd.out||[]),lz=v.dd.laizi>=0?v.dd.laizi:-1;
  return [14,13,12,11,10,9,8,7,6,5,4,3,2,1,0].map(r=>`<span class="${u[r]?'':'zero'}${r===lz?' lzc':''}"><b>${r===14?'大':r===13?'小':DR[r]}${r===lz?'赖':''}</b>${u[r]}</span>${br&&r===5?br:''}`).join('');
}
/* the strip under the table's top corners */
const ddCounterStripHTML=v=>`<div class="dd-scells" role="table" aria-label="记牌器：每个点数还剩几张在别人手里">${ddCounterCells(v,'<i class="br" aria-hidden="true"></i>')}</div>`;
function ddCounterHTML(v){
  const lb=ddLordBottom(v);
  return `<div class="dd-counter" role="table" aria-label="记牌器：每个点数还剩几张在别人手里">${ddCounterCells(v)}</div>
    <p class="note" style="margin-top:4px">数字是还没出、也不在你手里的张数（${v.dd.landlord>=0?'在另外两家手里':'在另外两家或底牌里'}）。${lb.length?`<br>地主手里确定有：<b>${lb.map(id=>DR[ddRank(id)]).join(' ')}</b>（亮过的底牌，还没出）。`:''}</p>`;
}
function ddCoachHTML(v,toggle){
  if(!v.dd)return `<div class="coach-head"><h2>教练</h2>${toggle}</div><p class="muted">发牌后这里会显示叫地主、加倍和出牌的建议。</p>`;
  const d=v.dd,turn=myTurn()&&['bid','double','play'].includes(d.stage);
  let body=ddWarnHTML(v);
  if(turn&&LOCAL.mode==='live'){
    const a=ddGetAdvice();
    body+=`<div class="stats">
      <div class="stat"><div class="k">手牌强度</div><div class="v">${a.strength.toFixed(1)}</div><div class="s">叫地主门槛 ${DD_COACH.bid}</div></div>
      <div class="stat"><div class="k">拆完手数</div><div class="v">${a.hands}</div><div class="s">越少越好走</div></div>
      <div class="stat"><div class="k">炸弹</div><div class="v">${a.bombs}</div><div class="s">含王炸</div></div></div>
      <div class="verdict"><span class="muted">建议</span><span class="rec-big">${esc(ddRecLabel(a.rec))}</span></div><p class="why">${esc(a.why)}</p>
      ${a.alts.length>1?`<ol class="dd-alts">${a.alts.map(x=>`<li><b>${esc(ddRecLabel(x.rec))}</b> <span class="muted">${esc(x.why)}</span></li>`).join('')}</ol>`:''}`;
  }else if(turn){
    body+='<p class="muted">轮到你了。先自己决定：这手牌拆完要几手？哪些牌别人压不住？队友和地主各剩几张？行动后这里显示点评。</p>';
  }else if(!T.last){
    body+='<p class="muted">轮到你时，这里会显示叫地主、加倍和出牌的建议，只有你自己能看到。</p>';
  }
  const f=T.last;
  if(f&&f.game==='ddz'&&!(turn&&LOCAL.mode==='live'&&f.hand!==v.handNo)){
    const [gl,gc]=GRADE[f.grade];
    body+=`<div class="${body?'feedback':''}"><div class="t">上一个决定 · 第 ${f.hand} 局 · ${DD_STAGE_CN[f.stage]||''}</div>
      <div class="verdict" style="margin-top:2px"><span class="pill ${gc}">${gl}</span><span>你：<b>${esc(f.action)}</b></span><span class="muted">建议：${esc(f.recText)}</span></div>
      <p class="why">${esc(f.note)}</p>${LOCAL.mode==='after'?`<p class="why muted">${esc(f.why)}</p>`:''}</div>`;
  }
  return `<div class="coach-head"><h2>教练</h2>${toggle}</div>${body}<h3 class="dd-sub">记牌器</h3>${ddCounterHTML(v)}
    <p class="disclaim">斗地主没有公认的最优解。教练按「拆完的手数、别人压不压得住、队友和对手剩几张」打分，是学习用的简化模型。</p>`;
}
/* my 斗地主 numbers, for the stats panel and the settlement */
function ddStatsHTML(st,s){
  st=st||{};const n=st.dd||0,L=st.ddL||0,LW=st.ddLW||0,F=n-L,FW=(st.ddW||0)-LW;
  const rate=(w,k)=>k?pct0(w/k):'—';
  return `<div class="stat"><div class="k">盈亏</div><div class="v ${s.pr>0?'pos':s.pr<0?'neg':''}">${sgn(s.pr)}</div><div class="s">${(s.pr/s.bb).toFixed(1)} 倍底分 · ${n} 局</div></div>
    <div class="stat"><div class="k">当地主</div><div class="v">${L} 次</div><div class="s">胜率 ${rate(LW,L)}</div></div>
    <div class="stat"><div class="k">当农民</div><div class="v">${F} 次</div><div class="s">胜率 ${rate(FW,F)}</div></div>
    <div class="stat"><div class="k">炸弹 / 春天</div><div class="v">${st.ddB||0} / ${st.ddS||0}</div><div class="s">春天含反春</div></div>
    <div class="stat"><div class="k">平均倍数</div><div class="v">${n?'×'+((st.ddM||0)/n).toFixed(1):'—'}</div></div>
    <div class="stat"><div class="k">决策正确率</div><div class="v">${s.n?pct(s.acc):'—'}</div><div class="s">${s.n} 次决定</div></div>`;
}
/* the settlement's 斗地主 parts: top stats, improvement tips, and the decision review */
function ddSettleParts(m,ds,s){
  const mine=m.standings.find(x=>x.id===m.seat),st=(mine&&mine.st)||{};
  const tips=[],cnt=k=>ds.filter(d=>d.grade===k).length;
  const press=ds.filter(d=>d.pressMiss).length,mate=ds.filter(d=>d.mateHit).length,early=ds.filter(d=>d.earlyBomb).length;
  const split=ds.filter(d=>d.type==='play'&&d.extra>0&&!d.earlyBomb),extra=split.reduce((a,d)=>a+d.extra,0);
  if(press)tips.push(`有 ${press} 次对手快出完了你没压。对手剩 5 张以内时，能压就压，别让他顺着出完。`);
  if(mate)tips.push(`有 ${mate} 次压了队友的牌。队友出牌时一般让他继续走，除非你能一次出完。`);
  if(split.length)tips.push(`有 ${split.length} 次出牌多拆出了手数，共多出 ${extra} 手。出牌前先想好整手牌怎么拆，顺子、连对、飞机尽量别拆散。`);
  if(early)tips.push(`有 ${early} 次炸弹用早了。炸弹留到对手快出完、或者炸完自己就能走的时候，效果最好。`);
  if((st.ddL||0)>=5&&(st.ddLW||0)/(st.ddL||1)<0.4)tips.push('当地主的胜率不到 40%，叫地主偏激进。手牌强度不到门槛时，可以让给别人当。');
  if(!ds.length)tips.push('这一场没有记录到你的决定。');
  else if(!tips.length)tips.push('主要决定都和教练一致，可以把教练切到「先决定」来检验自己。');
  const worst=ds.filter(d=>d.grade==='minor'||d.grade==='mistake').sort((a,b)=>(b.grade==='mistake')-(a.grade==='mistake')||b.extra-a.extra).slice(0,5);
  const review=`<div class="panel"><h2>决策评分</h2>
    <div class="row" style="margin:10px 0 14px">${['good','ok','minor','mistake'].map(k=>`<span class="pill ${GRADE[k][1]}">${GRADE[k][0]} ${cnt(k)}</span>`).join('')}</div>
    ${worst.length?`<div class="tbl-wrap"><table><thead><tr><th>局</th><th>阶段</th><th>你</th><th>建议</th><th class="r">多出手数</th><th>评价</th></tr></thead><tbody>
    ${worst.map(d=>`<tr><td class="num">${d.hand}</td><td>${DD_STAGE_CN[d.stage]||''}</td><td>${esc(d.action)}</td><td>${esc(d.recText)}</td><td class="r num">${d.extra||'—'}</td><td><span class="pill ${GRADE[d.grade][1]}">${GRADE[d.grade][0]}</span> <span class="muted">${esc(d.note)}</span></td></tr>`).join('')}
    </tbody></table></div><p class="muted" style="font-size:12px;margin:8px 0 0">问题最大的 ${worst.length} 个决定。</p>`:'<p class="muted">没有明显的问题决定。</p>'}</div>`;
  return {stats:`<div class="stats" style="grid-template-columns:repeat(3,minmax(0,auto));gap:10px 28px">${ddStatsHTML(st,s)}</div>`,tips,review};
}
