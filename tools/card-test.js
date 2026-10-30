#!/usr/bin/env node
/* 卡密测试：node tools/card-test.js。用临时生成的密钥，不碰真实密钥。 */
'use strict';
const fs=require('fs'),path=require('path'),vm=require('vm');
const ROOT=path.join(__dirname,'..');
const mem=()=>{const o={};return {getItem:k=>k in o?o[k]:null,setItem:(k,v)=>{o[k]=String(v)},removeItem:k=>{delete o[k]}}};
const ctx=vm.createContext({console,Math,Date,JSON,Object,Array,Number,String,Boolean,Uint8Array,crypto:require('crypto').webcrypto,localStorage:mem()});
ctx.self=ctx;
for(const f of ['js/vendor/nacl.min.js','js/common.js','js/card.js'])vm.runInContext(fs.readFileSync(path.join(ROOT,f),'utf8'),ctx,{filename:f});
function tests(){
  let passed=0,failed=0;
  const ok=(c,msg)=>{if(c)passed++;else{failed++;console.log('FAIL',msg||'')}};
  const eq=(a,b,msg)=>{const A=JSON.stringify(a),B=JSON.stringify(b);if(A===B)passed++;else{failed++;console.log('FAIL',msg||'',' got',A,' want',B)}};
  const kp=nacl.sign.keyPair(),K=nacl.randomBytes(32),pub=b64u(kp.publicKey),now=Date.now(),day=864e5;
  const s=cardMake('阿杰<1>',now+7*day,K,kp.secretKey);
  ok(typeof s==='string'&&s.length>=130&&s.length<=140,'卡密约 134 个字符：'+(s&&s.length));
  {const r=cardCheck('阿杰<1>',s,{now,pub});ok(r.ok&&r.key.length===32&&Math.abs(r.exp-(now+7*day))<60e3,'有效');}
  ok(cardCheck(' 阿杰<1> ',s,{now,pub}).ok,'卡号首尾空格不影响');
  eq(cardCheck('阿杰<2>',s,{now,pub}).why,'bad-sign','改卡号失效');
  {const b=unb64u(s);b[2]^=1;eq(cardCheck('阿杰<1>',b64u(b),{now,pub}).why,'bad-sign','改有效期失效');}
  {const b=unb64u(s);b[10]^=1;eq(cardCheck('阿杰<1>',b64u(b),{now,pub}).why,'bad-sign','改 K 失效');}
  {const b=unb64u(s);b[80]^=1;eq(cardCheck('阿杰<1>',b64u(b),{now,pub}).why,'bad-sign','改签名失效');}
  eq(cardCheck('阿杰<1>',s,{now:now+8*day,pub}).why,'expired','过期');
  eq(cardCheck('阿杰<1>',s,{now,pub,clockMin:now+3600e3}).why,'clock','时间被调回');
  ok(cardCheck('阿杰<1>',s,{now,pub,clockMin:now+5*60e3}).ok,'差 5 分钟不算调回');
  eq(cardCheck('阿杰<1>',s,{now,pub:b64u(nacl.sign.keyPair().publicKey)}).why,'bad-sign','别的公钥验证不通过');
  for(const bad of ['','x','!!!',s.slice(0,40),s+'AA',null,123])eq(cardCheck('阿杰<1>',bad,{now,pub}).ok,false,'格式不对 '+String(bad).length);
  eq(cardCheck('a|b',s,{now,pub}).why,'bad-no','卡号不合法');
  eq(cardNormNo('  a|b '),null);eq(cardNormNo('x'.repeat(33)),null);eq(cardNormNo('a\nb'),null);eq(cardNormNo('   '),null);eq(cardNormNo(' 小美 😀 '),'小美 😀');
  eq(unb64u('@@@'),null,'base64url 格式不对返回 null');eq(b64u(unb64u('AQID')),'AQID');
  {const sealed=sealMake('var X=1;中文',K);eq(sealOpen(sealed,K),'var X=1;中文','加密后能解开');eq(sealOpen(sealed,nacl.randomBytes(32)),null,'错的 K 解不开');
   eq(sealOpen({v:1,n:'@@',ct:'@@'},K),null);eq(sealOpen(null,K),null);eq(sealOpen(sealed,null),null);}
  {const a=sealMake('x',K),b=sealMake('x',K);ok(a.n!==b.n,'每次 nonce 不同');}
  ok(['bad-no','bad-format','bad-sign','expired','clock'].every(w=>typeof cardWhyText(w,now+day)==='string'&&cardWhyText(w,now+day).length>3),'提示文字');
  ok(typeof CARD_PUB==='string','有公钥常量');
  /* review fixes */
  for(const bad of ['a​b','‮abc','a b','\ud800','x\u0085y','a﻿b'])eq(cardNormNo(bad),null,'卡号里的隐形字符、方向控制字符、孤立代理项被拒绝 '+JSON.stringify(bad));
  {/* the stored card is verified once, not on every call */
   let n=0;const v=nacl.sign.detached.verify;nacl.sign.detached.verify=(...a)=>{n++;return v(...a)};
   const s2=cardMake('缓存',now+day,K,kp.secretKey);localStorage.setItem('dushen-card',JSON.stringify({no:'缓存',secret:s2,exp:0}));
   const keep=CARD_PUB;
   for(let i=0;i<50;i++)storedCheck(now,pub);
   ok(n<=1,'50 次检查只验签 1 次：'+n);nacl.sign.detached.verify=v;}
  {/* entering the same card again keeps the clock guard; a different valid card resets it */
   const s3=cardMake('时钟',now+30*day,K,kp.secretKey);localStorage.setItem('dushen-card',JSON.stringify({no:'时钟',secret:s3,exp:0}));localStorage.setItem('dushen-clock',String(now+20*day));
   const r1=cardAccept('时钟',s3,{now,pub});eq(r1.why,'clock','同一张卡重新粘贴也挡住调回的时间');
   const s4=cardMake('新卡',now+30*day,K,kp.secretKey);const r2=cardAccept('新卡',s4,{now,pub});ok(r2.ok,'换一张新卡可以');eq(+localStorage.getItem('dushen-clock'),now,'新卡重置最晚时间');}

  console.log(`card: ${passed} passed, ${failed} failed`);
  return failed;
}
let failed;
try{failed=vm.runInContext('('+tests.toString()+')()',ctx)}catch(e){console.log('ERROR',e.message);failed=1}
process.exit(failed?1:0);
