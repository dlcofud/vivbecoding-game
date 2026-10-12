/* 블록 코딩 조합 담당: 손패, 블록 스크립트, 빈칸 채우기, 문장 만들기
 *
 * 토큰 변환기(converter.js)는 아래 window.Blocks 의 함수만 씁니다.
 * 이 함수들의 이름과 돌려주는 모양만 지키면, 블록 모양·카테고리·규칙은 마음대로 바꿔도 됩니다.
 *
 *   Blocks.mount(el)          작업대를 el 안에 그림
 *   Blocks.onChange(fn)       카드가 움직일 때마다 fn() 호출
 *   Blocks.filledCount()      채운 칸 수
 *   Blocks.total()            전체 칸 수
 *   Blocks.isComplete()       다 채웠는지
 *   Blocks.sentence()         완성 문장 (문자열)
 *   Blocks.sentenceParts()    [{text, slot?:{label, color, filled}}]  문장을 색칠해서 보여줄 때 씀
 *   Blocks.guide()            ["주인공 (플레이어가 조종): 매국노", ...]  명령어의 해석 가이드 줄
 *   Blocks.title()            게임 이름으로 쓸 짧은 단어 (주인공)
 */
(function(){
  const CATS = window.WORDS;
  const ORDER = Object.keys(CATS);
  const PER_CAT = 2, REROLLS = 3, STORE = "amumal-blocks-v1";

  let uid = 0, state, selected = null, root = null;
  const listeners = [];
  const rnd = a => a[Math.floor(Math.random()*a.length)];
  const q = s => root.querySelector(s);

  /* ---------- 한국어 조사 ---------- */
  function jong(w){ const t=w.trim(); const c=t.charCodeAt(t.length-1); if(c<0xAC00||c>0xD7A3) return 0; return (c-0xAC00)%28; }
  const iGa = w => jong(w) ? "이" : "가";
  const euro = w => { const j=jong(w); return (j===0||j===8) ? "로" : "으로"; };

  /* ---------- 상태 ---------- */
  function inPlay(){ return new Set([...state.hand.map(c=>c.text), ...Object.values(state.slots).filter(Boolean).map(c=>c.text)]); }
  function drawWord(cat, exclude){
    const pool = CATS[cat].words.filter(w => !exclude.has(w));
    return {id:"c"+(++uid), cat, text: rnd(pool.length?pool:CATS[cat].words), r:(Math.random()*5-2.5).toFixed(1)};
  }
  function shuffle(a){ for(let i=a.length-1;i>0;i--){const j=Math.floor(Math.random()*(i+1));[a[i],a[j]]=[a[j],a[i]];} }
  function newGame(){
    state = {hand:[], slots:Object.fromEntries(ORDER.map(k=>[k,null])), rerolls:REROLLS};
    for(const cat of ORDER) for(let i=0;i<PER_CAT;i++) state.hand.push(drawWord(cat, inPlay()));
    shuffle(state.hand);
    autoFill();
    selected = null; render();
  }
  function autoFill(){
    for(const cat of ORDER){
      if(state.slots[cat]) continue;
      const opts = state.hand.filter(c=>c.cat===cat);
      if(!opts.length) continue;
      const pick = rnd(opts);
      state.hand = state.hand.filter(c=>c!==pick);
      state.slots[cat] = pick;
    }
  }
  function place(cardId, cat){
    const card = state.hand.find(c=>c.id===cardId);
    if(!card || card.cat!==cat) return;
    state.hand = state.hand.filter(c=>c!==card);
    if(state.slots[cat]) state.hand.push(state.slots[cat]);
    state.slots[cat] = card;
    selected = null; render();
  }
  function unplace(cat){
    const c = state.slots[cat]; if(!c) return;
    state.slots[cat] = null; state.hand.push(c); selected = null; render();
  }
  function reroll(){
    if(state.rerolls<=0) return;
    const keep=new Set(Object.values(state.slots).filter(Boolean).map(c=>c.text));
    state.hand = state.hand.map(c=>{ const n=drawWord(c.cat, new Set([...keep, ...state.hand.map(h=>h.text)])); keep.add(n.text); return n; });
    state.rerolls--; selected=null; render();
  }
  const word = k => state.slots[k]?.text || null;

  /* ---------- 문장 ---------- */
  function sentenceParts(){
    const w = Object.fromEntries(ORDER.map(k=>[k, word(k)]));
    const S = k => ({text:w[k]||CATS[k].label, slot:{label:CATS[k].label, color:CATS[k].color, filled:!!w[k]}});
    const T = text => ({text});
    return [
      S("who"), T(w.who ? iGa(w.who)+" " : "이(가) "), S("where"), T("에서 "), S("like"), T(" "), S("act"), T(". "),
      S("hit"), T("에 닿으면 "), S("result"), T(". 점수는 "), S("unit"), T((w.unit?euro(w.unit):"(으)로")+" 센다.")
    ];
  }

  /* ---------- 그리기 ---------- */
  const TEMPLATE = `
    <div class="ph"><h2>작업대</h2><span>카드를 누른 뒤 같은 색 칸을 누르세요 (끌어다 놓아도 돼요)</span></div>
    <div class="row">
      <button class="btn" data-act="reroll">패 바꾸기 <b data-rerolls>3</b></button>
      <button class="btn" data-act="auto">손패로 자동 채우기</button>
      <button class="btn" data-act="new">새 판</button>
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
    <p class="hint">칸에 놓인 카드를 다시 누르면 손패로 돌아와요. 패 바꾸기는 칸에 놓이지 않은 카드만 새로 뽑아요.</p>`;

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
  function slotEl(cat){
    const c=state.slots[cat], b=document.createElement("button");
    b.className="slot"+(c?"":" empty"); b.dataset.cat=cat;
    b.style.setProperty("--c", `var(${CATS[cat].color})`);
    b.innerHTML=`<span class="dot"></span><span></span>`;
    b.lastChild.textContent = c ? c.text : CATS[cat].label;
    b.setAttribute("aria-label", `${CATS[cat].label} 칸: ${c?c.text:"비어 있음"}`);
    b.onclick=()=>{
      const sc=state.hand.find(x=>x.id===selected);
      if(sc && sc.cat===cat){ place(selected,cat); return; }
      if(c) unplace(cat);
    };
    b.ondragover=e=>{ const sc=state.hand.find(x=>x.id===selected); if(sc&&sc.cat===cat){ e.preventDefault(); b.classList.add("over"); } };
    b.ondragleave=()=>b.classList.remove("over");
    b.ondrop=e=>{ e.preventDefault(); place(e.dataTransfer.getData("text/plain")||selected, cat); };
    return b;
  }
  function render(){
    const hand=q("[data-hand]"); hand.innerHTML="";
    const sorted=[...state.hand].sort((a,b)=>ORDER.indexOf(a.cat)-ORDER.indexOf(b.cat));
    sorted.forEach(c=>hand.appendChild(cardEl(c)));
    if(!sorted.length){ const p=document.createElement("span"); p.className="hand-empty"; p.textContent="손패가 비었어요. 칸의 카드를 눌러 돌려받을 수 있어요."; hand.appendChild(p); }
    root.querySelectorAll("[data-slot]").forEach(h=>h.replaceChildren(slotEl(h.dataset.slot)));
    q('[data-j="who"]').textContent = word("who") ? iGa(word("who")) : "이(가)";
    q('[data-j="unit"]').textContent = (word("unit") ? euro(word("unit")) : "(으)로")+" 정하기";
    q("[data-rerolls]").textContent=state.rerolls;
    q('[data-act="reroll"]').disabled = state.rerolls<=0 || !state.hand.length;
    highlight(); save();
    listeners.forEach(fn=>fn());
  }
  function highlight(){
    const sc = state.hand.find(x=>x.id===selected);
    root.querySelectorAll(".slot").forEach(s=>s.classList.toggle("target", !!sc && sc.cat===s.dataset.cat));
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
      q('[data-act="auto"]').onclick = ()=>{ autoFill(); render(); };
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
