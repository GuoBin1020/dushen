/* 赌神智慧树 · start-up: restore a room after refresh, register the offline cache */
'use strict';

/* ---------- boot ---------- */
placePanels();
$('#rules').innerHTML=rulesHTML();$('#rules-2').innerHTML=rulesHTML();
fillForm(loadPrefs());renderSeg();setGame(GAME);
const jm=/join=([A-Za-z0-9]{6})/.exec(location.hash);
setMode(jm?'join':'solo');
if(jm){$('#f-net-internet').checked=true;$('#f-code').value=jm[1].toUpperCase();syncJoinNet()}
show('setup');
setTimeout(ensureRank,30);
if('serviceWorker' in navigator&&location.protocol==='https:')navigator.serviceWorker.register('sw.js').catch(()=>{});
/* after a refresh: the host reopens the same room, a guest rejoins with the same client id */
(()=>{
  purgeIdentities();
  let hs=null,ss=null,last=null;
  try{hs=JSON.parse(sessionStorage.getItem('holdem-host')||'null');ss=JSON.parse(sessionStorage.getItem('holdem-session')||'null');last=JSON.parse(localStorage.getItem('holdem-host-last')||'null')}catch(e){}
  const fresh=o=>o&&o.code&&Date.now()-o.at<3600e3;
  /* a saved room comes back only if a card opens the online code (an expired one may, to finish a game saved before it ran out) */
  const skip=k=>{try{sessionStorage.removeItem(k)}catch(e){}showBanner('刷新前的联机房间需要有效的卡号和卡密，已跳过恢复。再次联机时请输入新卡。')};
  if(fresh(hs)&&!onlineReady()&&!cardForRestore(hs.at)){skip('holdem-host');hs=null}
  if(fresh(ss)&&!onlineReady()&&!cardForRestore(ss.at)){skip('holdem-session');ss=null}
  cardCleanup(onlineReady());
  if(fresh(hs)){withRoom(hs.code,()=>restoreHost(hs),false,'host');return}
  if(last&&last.code&&Date.now()-last.at<2*3600e3&&!(last.S&&last.S.phase==='settled')){
    const mins=Math.max(1,Math.round((Date.now()-last.at)/60000));
    showBanner(`你在这个浏览器里有一个没结束的房间 ${esc(last.code)}（${mins} 分钟前）。`,'<button class="btn sm primary" data-act="restore-last">恢复房间</button><button class="btn sm" data-act="drop-last">不用了</button>');
  }
  if(fresh(ss)){
    setMode('join');$('#f-net-internet').checked=true;$('#f-code').value=ss.code;$('#f-name').value=ss.name||'';
    if(ss.gender==='f')$('#f-gender-f').checked=true;
    syncJoinNet();
    if(ss.T)T=ss.T;
    withRoom(ss.code,fresh=>{
      showBanner(`正在重新加入房间 ${esc(ss.code)}…`);
      return guestJoinInternet(ss.code,ss.name,ss.gender,fresh)
        .then(()=>{flashBanner('已重新加入房间。',2500)})
        .catch(e=>{NET.role='solo';showBanner('重新加入失败：'+esc(e.message),'<button class="btn sm" data-act="home">返回首页</button>')});
    },true);
  }
})();
