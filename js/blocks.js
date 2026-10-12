/* 블록 코딩 조합 담당: 손패, 블록 스크립트, 빈칸 채우기, 문장 만들기
 *
 * 토큰 변환기(converter.js)는 아래 window.Blocks 의 함수만 씁니다.
 * 이 함수들의 이름과 돌려주는 모양만 지키면, 블록 모양·카테고리·규칙은 마음대로 바꿔도 됩니다.
 * 블록 구조(모양)는 js/layouts.js 에서 고쳐요.
 *
 *   Blocks.mount(el)          작업대를 el 안에 그림
 *   Blocks.onChange(fn)       카드가 움직일 때마다 fn() 호출
 *   Blocks.filledCount()      채운 칸 수
 *   Blocks.total()            전체 칸 수
 *   Blocks.isComplete()       다 채웠는지
 *   Blocks.sentence()         완성 문장 (문자열)
 *   Blocks.sentenceParts()    [{text, slot?:{id, key, label, color, filled, word, cardCat, glue, bad}}]
 *                             text = 연결 토큰까지 붙은 글, word = 카드 원래 글, key = 칸의 카테고리, cardCat = 카드의 카테고리
 *   Blocks.guide()            ["주인공 (플레이어가 조종): 매국노", ...]  명령어의 해석 가이드 줄
 *   Blocks.title()            게임 이름으로 쓸 짧은 단어 (주인공)
 *   Blocks.refresh()          다시 그리기 (심사위원이 바뀌어 연결 토큰 한도가 달라졌을 때)
 *
 * [연결 토큰] 카드는 아무 칸에나 놓을 수 있어요. 칸의 품사와 안 맞으면 js/grammar.js 가
 * "팀장님이 된다", "랩을 하는 자" 처럼 연결 토큰을 붙여 억지로 이어 줍니다. (grammar.js 가 없으면 그대로)
 */
(function(){
  const CATS = window.WORDS, PRESETS = window.LAYOUTS.presets, PARTS = window.LAYOUTS.parts;
  const ORDER = Object.keys(CATS);
  const PER_CAT = 3, REROLLS = 5, STORE = "amumal-blocks-v2";

  let uid = 0, state, selected = null, root = null;
  const listeners = [];
  const rnd = a => a[Math.floor(Math.random()*a.length)];
  const q = s => root.querySelector(s);

  /* ---------- 한국어 조사 ---------- */
  function jong(w){ const t=w.trim(); const c=t.charCodeAt(t.length-1); if(c<0xAC00||c>0xD7A3) return 0; return (c-0xAC00)%28; }
  const JOSA_EMPTY = {이가:"이(가)", 을를:"을(를)", 은는:"은(는)", 와과:"와(과)", 으로:"(으)로"};
  function josa(type, w){
    if(!w) return JOSA_EMPTY[type] || type;
    const j = jong(w);
    switch(type){
      case "이가": return j ? "이" : "가";
      case "을를": return j ? "을" : "를";
      case "은는": return j ? "은" : "는";
      case "와과": return j ? "과" : "와";
      case "으로": return (j===0||j===8) ? "로" : "으로";
    }
    return type;
  }

  /* ---------- 블록 구조 ---------- */
  // "{who|이가} {where}에서" → [{slot:"who"},{j:"이가",of:"who"},{text:" "},{slot:"where"},{text:"에서"}]
  function parse(t){
    const out=[], re=/\{([a-z]+\d*)(?:\|([^}]+))?\}/g; let last=0, m;
    while((m=re.exec(t))){
      if(m.index>last) out.push({text:t.slice(last,m.index)});
      out.push({slot:m[1]}); if(m[2]) out.push({j:m[2], of:m[1]});
      last=re.lastIndex;
    }
    if(last<t.length) out.push({text:t.slice(last)});
    return out;
  }
  const catOf = id => id.replace(/\d+$/,"");
  function slotIds(L){
    const ids=[];
    const walk = bs => bs.forEach(b=>{
      for(const t of [b.t, b.else]) if(t) parse(t).forEach(p=>{ if(p.slot && !ids.includes(p.slot)) ids.push(p.slot); });
      if(b.body) walk(b.body); if(b.elseBody) walk(b.elseBody);
    });
    walk(L.blocks); return ids;
  }
  function info(id){
    const cat=catOf(id), n=id.slice(cat.length), role=(state.layout.roles||{})[id]||{};
    return {cat, color:CATS[cat].color,
      label: role.label || CATS[cat].label+(n?" "+n:""),
      guide: role.guide || CATS[cat].guide+(n?` (${n}번째, 다른 것과 구별)`:"")};
  }
  const ids = () => slotIds(state.layout);
  const validLayout = L => L && Array.isArray(L.blocks) && typeof L.sentence==="string" && slotIds(L).every(id=>catOf(id) in CATS);

  // 🎲 랜덤 조립: layouts.js 의 parts 에서 블록을 골라 새 구조를 만듦
  const renum = (t, cats) => t.replace(/\{([a-z]+)(\|[^}]*)?\}/g, (m,id,j)=> cats.includes(id) ? `{${id}2${j||""}}` : m);
  function pickN(a, n){ const c=[...a]; shuffle(c); return c.slice(0,n); }
  function randomLayout(){
    const start=rnd(PARTS.start), loop=rnd(PARTS.loop), score=rnd(PARTS.score);
    const [b1,b2]=pickN(PARTS.body,2), [r1,r2]=pickN(PARTS.rule,2);
    const bodies=[b1]; if(Math.random()<.6) bodies.push({...b2, t:renum(b2.t,["act","like"]), s:renum(b2.s,["act","like"])});
    const rules=[r1]; if(Math.random()<.5) rules.push({...r2, t:renum(r2.t,["hit","result"]), s:renum(r2.s,["hit","result"])});
    const end = Math.random()<.4 ? rnd(PARTS.end) : null;
    const blocks=[
      {k:"ev", t:start.t},
      {k:"c", loop:!!loop.loop, t:loop.t, body:bodies.map(b=>({k:b.k, t:b.t}))},
      ...rules.map(r=>({k:r.k, t:r.t})),
      {k:score.k, t:score.t},
      ...(end?[{k:end.k, t:end.t}]:[])
    ];
    const sentence=[start.s, `${loop.s} ${bodies[0].s}.`, ...(bodies[1]?[`그동안 ${bodies[1].s}.`]:[]),
      ...rules.map(r=>r.s), score.s, ...(end?[end.s]:[])].join(" ");
    return {id:"random", name:"🎲 랜덤 조립", guide:"블록을 무작위로 조립한 구조. 블록 순서와 반복 조건을 그대로 게임 규칙으로 해석", blocks, sentence};
  }

  /* ---------- 상태 ---------- */
  function inPlay(){ return new Set([...state.hand.map(c=>c.text), ...Object.values(state.slots).filter(Boolean).map(c=>c.text)]); }
  function drawWord(cat, exclude){
    const pool = CATS[cat].words.filter(w => !exclude.has(w));
    return {id:"c"+(++uid), cat, text: rnd(pool.length?pool:CATS[cat].words), r:(Math.random()*5-2.5).toFixed(1)};
  }
  function shuffle(a){ for(let i=a.length-1;i>0;i--){const j=Math.floor(Math.random()*(i+1));[a[i],a[j]]=[a[j],a[i]];} }
  // 빈칸 하나당 같은 카테고리 카드가 PER_CAT 장씩 되도록 맞춤 (모자라면 뽑고, 남거나 안 쓰는 카테고리 카드는 버림)
  function topUp(){
    const need={}; ids().forEach(id=>{ const c=catOf(id); need[c]=(need[c]||0)+PER_CAT; });
    shuffle(state.hand);
    const left={}; for(const cat in need) left[cat] = need[cat] - Object.values(state.slots).filter(c=>c&&c.cat===cat).length;
    state.hand = state.hand.filter(c=>left[c.cat]-- > 0);
    for(const cat in need) for(; left[cat]>0; left[cat]--) state.hand.push(drawWord(cat, inPlay()));
    shuffle(state.hand);
  }
  function newGame(){
    state = {layout: state?.layout || PRESETS[0], hand:[], slots:{}, rerolls:REROLLS};
    state.slots = Object.fromEntries(ids().map(k=>[k,null]));
    topUp(); autoFill();
    selected = null; drawScript(); render();
  }
  function setLayout(L){
    const old = state.slots;
    state.layout = L;
    state.slots = Object.fromEntries(ids().map(k=>[k,null]));
    for(const [id,c] of Object.entries(old)) if(c){ if(id in state.slots) state.slots[id]=c; else state.hand.push(c); }
    topUp(); autoFill();
    selected = null; drawScript(); render();
  }
  function autoFill(){
    for(const id of ids()){
      if(state.slots[id]) continue;
      const opts = state.hand.filter(c=>c.cat===catOf(id));
      if(!opts.length) continue;
      const pick = rnd(opts);
      state.hand = state.hand.filter(c=>c!==pick);
      state.slots[id] = pick;
    }
  }
  function place(cardId, id){
    const card = state.hand.find(c=>c.id===cardId);
    if(!card) return;   // [연결 토큰] 아무 칸에나 놓을 수 있음
    state.hand = state.hand.filter(c=>c!==card);
    if(state.slots[id]) state.hand.push(state.slots[id]);
    state.slots[id] = card;
    selected = null; render();
  }
  function unplace(id){
    const c = state.slots[id]; if(!c) return;
    state.slots[id] = null; state.hand.push(c); selected = null; render();
  }
  function reroll(){
    if(state.rerolls<=0) return;
    const keep=new Set(Object.values(state.slots).filter(Boolean).map(c=>c.text));
    state.hand = state.hand.map(c=>{ const n=drawWord(c.cat, new Set([...keep, ...state.hand.map(h=>h.text)])); keep.add(n.text); return n; });
    state.rerolls--; selected=null; render();
  }
  /* [연결 토큰] 칸 품사에 맞게 바뀐 글 */
  function fitted(id){
    const c = state.slots[id]; if(!c) return null;
    return window.Grammar ? Grammar.fit(catOf(id), c.cat, c.text) : {text:c.text, glue:null};
  }
  const word = k => fitted(k)?.text || null;

  /* ---------- 문장 ---------- */
  function sentenceParts(){
    return parse(state.layout.sentence).map(p=>{
      if(p.text!=null) return {text:p.text};
      if(p.j) return {text:josa(p.j, word(p.of))};
      const i=info(p.slot), f=fitted(p.slot), c=state.slots[p.slot];
      return {text:f?f.text:i.label, slot:{id:p.slot, key:i.cat, label:i.label, color:i.color, filled:!!c,
        word:c?.text||null, cardCat:c?.cat||null, glue:f?.glue||null, bad:f?.bad||null}};
    });
  }

  /* ---------- 그리기 ---------- */
  const TEMPLATE = `
    <div class="ph"><h2>작업대</h2><span>카드는 아무 칸에나 놓을 수 있어요. 품사가 안 맞으면 연결 토큰이 붙어요</span></div>
    <div class="row">
      <button class="btn" data-act="reroll">패 바꾸기 <b data-rerolls>5</b></button>
      <button class="btn" data-act="auto">손패로 자동 채우기</button>
      <button class="btn" data-act="new">새 판</button>
      <span class="glue-meter" data-glue></span>
    </div>
    <div class="lay">
      <span class="lay-h">블록 구조</span>
      <div class="layouts" data-layouts role="group" aria-label="블록 구조 고르기"></div>
      <p class="hint" data-ldesc></p>
    </div>
    <div class="hand" data-hand aria-label="손패"></div>
    <div class="script" data-script></div>
    <p class="hint">칸에 놓인 카드를 다시 누르면 손패로 돌아와요. 구조를 바꾸면 같은 칸의 카드는 그대로 남아요.</p>`;
  const FLAG = `<svg class="flag" viewBox="0 0 20 20" aria-hidden="true"><path d="M4 2v16" stroke="#2B2000" stroke-width="2" fill="none"/><path d="M5 3h10l-2.5 3.5L15 10H5z" fill="#3BB54A" stroke="#1E7A2A"/></svg>`;

  function line(el, t){
    for(const p of parse(t)){
      const s=document.createElement("span");
      if(p.slot) s.dataset.slot=p.slot;
      else if(p.j){ s.className="j"; s.dataset.j=p.j; s.dataset.of=p.of; }
      else { const tx=p.text.trim(); if(!tx) continue; s.textContent=tx; }
      el.appendChild(s);
    }
    return el;
  }
  function blockEl(b){
    if(b.k!=="c"){
      const d=document.createElement("div"); d.className="blk "+b.k;
      if(b.k==="ev") d.innerHTML=FLAG;
      return line(d, b.t);
    }
    const c=document.createElement("div"); c.className="cblk";
    const arm = (t, cls, body) => {
      c.appendChild(line(Object.assign(document.createElement("div"),{className:"blk ctrl "+cls}), t));
      const mid=document.createElement("div"); mid.className="mid";
      const inner=document.createElement("div"); inner.className="inner";
      (body||[]).forEach(x=>inner.appendChild(blockEl(x)));
      mid.append(Object.assign(document.createElement("div"),{className:"arm"}), inner);
      c.appendChild(mid);
    };
    arm(b.t, "top", b.body);
    if(b.else) arm(b.else, "els", b.elseBody);
    const foot=document.createElement("div"); foot.className="foot";
    if(b.loop) foot.innerHTML="<small>↻</small>";
    c.appendChild(foot);
    return c;
  }
  // 구조가 바뀔 때만 다시 그림 (카드 이동은 render() 가 빈칸만 갈아끼움)
  function drawScript(){
    q("[data-script]").replaceChildren(...state.layout.blocks.map(blockEl));
    const bar=q("[data-layouts]"); bar.replaceChildren();
    const chip=(label, on, fn)=>{ const b=document.createElement("button"); b.className="chip"; b.textContent=label; b.setAttribute("aria-pressed", on); b.onclick=fn; bar.appendChild(b); };
    PRESETS.forEach(L=>chip(L.name, state.layout.id===L.id, ()=>setLayout(L)));
    chip("🎲 랜덤 조립", state.layout.id==="random", ()=>setLayout(randomLayout()));
    q("[data-ldesc]").textContent = state.layout.guide;
  }

  function cardEl(c){
    const b=document.createElement("button");
    b.className="card"+(selected===c.id?" sel":""); b.dataset.id=c.id; b.draggable=true;
    b.style.setProperty("--r", c.r+"deg"); b.style.setProperty("--c", `var(${CATS[c.cat].color})`);
    b.innerHTML=`<span class="cat"><span class="dot"></span></span><span></span>`;
    b.firstChild.append(CATS[c.cat].label);
    b.lastChild.textContent=c.text;
    b.setAttribute("aria-pressed", selected===c.id);
    b.onclick=()=>{ selected = selected===c.id?null:c.id; render(); };
    b.ondragstart=e=>{ e.dataTransfer.setData("text/plain",c.id); selected=c.id; highlight(); };
    b.ondragend=()=>{ selected=null; render(); };
    return b;
  }
  function slotEl(id){
    const c=state.slots[id], i=info(id), f=fitted(id), b=document.createElement("button");
    b.className="slot"+(c?"":" empty"); b.dataset.cat=i.cat;
    b.style.setProperty("--c", `var(${c ? CATS[c.cat].color : i.color})`);
    b.innerHTML=`<span class="dot"></span><span></span>`;
    b.lastChild.textContent = c ? c.text : i.label;
    if(f?.glue){ const g=document.createElement("span"); g.className="glue"; g.textContent="+"+f.glue; b.appendChild(g); }   // [연결 토큰]
    b.setAttribute("aria-label", `${i.label} 칸: ${c ? (f?.text||c.text) : "비어 있음"}`);
    b.onclick=()=>{
      if(state.hand.some(x=>x.id===selected)){ place(selected,id); return; }
      if(c) unplace(id);
    };
    b.ondragover=e=>{ if(state.hand.some(x=>x.id===selected)){ e.preventDefault(); b.classList.add("over"); } };
    b.ondragleave=()=>b.classList.remove("over");
    b.ondrop=e=>{ e.preventDefault(); place(e.dataTransfer.getData("text/plain")||selected, id); };
    return b;
  }
  function render(){
    const hand=q("[data-hand]"); hand.innerHTML="";
    const sorted=[...state.hand].sort((a,b)=>ORDER.indexOf(a.cat)-ORDER.indexOf(b.cat));
    sorted.forEach(c=>hand.appendChild(cardEl(c)));
    if(!sorted.length){ const p=document.createElement("span"); p.className="hand-empty"; p.textContent="손패가 비었어요. 칸의 카드를 눌러 돌려받을 수 있어요."; hand.appendChild(p); }
    root.querySelectorAll("[data-slot]").forEach(h=>h.replaceChildren(slotEl(h.dataset.slot)));
    root.querySelectorAll("[data-j]").forEach(h=>{ h.textContent = josa(h.dataset.j, word(h.dataset.of)); });
    q("[data-rerolls]").textContent=state.rerolls;
    if(window.Grammar){   // [연결 토큰] 사용량 / 한도
      const used = ids().filter(k=>fitted(k)?.glue).length, el=q("[data-glue]");
      el.textContent=`연결 토큰 ${used}/${Grammar.BUDGET}`; el.classList.toggle("over", used>Grammar.BUDGET);
    }
    q('[data-act="reroll"]').disabled = state.rerolls<=0 || !state.hand.length;
    highlight(); save();
    listeners.forEach(fn=>fn());
  }
  function highlight(){
    const sc = state.hand.find(x=>x.id===selected);
    root.querySelectorAll(".slot").forEach(s=>{   // [연결 토큰] 맞는 칸은 진하게, 연결 토큰이 드는 칸은 노랗게
      const fits = sc && (!window.Grammar || Grammar.accepts(s.dataset.cat, sc.cat));
      s.classList.toggle("target", !!sc && fits);
      s.classList.toggle("target-glue", !!sc && !fits);
    });
  }

  /* ---------- 이 브라우저에 판 기억 ---------- */
  function save(){ try{ localStorage.setItem(STORE, JSON.stringify({state,uid})); }catch{} }
  function load(){
    try{ const d=JSON.parse(localStorage.getItem(STORE)||"null"), s=d&&d.state;
      if(s && validLayout(s.layout) && s.slots && Array.isArray(s.hand) && s.hand.every(c=>c.cat in CATS)){
        // 기본 구조는 layouts.js 가 고쳐졌을 수 있으니 최신 것으로 갈아끼움
        const fresh = PRESETS.find(L=>L.id===s.layout.id);
        if(fresh) s.layout = fresh;
        const want = slotIds(s.layout);
        if(want.every(k=>k in s.slots) && Object.keys(s.slots).every(k=>want.includes(k))){ state=s; uid=d.uid||100; return true; }
      } }catch{}
    return false;
  }

  /* ---------- 공개 API ---------- */
  window.Blocks = {
    mount(el){
      root = el; root.innerHTML = TEMPLATE;
      q('[data-act="reroll"]').onclick = reroll;
      q('[data-act="auto"]').onclick = ()=>{ autoFill(); render(); };
      q('[data-act="new"]').onclick = newGame;
      if(load()){ topUp(); drawScript(); render(); } else newGame();
    },
    onChange(fn){ listeners.push(fn); },
    filledCount(){ return ids().filter(k=>state.slots[k]).length; },
    total(){ return ids().length; },
    isComplete(){ return this.filledCount()===this.total(); },
    sentenceParts,
    sentence(){ return sentenceParts().map(p=>p.slot && !p.slot.filled ? "[ ? ]" : p.text).join(""); },
    guide(){ return [`게임 구조 (${state.layout.name}): ${state.layout.guide}`, ...ids().filter(k=>word(k)).map(k=>`${info(k).guide}: ${word(k)}`)]; },
    title(){ return word("who") || "아무말 게임"; },
    refresh(){ if(root) render(); }
  };
})();
