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
  /* Claude에게 보여 줄 틀 사용법. 한 글자 한 글자가 입력 토큰이니 꼭 필요한 것만. */
  const API = `const GAME={title,unit,hint,bg,init(s,E){},update(s,dt,E){},draw(ctx,s,E){}};
s: 자유 상태 객체(새 판마다 비워짐). dt: 초. 배경은 틀이 bg로 칠함.
E.w,E.h 화면 크기 / E.t 경과 초 / E.score 점수(직접 더함)
E.keys.left|right|up|down|action (0/1, 터치는 화면 왼쪽·가운데·오른쪽 1/3이 left·action·right) / E.pointer{x,y,down}
E.rand(a,b) E.chance(p) E.hit(a,b) 원 충돌({x,y,r}) E.emoji(ctx,"🐉",x,y,크기) E.text(ctx,글,x,y,크기,색)
E.over("이유") 게임 오버 / E.shake(초) 화면 흔들기 / E.flash(색) 번쩍임`;

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

  window.GameTemplate = { API, ENGINE, wrap, SAMPLE };
})();
