/* 블록 코딩 조합 담당: 손패, 블록 스크립트, 빈칸 채우기, 문장 만들기
 *
 * 게임 규칙: 카드는 아무 칸에나 놓을 수 있어요. 품사가 안 맞으면
 * js/grammar.js 가 연결 토큰을 붙여 억지로 이어 주고, 연결 토큰은 한 판에 몇 개까지만 됩니다.
 * 손패는 칸에 맞춰 나눠 주지 않고 무작위로 뽑으니, 있는 카드로 어떻게든 말이 되게 만드는 게 재미입니다.
 *
 * 토큰 변환기(converter.js)는 아래 window.Blocks 의 함수만 씁니다.
 *
 *   Blocks.mount(el)          작업대를 el 안에 그림
 *   Blocks.onChange(fn)       카드가 움직일 때마다 fn() 호출
 *   Blocks.filledCount()      채운 칸 수
 *   Blocks.total()            전체 칸 수
 *   Blocks.isComplete()       다 채웠는지
 *   Blocks.sentence()         완성 문장 (문자열, 연결 토큰 포함)
 *   Blocks.sentenceParts()    [{text, slot?:{key, label, color, filled, word, cardCat, glue, bad}}]
 *                             text = 연결 토큰까지 붙은 글, word = 카드 원래 글, cardCat = 카드 원래 카테고리
 *   Blocks.guide()            ["주인공 (플레이어가 조종): 매국노", ...]  명령어의 해석 가이드 줄
 *   Blocks.title()            게임 이름으로 쓸 짧은 단어 (주인공)
 */
(function(){
  const CATS = window.WORDS;
  const ORDER = Object.keys(CATS);
  const HAND = 9, REROLLS = 3, STORE = "amumal-blocks-v2";

  let uid = 0, state, selected = null, root = null;
  const listeners = [];
  const rnd = a => a[Math.floor(Math.random()*a.length)];
  const q = s => root.querySelector(s);

  /* ---------- 한국어 조사 ---------- */
  function jong(w){ const t=w.trim(); const c=t.charCodeAt(t.length-1); if(c<0xAC00||c>0xD7A3) return 0; return (c-0xAC00)%28; }
  const iGa = w => jong(w) ? "이" : "가";
  const euro = w => { const j=jong(w); return (j===0||j===8) ? "로" : "으로"; };

  /* ---------- 연결 토큰 (grammar.js 가 없으면 그대로) ---------- */
  function fitted(k){
    const c = state.slots[k]; if(!c) return null;
    return window.Grammar ? Grammar.fit(k, c.cat, c.text) : {text:c.text, glue:null, cost:0};
  }
  const word = k => fitted(k)?.text || null;

  /* ---------- 상태 ---------- */
  function inPlay(){ return new Set([...state.hand.map(c=>c.text), ...Object.values(state.slots).filter(Boolean).map(c=>c.text)]); }
  /* 무작위 카드 한 장. 카테고리도 무작위라 칸에 딱 맞는 카드가 안 올 수도 있어요 */
  function drawCard(exclude){
    for(let i=0;i<20;i++){
      const cat = rnd(ORDER), text = rnd(CATS[cat].words);
      if(!exclude.has(text)) return {id:"c"+(++uid), cat, text, r:(Math.random()*5-2.5).toFixed(1)};
    }
    const cat = rnd(ORDER); return {id:"c"+(++uid), cat, text:rnd(CATS[cat].words), r:"0"};
  }
  function newGame(){
    state = {hand:[], slots:Object.fromEntries(ORDER.map(k=>[k,null])), rerolls:REROLLS};
    for(let i=0;i<HAND;i++) state.hand.push(drawCard(inPlay()));
    selected = null; render();
  }
  function place(cardId, slot){
    const card = state.hand.find(c=>c.id===cardId);
    if(!card) return;
    state.hand = state.hand.filter(c=>c!==card);
    if(state.slots[slot]) state.hand.push(state.slots[slot]);
    state.slots[slot] = card;
    selected = null; render();
  }
  function unplace(slot){
    const c = state.slots[slot]; if(!c) return;
    state.slots[slot] = null; state.hand.push(c); selected = null; render();
  }
  /* 칸에 놓이지 않은 손패를 전부 새로 뽑음 */
  function reroll(){
    if(state.rerolls<=0) return;
    const n = state.hand.length; state.hand = [];
    for(let i=0;i<n;i++) state.hand.push(drawCard(inPlay()));
    state.rerolls--; selected=null; render();
  }

  /* ---------- 문장 ---------- */
  function sentenceParts(){
    const S = k => {
      const f = fitted(k), c = state.slots[k];
      return {text: f ? f.text : CATS[k].label,
        slot:{key:k, label:CATS[k].label, color:CATS[k].color, filled:!!c, word:c?.text || null, cardCat:c?.cat || null, glue:f?.glue || null, bad:f?.bad || null}};
    };
    const T = text => ({text});
    const who = word("who"), unit = word("unit");
    return [
      S("who"), T(who ? iGa(who)+" " : "이(가) "), S("where"), T("에서 "), S("like"), T(" "), S("act"), T(". "),
      S("hit"), T("에 닿으면 "), S("result"), T(". 점수는 "), S("unit"), T((unit?euro(unit):"(으)로")+" 센다.")
    ];
  }

  /* ---------- 그리기 ---------- */
  const TEMPLATE = `
    <div class="ph"><h2>작업대</h2><span>카드는 아무 칸에나 놓을 수 있어요. 품사가 안 맞으면 연결 토큰이 붙어요</span></div>
    <div class="row">
      <button class="btn" data-act="reroll">손패 다시 뽑기 <b data-rerolls>3</b></button>
      <button class="btn" data-act="new">새 판</button>
      <span class="glue-meter" data-glue></span>
    </div>
    <div class="hand" data-hand aria-label="손패"></div>
    <div class="script">
      <div class="blk ev">
        <svg class="flag" viewBox="0 0 20 20" aria-hidden="true"><path d="M4 2v16" stroke="#2B2000" stroke-width="2" fill="none"/><path d="M5 3h10l-2.5 3.5L15 10H5z" fill="#3BB54A" stroke="#1E7A2A"/></svg>
        <span>시작하면</span><span data-slot="who"></span><span data-j="who">이(가)</span><span data-slot="where"></span><span>에서 등장</span>
      </div>
      <div class="cblk">
        <div class="blk ctrl top"><span>무한 반복</span></div>
        <div class="mid"><div class="arm"></div><div class="inner">
          <div class="blk mot"><span data-slot="like"></span><span data-slot="act"></span></div>
        </div></div>
        <div class="foot"><small>↻</small></div>
      </div>
      <div class="blk ctrl"><span>만약</span><span data-slot="hit"></span><span>에 닿으면</span><span data-slot="result"></span></div>
      <div class="blk var"><span>점수 단위를</span><span data-slot="unit"></span><span data-j="unit">(으)로 정하기</span></div>
    </div>
    <p class="hint">칸에 놓인 카드를 다시 누르면 손패로 돌아와요. 손패는 무작위라 칸에 딱 맞는 카드가 없을 수도 있어요. 그게 이 게임이에요.</p>`;

  function cardEl(c){
    const b=document.createElement("button");
    b.className="card"+(selected===c.id?" sel":""); b.dataset.id=c.id; b.draggable=true;
    b.style.setProperty("--r", c.r+"deg"); b.style.setProperty("--c", `var(${CATS[c.cat].color})`);
    b.innerHTML=`<span class="cat"><span class="dot"></span></span><span></span>`;
    b.firstChild.append(window.Grammar ? Grammar.LABEL[Grammar.typeOf(c.cat)] : CATS[c.cat].label);
    b.lastChild.textContent=c.text;
    b.setAttribute("aria-pressed", selected===c.id);
    b.onclick=()=>{ selected = selected===c.id?null:c.id; render(); };
    b.ondragstart=e=>{ e.dataTransfer.setData("text/plain",c.id); selected=c.id; highlight(); };
    b.ondragend=()=>{ selected=null; render(); };
    return b;
  }
  function slotEl(k){
    const c=state.slots[k], f=fitted(k), b=document.createElement("button");
    b.className="slot"+(c?"":" empty"); b.dataset.cat=k;
    b.style.setProperty("--c", `var(${c ? CATS[c.cat].color : CATS[k].color})`);
    b.innerHTML=`<span class="dot"></span><span></span>`;
    b.lastChild.textContent = c ? c.text : CATS[k].label;
    if(f?.glue){ const g=document.createElement("span"); g.className="glue"; g.textContent="+"+f.glue; b.appendChild(g); }
    b.setAttribute("aria-label", `${CATS[k].label} 칸: ${c ? (f?.text || c.text) : "비어 있음"}`);
    b.onclick=()=>{ if(selected){ place(selected,k); return; } if(c) unplace(k); };
    b.ondragover=e=>{ if(selected){ e.preventDefault(); b.classList.add("over"); } };
    b.ondragleave=()=>b.classList.remove("over");
    b.ondrop=e=>{ e.preventDefault(); place(e.dataTransfer.getData("text/plain")||selected, k); };
    return b;
  }
  function render(){
    const hand=q("[data-hand]"); hand.innerHTML="";
    state.hand.forEach(c=>hand.appendChild(cardEl(c)));
    if(!state.hand.length){ const p=document.createElement("span"); p.className="hand-empty"; p.textContent="손패가 비었어요. 칸의 카드를 눌러 돌려받을 수 있어요."; hand.appendChild(p); }
    root.querySelectorAll("[data-slot]").forEach(h=>h.replaceChildren(slotEl(h.dataset.slot)));
    q('[data-j="who"]').textContent = word("who") ? iGa(word("who")) : "이(가)";
    q('[data-j="unit"]').textContent = (word("unit") ? euro(word("unit")) : "(으)로")+" 정하기";
    q("[data-rerolls]").textContent=state.rerolls;
    q('[data-act="reroll"]').disabled = state.rerolls<=0 || !state.hand.length;
    if(window.Grammar){
      const used = ORDER.filter(k=>fitted(k)?.glue).length;
      const el=q("[data-glue]"); el.textContent=`연결 토큰 ${used}/${Grammar.BUDGET}`; el.classList.toggle("over", used>Grammar.BUDGET);
    }
    highlight(); save();
    listeners.forEach(fn=>fn());
  }
  /* 카드를 고르면 모든 칸이 받을 수 있다고 표시. 품사가 안 맞는 칸은 연결 토큰이 든다는 표시 */
  function highlight(){
    const sc = state.hand.find(x=>x.id===selected);
    root.querySelectorAll(".slot").forEach(s=>{
      const fits = sc && (!window.Grammar || Grammar.accepts(s.dataset.cat, sc.cat));
      s.classList.toggle("target", !!sc && fits);
      s.classList.toggle("target-glue", !!sc && !fits);
    });
  }

  /* ---------- 이 브라우저에 판 기억 ---------- */
  function save(){ try{ localStorage.setItem(STORE, JSON.stringify({state,uid})); }catch{} }
  function load(){
    try{ const d=JSON.parse(localStorage.getItem(STORE)||"null");
      if(d && d.state && d.state.slots && Array.isArray(d.state.hand) && ORDER.every(k=>k in d.state.slots)){ state=d.state; uid=d.uid||100; return true; } }catch{}
    return false;
  }

  /* ---------- 공개 API ---------- */
  window.Blocks = {
    mount(el){
      root = el; root.innerHTML = TEMPLATE;
      q('[data-act="reroll"]').onclick = reroll;
      q('[data-act="new"]').onclick = newGame;
      if(load()) render(); else newGame();
    },
    onChange(fn){ listeners.push(fn); },
    filledCount(){ return ORDER.filter(k=>state.slots[k]).length; },
    total(){ return ORDER.length; },
    isComplete(){ return this.filledCount()===ORDER.length; },
    sentenceParts,
    sentence(){ return sentenceParts().map(p=>p.slot && !p.slot.filled ? "[ ? ]" : p.text).join(""); },
    guide(){ return ORDER.filter(k=>word(k)).map(k=>`${CATS[k].guide}: ${word(k)}`); },
    title(){ return word("who") || "아무말 게임"; }
  };
})();
