/* 토큰 변환기 담당: 게임 틀(미니 엔진)
 *
 * 캔버스 크기 맞추기, 게임 루프, 키보드·터치 입력, 상단 HUD(제목·점수·조작법),
 * 게임 오버와 다시하기를 이 틀이 미리 갖고 있습니다.
 * 그래서 "절약 모드"에서는 Claude가 게임 규칙(GAME 객체)만 쓰면 되고,
 * 출력 토큰이 전체 HTML을 쓸 때보다 크게 줄어듭니다.
 *
 *   GameTemplate.API        명령어에 넣는 틀 설명 (짧게 유지할수록 입력 토큰 절약)
 *   GameTemplate.wrap(code) GAME 코드를 받아 완성된 HTML 문서를 돌려줌
 *   GameTemplate.SAMPLE     Claude 없이 틀을 확인해 보는 예시 GAME 코드
 */
(function(){
  /* Claude에게 보여 줄 틀 사용법. 한 글자 한 글자가 입력 토큰이니 꼭 필요한 것만.
     영어가 한국어보다 같은 뜻에 토큰이 적게 들어서 설명은 영어로 둡니다. */
  const API = `const GAME={title,unit,hint,bg,init(s,E){},update(s,dt,E){},draw(ctx,s,E){}};
s=state obj reset each round; dt=sec; engine fills bg.
E.w E.h E.t E.score(+=) E.keys.left/right/up/down/action(0|1) E.pointer{x,y,down}
E.rand(a,b) E.chance(p) E.hit(a,b)//circles{x,y,r} E.emoji(ctx,ch,x,y,size) E.text(ctx,s,x,y,size,color) E.over(reason) E.shake(sec) E.flash(color)`;

  /* 실제 엔진. 생성된 게임 HTML 안에 그대로 들어갑니다. */
  const ENGINE = `(function(){
let G=null;try{G=GAME;}catch(e){}
const cv=document.getElementById("c"),ctx=cv.getContext("2d");
const E={w:0,h:0,t:0,score:0,keys:{left:0,right:0,up:0,down:0,action:0},pointer:{x:0,y:0,down:false},state:"play"};
let s={},shakeT=0,flashT=0,flashC="#fff",reason="";
function fit(){const d=window.devicePixelRatio||1;E.w=innerWidth;E.h=innerHeight;cv.width=E.w*d;cv.height=E.h*d;cv.style.width=E.w+"px";cv.style.height=E.h+"px";ctx.setTransform(d,0,0,d,0,0);}
addEventListener("resize",fit);fit();
E.rand=(a,b)=>a+Math.random()*(b-a);E.chance=p=>Math.random()<p;
E.hit=(a,b)=>Math.hypot(a.x-b.x,a.y-b.y)<(a.r||0)+(b.r||0);
E.emoji=(c,ch,x,y,size)=>{c.font=(size||32)+'px "Apple Color Emoji","Segoe UI Emoji","Noto Color Emoji",sans-serif';c.textAlign="center";c.textBaseline="middle";c.fillText(ch,x,y);};
E.text=(c,str,x,y,size,color,align)=>{c.font="bold "+(size||20)+"px system-ui,sans-serif";c.fillStyle=color||"#fff";c.textAlign=align||"center";c.textBaseline="middle";c.fillText(str,x,y);};
E.over=r=>{if(E.state==="play"){E.state="over";reason=r||"게임 오버";}};
E.shake=t=>{shakeT=Math.max(shakeT,t||.3);};E.flash=(c,t)=>{flashC=c||"#fff";flashT=t||.15;};
const map={ArrowLeft:"left",KeyA:"left",ArrowRight:"right",KeyD:"right",ArrowUp:"up",KeyW:"up",ArrowDown:"down",KeyS:"down",Space:"action",Enter:"action"};
addEventListener("keydown",e=>{const k=map[e.code];if(k){e.preventDefault();if(E.state!=="play"&&k==="action"&&!e.repeat){start();return;}E.keys[k]=1;}});
addEventListener("keyup",e=>{const k=map[e.code];if(k)E.keys[k]=0;});
const zone=x=>x<E.w/3?"left":x>E.w*2/3?"right":"action";let pz=null;
cv.addEventListener("pointerdown",e=>{E.pointer={x:e.clientX,y:e.clientY,down:true};if(E.state!=="play"){start();return;}pz=zone(e.clientX);E.keys[pz]=1;});
cv.addEventListener("pointermove",e=>{E.pointer.x=e.clientX;E.pointer.y=e.clientY;if(pz){const z=zone(e.clientX);if(z!==pz){E.keys[pz]=0;pz=z;E.keys[z]=1;}}});
addEventListener("pointerup",()=>{E.pointer.down=false;if(pz)E.keys[pz]=0;pz=null;});
function fail(err){E.state="error";reason=String(err&&err.message||err);console.error(err);}
function start(){s={};E.t=0;E.score=0;E.state="play";reason="";for(const k in E.keys)E.keys[k]=0;
 if(!G){fail("GAME 코드를 읽지 못했어요");return;}try{G.init&&G.init(s,E);}catch(err){fail(err);}}
let last=performance.now();
function frame(now){const dt=Math.min(.05,(now-last)/1000);last=now;
 if(E.state==="play"&&G){E.t+=dt;try{G.update&&G.update(s,dt,E);}catch(err){fail(err);}}
 ctx.save();if(shakeT>0){shakeT-=dt;ctx.translate(E.rand(-6,6),E.rand(-6,6));}
 ctx.fillStyle=(G&&G.bg)||"#111";ctx.fillRect(-10,-10,E.w+20,E.h+20);
 if(G&&E.state!=="error"){try{G.draw&&G.draw(ctx,s,E);}catch(err){fail(err);}}
 ctx.restore();
 if(flashT>0){flashT-=dt;ctx.globalAlpha=Math.max(0,Math.min(1,flashT*4));ctx.fillStyle=flashC;ctx.fillRect(0,0,E.w,E.h);ctx.globalAlpha=1;}
 hud();requestAnimationFrame(frame);}
function hud(){const unit=(G&&G.unit)||"점";
 ctx.fillStyle="rgba(0,0,0,.45)";ctx.fillRect(0,0,E.w,54);
 E.text(ctx,(G&&G.title)||"아무말 게임",12,18,17,"#fff","left");
 E.text(ctx,(G&&G.hint)||"←→ 이동 · 스페이스 행동",12,40,12,"#ddd","left");
 E.text(ctx,Math.floor(E.score).toLocaleString()+" "+unit,E.w-12,27,22,"#ffd84a","right");
 if(E.state!=="play"){ctx.fillStyle="rgba(0,0,0,.62)";ctx.fillRect(0,0,E.w,E.h);
  const err=E.state==="error";
  E.text(ctx,err?"게임 코드 오류":reason,E.w/2,E.h/2-30,28,"#fff");
  E.text(ctx,err?reason.slice(0,60):"최종 "+Math.floor(E.score).toLocaleString()+" "+unit,E.w/2,E.h/2+10,18,"#ddd");
  E.text(ctx,"스페이스 또는 클릭으로 다시하기",E.w/2,E.h/2+46,16,"#ffd84a");}}
start();requestAnimationFrame(frame);
})();`;

  const esc = s => String(s).replace(/<\/script/gi, "<\\/script");
  const escTitle = s => String(s).replace(/[<&]/g, c => c==="<" ? "&lt;" : "&amp;");

  function wrap(gameCode, title){
    return `<!doctype html>
<html lang="ko">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>${escTitle(title || "아무말 게임")}</title>
<style>html,body{margin:0;height:100%;overflow:hidden;background:#000}canvas{display:block;touch-action:none}</style>
</head>
<body>
<canvas id="c"></canvas>
<script>
${esc(gameCode)}
<\/script>
<script>
${esc(ENGINE)}
<\/script>
</body>
</html>
`;
  }

  /* 예시: 틀이 제대로 도는지 Claude 없이 확인할 때 씀 */
  const SAMPLE = `const GAME={
title:"월급 밀린 용의 붕어빵 피하기",unit:"한숨",hint:"←→ 이동 · 스페이스 김밥 던지기",bg:"#1b2340",
init(s,E){s.p={x:E.w/2,y:E.h-70,r:24};s.foes=[];s.shots=[];s.cd=0;},
update(s,dt,E){
 s.p.x+=(E.keys.right-E.keys.left)*320*dt;s.p.x=Math.max(24,Math.min(E.w-24,s.p.x));s.p.y=E.h-70;
 s.cd-=dt;if(E.keys.action&&s.cd<=0){s.shots.push({x:s.p.x,y:s.p.y-30,r:12});s.cd=.3;}
 if(E.chance(dt*(1+E.t/10)))s.foes.push({x:E.rand(20,E.w-20),y:60,r:20,v:E.rand(120,220)+E.t*4});
 for(const f of s.foes){f.y+=f.v*dt;if(E.hit(f,s.p)){E.shake(.4);E.flash("#ff4d4d");E.over("붕어빵에 맞았다");}}
 for(const b of s.shots){b.y-=420*dt;for(const f of s.foes)if(!f.dead&&E.hit(b,f)){f.dead=b.dead=1;E.score+=10;}}
 s.foes=s.foes.filter(f=>!f.dead&&f.y<E.h+40);s.shots=s.shots.filter(b=>!b.dead&&b.y>40);E.score+=dt;},
draw(ctx,s,E){for(const f of s.foes)E.emoji(ctx,"🐟",f.x,f.y,40);for(const b of s.shots)E.emoji(ctx,"🍙",b.x,b.y,24);E.emoji(ctx,"🐉",s.p.x,s.p.y,48);}
};`;

  /* ------------------------------------------------------------------
   * 설정 엔진: 짧은 설정(CFG)만으로 도는 게임.
   * "0 토큰"과 "설정만" 모드가 씁니다. Claude가 코드를 한 줄도 안 써도 돼요.
   *
   * CFG = {title, unit, hint, actLabel, player, size, hazard, shot, ambient, bg:[색,색],
   *        move, action, pattern, effect, speed}
   * wrapConfig(cfg, {muted}) 가 js/sounds.js 에서 필요한 효과음만 골라 sfx 로 넣어 줍니다. 게임 안에서 M 키로 음소거.
   * 고를 수 있는 값은 아래 OPTIONS.
   * 이 함수는 toString()으로 게임 HTML 안에 그대로 들어가니, 바깥 변수를 쓰면 안 됩니다.
   * ------------------------------------------------------------------ */
  const OPTIONS = {
    move:    ["normal","reverse","drift","jitter","slow","fast","spin","bounce"],
    action:  ["shoot","wave","hop","teleport","freeze","shield","convert","slowmo"],
    pattern: ["fall","side","chase","zigzag","swarm","bounce"],
    effect:  ["grow","split","flip","fast","slow","pink","reset","halve","rain","fly","hearts","fart"]
  };

  function runGame(C){
    const cv=document.getElementById("c"), ctx=cv.getContext("2d");
    let W=0, H=0;
    function fit(){ const d=window.devicePixelRatio||1; W=innerWidth; H=innerHeight; cv.width=W*d; cv.height=H*d; cv.style.width=W+"px"; cv.style.height=H+"px"; ctx.setTransform(d,0,0,d,0,0); }
    addEventListener("resize", fit); fit();
    const R=(a,b)=>a+Math.random()*(b-a);
    const FONT='"Apple Color Emoji","Segoe UI Emoji","Noto Color Emoji",sans-serif';
    const emoji=(ch,x,y,size,alpha)=>{ ctx.globalAlpha=alpha==null?1:alpha; ctx.font=size+"px "+FONT; ctx.textAlign="center"; ctx.textBaseline="middle"; ctx.fillText(ch,x,y); ctx.globalAlpha=1; };
    const text=(s,x,y,size,color,align)=>{ ctx.font="bold "+size+"px system-ui,sans-serif"; ctx.fillStyle=color; ctx.textAlign=align||"center"; ctx.textBaseline="middle"; ctx.fillText(s,x,y); };
    const EFFECT={grow:"몸집이 커졌다",split:"장애물 분열!",flip:"화면이 뒤집혔다",fast:"모든 게 빨라졌다",slow:"몸이 무거워졌다",pink:"온 세상이 분홍색",reset:"점수가 0이 됐다",halve:"점수 반토막",rain:"비가 쏟아진다",fly:"하늘로 날아갔다",hearts:"고백을 받았다 +30",fart:"뿡! 다 밀려났다"};
    const TIMER={flip:"뒤집힘",fast:"빨라짐",slow:"느려짐",pink:"분홍",rain:"비",freeze:"멈춤",slowmo:"슬로모션",shield:"방패",hop:"공중"};
    const CD={shoot:.25,wave:1.2,hop:.9,teleport:1,freeze:4,shield:5,convert:.8,slowmo:5};
    const keys={l:0,r:0,u:0,d:0}, TOP=64;
    let g, ptr=null, muted=!!C.muted;
    /* 효과음: C.sfx = {이름: data URI}. 브라우저 규칙상 첫 클릭·키 입력 뒤부터 소리가 나요 */
    const sfx=n=>{ if(muted||!C.sfx||!C.sfx[n]) return; try{ const a=new Audio(C.sfx[n]); a.volume=.7; a.play().catch(()=>{}); }catch(e){} };
    const BIG={grow:1,split:1,flip:1,fast:1,pink:1,reset:1,halve:1,rain:1,fly:1};

    function reset(){
      const r=22*(C.size||1);
      g={t:0,score:0,lives:3,over:false,spawn:1.2,cd:0,inv:0,shake:0,banner:"",bannerT:0,
         p:{x:W/2,y:H*.7,vx:0,vy:0,r,base:r,ang:0},hz:[],shots:[],waves:[],fx:[],amb:[],
         tm:{flip:0,fast:0,slow:0,pink:0,rain:0,freeze:0,slowmo:0,shield:0,hop:0,fly:0}};
      for(let i=0;i<14;i++) g.amb.push({x:R(0,W),y:R(0,H),v:R(10,30),s:R(14,26)});
    }
    const km={ArrowLeft:"l",KeyA:"l",ArrowRight:"r",KeyD:"r",ArrowUp:"u",KeyW:"u",ArrowDown:"d",KeyS:"d"};
    addEventListener("keydown",e=>{
      if(km[e.code]){ keys[km[e.code]]=1; e.preventDefault(); }
      if(e.code==="Space"||e.code==="Enter"){ e.preventDefault(); if(e.repeat) return; g.over?reset():act(); }
      if(e.code==="KeyM") muted=!muted;
    });
    addEventListener("keyup",e=>{ if(km[e.code]) keys[km[e.code]]=0; });
    const btn=()=>({x:W-58,y:H-58,r:40});
    cv.addEventListener("pointerdown",e=>{
      if(g.over){ reset(); return; }
      const b=btn(); if(Math.hypot(e.clientX-b.x,e.clientY-b.y)<b.r){ act(); return; }
      ptr={x:e.clientX,y:e.clientY,id:e.pointerId};
    });
    cv.addEventListener("pointermove",e=>{ if(ptr&&ptr.id===e.pointerId){ ptr.x=e.clientX; ptr.y=e.clientY; } });
    addEventListener("pointerup",e=>{ if(ptr&&ptr.id===e.pointerId) ptr=null; });

    function fx(ch,x,y,size){ g.fx.push({ch,x,y,size:size||28,t:1}); }
    function nearest(maxD){ let best=null,bd=maxD||1e9; for(const h of g.hz){ const d=Math.hypot(h.x-g.p.x,h.y-g.p.y); if(d<bd){bd=d;best=h;} } return best; }
    function kill(h,pts){ h.dead=1; g.score+=pts==null?10:pts; fx("💥",h.x,h.y,26); }

    function act(){
      if(g.cd>0||g.over) return;
      g.cd=CD[C.action]||1; const p=g.p;
      fx(C.shot||"✨",p.x,p.y-p.r-10,26);
      switch(C.action){
        case "shoot": { const t=nearest(); let vx=0,vy=-1; if(t){ const d=Math.hypot(t.x-p.x,t.y-p.y)||1; vx=(t.x-p.x)/d; vy=(t.y-p.y)/d; } g.shots.push({x:p.x,y:p.y,vx:vx*560,vy:vy*560}); break; }
        case "wave": g.waves.push({x:p.x,y:p.y,r:10,max:160}); break;
        case "hop": g.tm.hop=.7; break;
        case "teleport": { let bx=p.x,by=p.y,bs=-1; for(let i=0;i<14;i++){ const x=R(40,W-40),y=R(TOP+40,H-40); let s=1e9; for(const h of g.hz) s=Math.min(s,Math.hypot(h.x-x,h.y-y)); if(s>bs){bs=s;bx=x;by=y;} } fx("💨",p.x,p.y); p.x=bx; p.y=by; g.inv=Math.max(g.inv,.4); break; }
        case "freeze": g.tm.freeze=2.2; break;
        case "shield": g.tm.shield=3; break;
        case "convert": { const t=nearest(220); if(t){ kill(t,15); fx("✨",t.x,t.y,30); } break; }
        case "slowmo": g.tm.slowmo=3; break;
      }
    }
    function effect(){
      const p=g.p;
      switch(C.effect){
        case "grow": p.r=Math.min(p.base*2.2,p.r*1.35); break;
        case "split": for(const h of g.hz.slice()) g.hz.push(Object.assign({},h,{vx:(h.vx||0)+R(-80,80),x:h.x+R(-20,20)})); break;
        case "reset": g.score=0; break;
        case "halve": g.score=Math.floor(g.score/2); break;
        case "hearts": g.score+=30; for(let i=0;i<6;i++) fx("💕",p.x+R(-40,40),p.y+R(-40,20),24); break;
        case "fart": fx("💨",p.x,p.y+10,40); for(const h of g.hz){ const dx=h.x-p.x,dy=h.y-p.y,d=Math.hypot(dx,dy)||1; if(d<300){ h.vx=dx/d*420; h.vy=dy/d*420; h.chase=0; h.zig=0; } } break;
        case "fly": g.tm.fly=1.6; break;
        default: if(C.effect in g.tm) g.tm[C.effect]= {flip:5,fast:6,slow:4,pink:6,rain:6}[C.effect]||5;
      }
      g.banner=EFFECT[C.effect]||""; g.bannerT=1.8;
      sfx(C.effect==="hearts"?"woah":C.effect==="fart"?"fart":BIG[C.effect]?"boom":"");
    }
    function spawnOne(){
      const sp=(140+g.t*3)*(C.speed||1), add=o=>g.hz.push(Object.assign({r:20,life:12,vx:0,vy:0},o));
      switch(C.pattern){
        case "side": { const L=Math.random()<.5; add({x:L?-20:W+20,y:R(TOP+30,H-20),vx:(L?1:-1)*sp}); break; }
        case "chase": { const s=Math.floor(R(0,3)); add({x:s===0?-20:s===1?W+20:R(0,W),y:s===2?TOP:R(TOP,H),chase:sp*.55,life:9}); break; }
        case "zigzag": { const x=R(40,W-40); add({x,x0:x,y:TOP,vy:sp*.8,zig:R(1.5,3),amp:R(50,130)}); break; }
        case "swarm": { const x=R(60,W-60); for(let i=0;i<4;i++) add({x:x+R(-50,50),y:TOP-R(0,60),vx:R(-30,30),vy:sp*.85,r:16}); break; }
        case "bounce": add({x:R(40,W-40),y:TOP+10,vx:R(-1,1)*sp,vy:R(.4,1)*sp,bounce:1,life:8}); break;
        default: add({x:R(20,W-20),y:TOP,vy:sp});
      }
    }
    function move(dt){
      const p=g.p; let dx=keys.r-keys.l, dy=keys.d-keys.u;
      if(ptr){ const tx=ptr.x-p.x,ty=ptr.y-p.y,d=Math.hypot(tx,ty); if(d>8){dx=tx/d;dy=ty/d;}else{dx=0;dy=0;} }
      const m=Math.hypot(dx,dy); if(m>1){dx/=m;dy/=m;}
      if(C.move==="reverse"){ dx=-dx; dy=-dy; }
      if(C.move==="spin"){ const a=Math.sin(g.t*2.2)*.7,c=Math.cos(a),s=Math.sin(a); const nx=dx*c-dy*s; dy=dx*s+dy*c; dx=nx; p.ang+=dt*6; }
      const sp=260*({slow:.65,fast:1.45}[C.move]||1)*(g.tm.slow>0?.5:1);
      if(C.move==="drift"){ p.vx+=(dx*sp-p.vx)*2.2*dt; p.vy+=(dy*sp-p.vy)*2.2*dt; }
      else if(C.move==="bounce"){ if(!p.vx&&!p.vy){p.vx=sp*.7;p.vy=-sp*.5;} p.vx+=dx*sp*3*dt; p.vy+=dy*sp*3*dt; const k=sp*.85/(Math.hypot(p.vx,p.vy)||1); p.vx*=k; p.vy*=k; }
      else { p.vx=dx*sp; p.vy=dy*sp; }
      if(C.move==="jitter"){ p.x+=R(-4,4); p.y+=R(-4,4); }
      if(g.tm.fly>0){ p.vy=-420; }
      p.x+=p.vx*dt; p.y+=p.vy*dt;
      const b=C.move==="bounce";
      if(p.x<p.r){p.x=p.r; if(b)p.vx=Math.abs(p.vx);} if(p.x>W-p.r){p.x=W-p.r; if(b)p.vx=-Math.abs(p.vx);}
      if(p.y<TOP+p.r){p.y=TOP+p.r; if(b)p.vy=Math.abs(p.vy);} if(p.y>H-p.r){p.y=H-p.r; if(b)p.vy=-Math.abs(p.vy);}
    }
    function update(dt){
      g.t+=dt; g.score+=dt; g.cd-=dt; g.inv-=dt; g.shake-=dt; g.bannerT-=dt;
      for(const k in g.tm) g.tm[k]=Math.max(0,g.tm[k]-dt);
      move(dt);
      const hf=(g.tm.freeze>0?0:1)*(g.tm.slowmo>0?.35:1)*(g.tm.fast>0?1.5:1);
      g.spawn-=dt*(g.tm.rain>0?2:1)*(g.tm.freeze>0?0:1);
      if(g.spawn<=0){ spawnOne(); g.spawn=(C.pattern==="swarm"?2.4:1)/(.9+g.t*.04); }
      const p=g.p, safe=g.inv>0||g.tm.hop>0||g.tm.fly>0;
      for(const h of g.hz){
        if(h.chase){ const dx=p.x-h.x,dy=p.y-h.y,d=Math.hypot(dx,dy)||1; h.vx=dx/d*h.chase; h.vy=dy/d*h.chase; }
        h.y+=h.vy*dt*hf;
        if(h.zig){ h.x=h.x0+Math.sin(g.t*h.zig)*h.amp; } else h.x+=h.vx*dt*hf;
        if(h.bounce){ if(h.x<h.r||h.x>W-h.r) h.vx*=-1; if(h.y<TOP+h.r||h.y>H-h.r) h.vy*=-1; }
        h.life-=dt;
        if(h.life<0||h.x<-80||h.x>W+80||h.y>H+80||h.y<-120) h.dead=1;
        if(!h.dead && Math.hypot(h.x-p.x,h.y-p.y)<h.r+p.r*.8){
          if(g.tm.shield>0){ kill(h,5); }
          else if(!safe){
            h.dead=1; g.lives--; g.inv=1.2; g.shake=.35; fx("💥",p.x,p.y,34); sfx("bonk"); effect();
            if(g.lives<=0){ g.over=true; sfx("dundun"); }
          }
        }
      }
      for(const s of g.shots){ s.x+=s.vx*dt; s.y+=s.vy*dt; for(const h of g.hz) if(!h.dead&&Math.hypot(h.x-s.x,h.y-s.y)<h.r+12){ kill(h); s.dead=1; break; } if(s.x<-20||s.x>W+20||s.y<0||s.y>H+20) s.dead=1; }
      for(const w of g.waves){ w.r+=420*dt; for(const h of g.hz) if(!h.dead&&Math.hypot(h.x-w.x,h.y-w.y)<w.r) kill(h); if(w.r>w.max) w.dead=1; }
      for(const f of g.fx){ f.t-=dt*1.2; f.y-=30*dt; }
      for(const a of g.amb){ a.y+=a.v*dt; if(a.y>H+20){ a.y=TOP; a.x=R(0,W); } }
      g.hz=g.hz.filter(h=>!h.dead); g.shots=g.shots.filter(s=>!s.dead); g.waves=g.waves.filter(w=>!w.dead); g.fx=g.fx.filter(f=>f.t>0);
    }
    function draw(){
      const bg=ctx.createLinearGradient(0,0,0,H); bg.addColorStop(0,(C.bg||[])[0]||"#1b2340"); bg.addColorStop(1,(C.bg||[])[1]||"#0b0f1e");
      ctx.fillStyle=bg; ctx.fillRect(0,0,W,H);
      ctx.save();
      if(g.shake>0) ctx.translate(R(-6,6),R(-6,6));
      if(g.tm.flip>0){ ctx.translate(W,H); ctx.rotate(Math.PI); }
      for(const a of g.amb) emoji(C.ambient||"✨",a.x,a.y,a.s,.18);
      for(const h of g.hz) emoji(C.hazard||"❓",h.x,h.y,h.r*2);
      for(const s of g.shots) emoji(C.shot||"✨",s.x,s.y,24);
      for(const w of g.waves){ ctx.strokeStyle="rgba(255,255,255,.7)"; ctx.lineWidth=4; ctx.beginPath(); ctx.arc(w.x,w.y,w.r,0,7); ctx.stroke(); }
      const p=g.p, air=g.tm.hop>0||g.tm.fly>0;
      if(air){ ctx.fillStyle="rgba(0,0,0,.25)"; ctx.beginPath(); ctx.ellipse(p.x,p.y+p.r,p.r*.8,p.r*.3,0,0,7); ctx.fill(); }
      if(g.tm.shield>0){ ctx.strokeStyle="rgba(140,220,255,.9)"; ctx.lineWidth=4; ctx.beginPath(); ctx.arc(p.x,p.y,p.r+12,0,7); ctx.stroke(); }
      if(!(g.inv>0 && Math.floor(g.t*12)%2)){
        ctx.save(); ctx.translate(p.x,p.y-(air?14:0)); if(p.ang) ctx.rotate(p.ang); emoji(C.player||"🙂",0,0,p.r*2*(air?1.25:1)); ctx.restore();
      }
      for(const f of g.fx) emoji(f.ch,f.x,f.y,f.size,Math.max(0,f.t));
      if(g.tm.rain>0){ ctx.strokeStyle="rgba(170,200,255,.5)"; ctx.lineWidth=2; for(let i=0;i<60;i++){ const x=(i*97+g.t*400)%W, y=(i*53+g.t*900)%H; ctx.beginPath(); ctx.moveTo(x,y); ctx.lineTo(x-6,y+16); ctx.stroke(); } }
      ctx.restore();
      if(g.tm.pink>0){ ctx.fillStyle="rgba(255,105,180,.35)"; ctx.fillRect(0,0,W,H); }
      if(g.tm.freeze>0){ ctx.fillStyle="rgba(120,180,255,.15)"; ctx.fillRect(0,0,W,H); }
      hud();
    }
    function hud(){
      ctx.fillStyle="rgba(0,0,0,.45)"; ctx.fillRect(0,0,W,54);
      text(C.title||"아무말 게임",12,18,17,"#fff","left");
      text(C.hint||"방향키·드래그 이동 · 스페이스 행동",12,40,12,"#ddd","left");
      text(Math.floor(g.score).toLocaleString()+" "+(C.unit||"점"),W-12,18,20,"#ffd84a","right");
      text("❤️".repeat(Math.max(0,g.lives))+(C.sfx?(muted?"  🔇M":"  🔊M"):""),W-12,41,13,"#fff","right");
      const on=Object.keys(TIMER).filter(k=>g.tm[k]>0).map(k=>TIMER[k]+" "+g.tm[k].toFixed(1)).join(" · ");
      if(on) text(on,W/2,70,13,"#fff");
      if(g.bannerT>0){ ctx.globalAlpha=Math.min(1,g.bannerT); text(g.banner,W/2,H*.3,26,"#fff"); ctx.globalAlpha=1; }
      const b=btn(); ctx.fillStyle="rgba(255,255,255,.18)"; ctx.beginPath(); ctx.arc(b.x,b.y,b.r,0,7); ctx.fill();
      if(g.cd>0){ ctx.strokeStyle="rgba(255,216,74,.9)"; ctx.lineWidth=4; ctx.beginPath(); ctx.arc(b.x,b.y,b.r-3,-Math.PI/2,-Math.PI/2+Math.PI*2*(1-g.cd/(CD[C.action]||1))); ctx.stroke(); }
      emoji(C.shot||"✨",b.x,b.y-6,30); text(C.actLabel||"행동",b.x,b.y+22,11,"#fff");
      if(g.over){
        ctx.fillStyle="rgba(0,0,0,.62)"; ctx.fillRect(0,0,W,H);
        text("게임 오버",W/2,H/2-30,30,"#fff");
        text("최종 "+Math.floor(g.score).toLocaleString()+" "+(C.unit||"점"),W/2,H/2+10,20,"#ddd");
        text("스페이스 또는 클릭으로 다시하기",W/2,H/2+46,16,"#ffd84a");
      }
    }
    reset();
    let last=performance.now();
    (function frame(now){ const dt=Math.min(.05,(now-last)/1000); last=now; if(!g.over) update(dt); draw(); requestAnimationFrame(frame); })(last);
  }

  /* 이 설정에 필요한 소리만 골라 넣음 (게임 파일이 너무 커지지 않게) */
  function soundsFor(cfg){
    const S = window.SOUNDS; if(!S) return null;
    const names = ["bonk","dundun", cfg.effect==="hearts"?"woah": cfg.effect==="fart"?"fart":"boom"];
    const out = {}; for(const n of names) if(S[n]) out[n]=S[n];
    return out;
  }
  function wrapConfig(cfg, opts){
    const full = Object.assign({}, cfg, {sfx: soundsFor(cfg), muted: !!(opts && opts.muted)});
    const json = JSON.stringify(full).replace(/</g, "\\u003c");
    return `<!doctype html>
<html lang="ko">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>${escTitle(cfg.title || "아무말 게임")}</title>
<style>html,body{margin:0;height:100%;overflow:hidden;background:#000}canvas{display:block;touch-action:none}</style>
</head>
<body>
<canvas id="c"></canvas>
<script>
(${runGame.toString()})(${json});
<\/script>
</body>
</html>
`;
  }

  window.GameTemplate = { API, ENGINE, wrap, SAMPLE, OPTIONS, wrapConfig };
})();
