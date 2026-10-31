#!/usr/bin/env node
/* Build assets/ from the downloaded sources: node tools/make-assets.mjs <src-dir> <out-dir>
   <src-dir> holds x/ (vector-playing-cards, Kenney audio and board games packs) and dl/ (Noto Emoji).
   Everything is rasterised with headless Chrome (cards, chips) or transcoded with ffmpeg (sounds). */
import fs from 'node:fs';
import path from 'node:path';
import {execFileSync} from 'node:child_process';
import vm from 'node:vm';
import {startChrome,openPage,sleep} from './cdp.mjs';

const [SRC,OUT]=process.argv.slice(2);
/* --mj <dir>: only render the 红中麻将 tiles from the riichi-mahjong-tiles SVGs in <dir> (Front.svg + symbol), keep the rest */
const MJ=process.argv.includes('--mj')?process.argv[process.argv.indexOf('--mj')+1]:null;
if(!SRC||!OUT){console.error('usage: make-assets.mjs <src-dir> <out-dir>');process.exit(2)}
const FFMPEG=fs.existsSync('/opt/homebrew/bin/ffmpeg')?'/opt/homebrew/bin/ffmpeg':'ffmpeg';
const RANKS=['2','3','4','5','6','7','8','9','10','J','Q','K','A'],SUITS=['S','H','D','C'];
const W=200,H=Math.round(W*242.67/167.09); // face size, same ratio as the source SVG viewBox
/* The sound list lives in js/assets.js (single source of truth) */
const SFX_FILES=vm.runInNewContext(fs.readFileSync(new URL('../js/assets.js',import.meta.url),'utf8')+';SFX_FILES');
const CHIPS={red:'chipRedWhite',blue:'chipBlueWhite',green:'chipGreenWhite',black:'chipBlackWhite',white:'chipWhiteBlue'};

const rd=(...p)=>fs.readFileSync(path.join(SRC,...p));
const out=(...p)=>{const f=path.join(OUT,...p);fs.mkdirSync(path.dirname(f),{recursive:true});return f};
const b64=(buf,mime)=>`data:${mime};base64,${Buffer.from(buf).toString('base64')}`;
const page_=html=>`<!doctype html><meta charset=utf-8><body style="margin:0;background:transparent">${html}`;

if(MJ){await mahjong();process.exit(0)}
const chrome=await startChrome(9347);
let pg;
try{
  pg=await openPage(chrome.port,{w:W,h:H,transparent:true});
  /* Render an HTML snippet and screenshot the top-left w*h pixels as a transparent image. */
  const render=async(html,file,w,h)=>{
    await pg.send('Emulation.setDeviceMetricsOverride',{width:w,height:h,deviceScaleFactor:1,mobile:false});
    await pg.ev(`document.open();document.write(${JSON.stringify(page_(html))});document.close();Promise.all([...document.images].map(i=>i.decode?i.decode().catch(()=>{}):0))`);
    await sleep(120);
    await pg.shot(file,{clip:{x:0,y:0,width:w,height:h},quality:82});
  };
  const card=(svg,file)=>render(`<div style="width:${W}px;height:${H}px">${svg.replace(/^[\s\S]*?(?=<svg)/,'').replace(/(width|height)="([\d.]+)pt"/g,'$1="$2"').replace(/<svg\b/,`<svg style="display:block;width:${W}px;height:${H}px"`)}</div>`,file,W,H);

  /* 52 faces from the vector-playing-cards SVGs; the ace of spades is redrawn below */
  for(const r of RANKS)for(const s of SUITS){
    if(r==='A'&&s==='S')continue;
    await card(rd('x/vpc/vector-playing-cards-master/cards-svg',r+s+'.svg').toString(),out('cards',r+s+'.webp'));
  }
  const frame=(inner)=>`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 167.09 242.67" width="167.09" height="242.67"><rect x="1" y="1" width="165.09" height="240.67" rx="10" ry="10" fill="#fff" stroke="#888" stroke-width="1"/>${inner}</svg>`;
  const corners=(top,bot)=>`<g>${top}</g><g transform="rotate(180 83.545 121.335)">${bot}</g>`;
  /* Ace of spades: white rounded card, A and a spade in two corners, one big spade in the middle */
  await card(frame(corners(
    `<text x="22" y="40" font-family="Georgia,'Times New Roman',serif" font-weight="bold" font-size="34" text-anchor="middle" fill="#111">A</text><text x="22" y="66" font-family="Arial,Helvetica,sans-serif" font-size="26" text-anchor="middle" fill="#111">♠</text>`,
    `<text x="22" y="40" font-family="Georgia,'Times New Roman',serif" font-weight="bold" font-size="34" text-anchor="middle" fill="#111">A</text><text x="22" y="66" font-family="Arial,Helvetica,sans-serif" font-size="26" text-anchor="middle" fill="#111">♠</text>`
  )+`<text x="83.5" y="158" font-family="Arial,Helvetica,sans-serif" font-size="130" text-anchor="middle" fill="#111">♠</text>`),out('cards','AS.webp'));

  /* Jokers: clown emoji (62% of card width) with the name in both corners, small joker in grey */
  const clown=b64(rd('dl/emoji/noto_1f921.svg'),'image/svg+xml');
  const jw=167.09*0.62,jx=(167.09-jw)/2,jy=(242.67-jw)/2;
  for(const [big,file] of [[true,'joker-big'],[false,'joker-small']]){
    const col=big?'#d22':'#222',name=big?'大王':'小王';
    const t=`<text x="19" y="38" font-family="'PingFang SC','Heiti SC','Noto Sans CJK SC',sans-serif" font-weight="bold" font-size="22" text-anchor="middle" fill="${col}">${name[0]}</text><text x="19" y="62" font-family="'PingFang SC','Heiti SC','Noto Sans CJK SC',sans-serif" font-weight="bold" font-size="22" text-anchor="middle" fill="${col}">${name[1]}</text>`;
    await card(frame(corners(t,t)+`<image href="${clown}" x="${jx}" y="${jy}" width="${jw}" height="${jw}"${big?'':' style="filter:grayscale(1)"'}/>`),out('cards',file+'.webp'));
  }

  /* Card back: Kenney PNG scaled to 200px wide */
  {const img=rd('x/board/PNG/Cards/cardBack_red2.png'),h=Math.round(W*190/140);
   await render(`<img src="${b64(img,'image/png')}" style="display:block;width:${W}px;height:${h}px">`,out('cards','back.webp'),W,h);}

  /* Chips: five colours at 48px */
  for(const [name,src] of Object.entries(CHIPS))
    await render(`<img src="${b64(rd('x/board/PNG/Chips',src+'.png'),'image/png')}" style="display:block;width:48px;height:48px">`,out('chips',name+'.png'),48,48);
}finally{
  if(pg)pg.close();
  chrome.kill();
}
if(pg&&pg.errs.length)console.warn('page errors:',pg.errs);

/* Sounds: only the clips SFX_FILES uses, mono 96k mp3 */
for(const f of Object.values(SFX_FILES).flat()){
  const n=path.basename(f,'.mp3');
  execFileSync(FFMPEG,['-y','-loglevel','error','-i',path.join(SRC,'x/audio/Audio',n+'.ogg'),'-vn','-b:a','96k','-ac','1',out(f)]);
}

fs.writeFileSync(out('CREDITS.txt'),`Asset credits / 素材来源

1. Playing card faces (cards/*.webp except the ace of spades, jokers and back)
   Author: Byron Knoll (Vector Playing Cards)
   Source: https://github.com/notpeter/vector-playing-cards (the originals by Byron Knoll were on Google Code: https://code.google.com/archive/p/vector-playing-cards/)
   License: Public domain
   Changes in this project: rasterised the SVG files to 200px wide transparent WebP.

2. Card back, chips (cards/back.webp, chips/*.png)
   Author: Kenney (https://kenney.nl), pack "Boardgame Pack"
   Source: https://kenney.nl/assets/boardgame-pack
   License: Creative Commons CC0 1.0 (https://creativecommons.org/publicdomain/zero/1.0/)
   Changes in this project: scaled (card back to 200px wide WebP, chips to 48px PNG), colours unchanged.

3. Sound effects (sfx/*.mp3)
   Author: Kenney (https://kenney.nl), pack "Casino Audio"
   Source: https://kenney.nl/assets/casino-audio
   License: Creative Commons CC0 1.0 (https://creativecommons.org/publicdomain/zero/1.0/)
   Changes in this project: only the clips in use, transcoded from OGG to mono 96 kbit/s MP3.

4. Clown face emoji used on the jokers (cards/joker-big.webp, cards/joker-small.webp)
   Author: Google, Noto Emoji (U+1F921)
   Source: https://github.com/googlefonts/noto-emoji/blob/main/2D/svg/emoji_u1f921.svg
   License: Apache License 2.0 (https://www.apache.org/licenses/LICENSE-2.0)
   Changes in this project: composed into a new joker card design with the corner text 大王 / 小王; the small joker is rendered in greyscale.
   Also made for this project: the ace of spades (cards/AS.webp) is redrawn in the style of the other aces.
`);
console.log('assets written to',OUT);

/* 红中麻将 tiles: the face plate and the symbol stacked, 120px wide WebP; a light diagonal pattern over the plain back */
async function mahjong(){
  const TW=120,TH=Math.round(TW*400/300),svg=f=>b64(fs.readFileSync(path.join(MJ,f+'.svg')),'image/svg+xml');
  const names=[...['Man','Sou','Pin'].flatMap((s,i)=>Array.from({length:9},(_,n)=>[s+(n+1),'msp'[i]+(n+1)])),['Chun','hz']];
  const chrome=await startChrome(9349);let pg;
  try{
    pg=await openPage(chrome.port,{w:TW,h:TH,transparent:true});
    const render=async(html,file)=>{
      await pg.send('Emulation.setDeviceMetricsOverride',{width:TW,height:TH,deviceScaleFactor:1,mobile:false});
      await pg.ev(`document.open();document.write(${JSON.stringify(page_(html))});document.close();Promise.all([...document.images].map(i=>i.decode?i.decode().catch(()=>{}):0))`);
      await sleep(120);await pg.shot(file,{clip:{x:0,y:0,width:TW,height:TH},quality:82});
    };
    const box=`position:absolute;left:0;top:0;width:${TW}px;height:${TH}px`;
    for(const [src,dst] of names)await render(`<div style="position:relative;width:${TW}px;height:${TH}px"><img src="${svg('Front')}" style="${box}"><img src="${svg(src)}" style="${box}"></div>`,out('mj',dst+'.webp'));
    await render(`<div style="position:relative;width:${TW}px;height:${TH}px;border-radius:${TW*.1}px;overflow:hidden"><img src="${svg('Back')}" style="${box}"><div style="${box};background:repeating-linear-gradient(45deg,rgba(255,255,255,.18) 0 3px,transparent 3px 9px),repeating-linear-gradient(-45deg,rgba(0,0,0,.12) 0 3px,transparent 3px 9px);mix-blend-mode:overlay"></div><div style="position:absolute;inset:10%;border:2px solid rgba(255,240,220,.7);border-radius:${TW*.06}px"></div></div>`,out('mj','back.webp'));
  }finally{if(pg)pg.close();chrome.kill()}
  const cf=out('CREDITS.txt'),cur=fs.existsSync(cf)?fs.readFileSync(cf,'utf8'):'';
  if(!cur.includes('riichi-mahjong-tiles'))fs.writeFileSync(cf,cur.trimEnd()+`

5. Mahjong tiles (mj/*.webp)
   Author: FluffyStuff, "riichi-mahjong-tiles"
   Source: https://github.com/FluffyStuff/riichi-mahjong-tiles
   License: Public domain, Creative Commons CC0 1.0 (https://creativecommons.org/publicdomain/zero/1.0/)
   Changes in this project: each tile's face plate and symbol stacked and rasterised to 120px wide WebP; only 万 / 条 / 筒 1-9 and 红中 are used; a diagonal pattern and an inner frame were added over the back.
`);
  console.log('mahjong tiles written to',path.join(OUT,'mj'));
}
