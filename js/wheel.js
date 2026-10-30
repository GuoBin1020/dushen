/* 赌神智慧树 · 今天吃什么: a small spinning wheel on the home page */
'use strict';

/* =====================================================================
   FOOD WHEEL — the result is drawn first (each option equally likely), then the wheel turns a few full
   circles and stops with that slice under the pointer at the top.
   ===================================================================== */
const FOOD=['湘菜','称菜','猪脚饭','面','瓦罐汤'];
const WHEEL_COLORS=['#c0533a','#d9a84c','#2f7d5b','#3c6e9e','#8a5a9e'];
let WHEEL_ROT=0,WHEEL_BUSY=false;
/* the slice under the pointer for a wheel turned `rot` degrees clockwise (slice 0 starts at the top) */
const wheelIndexAt=(rot,n=FOOD.length)=>Math.floor((((-rot)%360+360)%360)/(360/n))%n;
function wheelSVG(){
  const n=FOOD.length,step=360/n,pt=(deg,r)=>{const a=(deg-90)*Math.PI/180;return [r*Math.cos(a),r*Math.sin(a)]};
  const slices=FOOD.map((name,i)=>{
    const [x1,y1]=pt(i*step,96),[x2,y2]=pt((i+1)*step,96),mid=i*step+step/2,[tx,ty]=pt(mid,60);
    return `<path d="M0 0L${x1.toFixed(2)} ${y1.toFixed(2)}A96 96 0 0 1 ${x2.toFixed(2)} ${y2.toFixed(2)}Z" fill="${WHEEL_COLORS[i%WHEEL_COLORS.length]}" stroke="#0e1513" stroke-width="1.5"/>
      <text x="${tx.toFixed(2)}" y="${ty.toFixed(2)}" transform="rotate(${mid} ${tx.toFixed(2)} ${ty.toFixed(2)})" text-anchor="middle" dominant-baseline="middle" font-size="${name.length>2?13:15}" font-weight="700" fill="#fff">${esc(name)}</text>`;
  }).join('');
  return `<svg viewBox="-100 -100 200 200" class="wheel-svg" aria-hidden="true"><g id="wheel-rot" style="transform:rotate(${WHEEL_ROT}deg)">${slices}</g><circle r="14" fill="#16201d" stroke="#d9a84c" stroke-width="3"/></svg>`;
}
function openWheel(){
  if(document.querySelector('.wheel-bg'))return;
  const bg=document.createElement('div');bg.className='consent-bg wheel-bg';
  bg.innerHTML=`<div class="consent wheel-box" role="dialog" aria-modal="true" aria-labelledby="wheel-t">
    <h2 id="wheel-t">今天吃什么</h2>
    <div class="wheel-wrap"><i class="wheel-pin" aria-hidden="true"></i>${wheelSVG()}</div>
    <p class="wheel-res" id="wheel-res" role="status" aria-live="polite">点「开始转」，让转盘帮你决定。</p>
    <p class="wheel-list">选项：${FOOD.map(esc).join(' · ')}</p>
    <div class="setup-actions"><button type="button" class="btn primary" id="wheel-go">开始转</button><button type="button" class="btn" id="wheel-close">关闭</button></div></div>`;
  document.body.appendChild(bg);
  bg.querySelector('#wheel-go').addEventListener('click',spinWheel);
  bg.querySelector('#wheel-close').addEventListener('click',()=>{if(!WHEEL_BUSY)bg.remove()});
  bg.addEventListener('click',e=>{if(e.target===bg&&!WHEEL_BUSY)bg.remove()});
  bg.querySelector('#wheel-go').focus();
}
function spinWheel(){
  const g=document.getElementById('wheel-rot');if(!g||WHEEL_BUSY)return;
  const n=FOOD.length,step=360/n,pick=Math.floor(Math.random()*n);
  /* land somewhere inside the slice (not on its edge), after 5 to 7 full turns from where it is now */
  const target=pick*step+step/2+(Math.random()-.5)*step*.7;
  const cur=((WHEEL_ROT%360)+360)%360,need=((360-target)-cur+720)%360;
  WHEEL_ROT+=360*(5+Math.floor(Math.random()*3))+need;
  const calm=window.matchMedia&&window.matchMedia('(prefers-reduced-motion: reduce)').matches,ms=calm?200:4200;
  WHEEL_BUSY=true;
  const go=document.getElementById('wheel-go'),res=document.getElementById('wheel-res');
  go.disabled=true;res.textContent='转呀转……';
  try{actx();SFX.deal(6,false)}catch(e){}
  g.style.transition=`transform ${ms}ms cubic-bezier(.12,.68,.18,1)`;
  g.style.transform=`rotate(${WHEEL_ROT}deg)`;
  setTimeout(()=>{
    WHEEL_BUSY=false;go.disabled=false;go.textContent='再转一次';
    const name=FOOD[wheelIndexAt(WHEEL_ROT)];
    res.innerHTML=`今天吃：<b>${esc(name)}</b>`;
    try{SFX.ding()}catch(e){}
  },ms+60);
}
