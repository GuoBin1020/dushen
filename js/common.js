/* 赌神智慧树 · shared constants, helpers and bot personalities (both games) */
'use strict';

const RL=['2','3','4','5','6','7','8','9','10','J','Q','K','A'];
const SU=['♠','♥','♦','♣'];
const CAT=['高牌','一对','两对','三条','顺子','同花','葫芦','四条','同花顺'];
const STREET_CN={preflop:'翻牌前',flop:'翻牌',turn:'转牌',river:'河牌'};
const POS={2:['BTN/SB','BB'],3:['BTN','SB','BB'],4:['BTN','SB','BB','UTG'],5:['BTN','SB','BB','UTG','CO'],6:['BTN','SB','BB','UTG','HJ','CO'],7:['BTN','SB','BB','UTG','MP','HJ','CO'],8:['BTN','SB','BB','UTG','UTG+1','MP','HJ','CO'],9:['BTN','SB','BB','UTG','UTG+1','MP','LJ','HJ','CO']};
const STYLES={
  tag:{name:'紧凶',loose:-0.02,aggr:0.72,bluff:0.08,margin:0},
  lag:{name:'松凶',loose:0.06,aggr:0.8,bluff:0.2,margin:0.04},
  station:{name:'跟注站',loose:0.1,aggr:0.18,bluff:0.03,margin:0.12},
  nit:{name:'紧弱',loose:-0.07,aggr:0.35,bluff:0.02,margin:-0.03},
  maniac:{name:'疯子',loose:0.1,aggr:0.9,bluff:0.38,margin:0.07},
  reg:{name:'常规',loose:0.01,aggr:0.55,bluff:0.1,margin:0.02}
};
/* Bot personalities: each archetype gives a range per trait and every bot draws its own values,
   so two bots of the same type still play differently.
   Preflop traits bend the GTO chart: loosenWide = play late-position hands from outside the chart,
   loosenAny = call small raises with junk, raiseUp = turn calls into raises, passive = turn raises into calls,
   tighten = drop marginal hands. Postflop traits: loose/margin = call lighter, aggr = bet strong hands, bluff = bet weak ones. */
const ARCH={
  tag:    {w:28,loosenWide:[0,.08], loosenAny:[0,.03], raiseUp:[.05,.2],passive:[0,.15], tighten:[0,.12], loose:[-.04,0],  aggr:[.6,.8],  bluff:[.05,.12],margin:[-.02,.02]},
  lag:    {w:20,loosenWide:[.3,.55],loosenAny:[.03,.12],raiseUp:[.3,.5], passive:[0,.1],  tighten:[0,.05], loose:[.03,.08], aggr:[.7,.9],  bluff:[.15,.28],margin:[.02,.06]},
  station:{w:20,loosenWide:[.4,.7], loosenAny:[.3,.55],raiseUp:[0,.05], passive:[.5,.75],tighten:[0,.05], loose:[.08,.14], aggr:[.1,.25], bluff:[.01,.05],margin:[.1,.16]},
  nit:    {w:15,loosenWide:[0,.03], loosenAny:[0,.02], raiseUp:[0,.05], passive:[.3,.5], tighten:[.4,.6], loose:[-.09,-.05],aggr:[.25,.4], bluff:[.01,.04],margin:[-.05,-.01]},
  maniac: {w:5, loosenWide:[.6,.8], loosenAny:[.4,.6], raiseUp:[.5,.7], passive:[0,.05], tighten:[0,0],   loose:[.08,.14], aggr:[.85,.95],bluff:[.3,.45], margin:[.05,.1]},
  reg:    {w:12,loosenWide:[.1,.25],loosenAny:[0,.06], raiseUp:[.1,.25],passive:[.1,.3], tighten:[.05,.2],loose:[-.01,.03],aggr:[.45,.65],bluff:[.07,.14],margin:[0,.04]}
};
function pickArch(){let r=Math.random()*Object.values(ARCH).reduce((a,x)=>a+x.w,0);for(const [k,a] of Object.entries(ARCH)){r-=a.w;if(r<=0)return k}return 'tag'}
function genAI(key){
  const a=ARCH[key]||ARCH.tag,o={key};
  for(const t of ['loosenWide','loosenAny','raiseUp','passive','tighten','loose','aggr','bluff','margin']){const [lo,hi]=a[t];o[t]=+(lo+Math.random()*(hi-lo)).toFixed(3)}
  return o;
}
const styleName=p=>(STYLES[p.style]||STYLES.tag).name;
const NAMES=['阿杰','小美','老王','Kevin','Lina','大熊','Mia','老周'];
const GRADE={good:['正确','good'],ok:['可接受','info'],minor:['小偏差','warn'],mistake:['失误','bad']};
const MAX_SEATS=9;
const $=s=>document.querySelector(s);
const fmt=n=>Math.round(n).toLocaleString('en-US');
const sgn=n=>(n>0?'+':n<0?'−':'')+fmt(Math.abs(n));
const pct=x=>(x*100).toFixed(1)+'%';
/* the letter on a seat avatar: the first character that is not a dash-like mark or space (falls back to the first character) */
const avatarChar=n=>{const cs=[...String(n||'')];return cs.find(c=>!/[\s一ー－—‐\-_]/.test(c))||cs[0]||'?'};
const esc=s=>String(s).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const rand=a=>a[Math.floor(Math.random()*a.length)];

/* ---------- shared helpers (work on the host state S or on a player's view V) ---------- */
const alive=p=>p.inHand&&!p.folded;
const canAct=p=>alive(p)&&!p.allIn;
const potOf=st=>st.players.reduce((a,p)=>a+p.total,0);
const roundU=(st,x)=>Math.max(st.cfg.sb,Math.round(x/st.cfg.sb)*st.cfg.sb);
function nextIn(st,from,pred){const n=st.players.length;for(let k=1;k<=n;k++){const i=((from+k)%n+n)%n;if(pred(st.players[i]))return i}return -1}
