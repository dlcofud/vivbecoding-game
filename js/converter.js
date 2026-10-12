/* 토큰 변환기 담당: 문장 → 제출 전 점검 → 심사위원 심사 → 게임 빌드 → 무대 → 다운로드
 *
 * 블록 쪽 정보는 window.Blocks 로만 읽습니다 (blocks.js 맨 위 설명 참고).
 *   심사위원             js/judges.js
 *   문법·연결 토큰 규칙  js/grammar.js
 *   명령어·절약 장치     js/token-saver.js
 *   단어 해석표          js/word-meta.js
 *   게임 엔진            js/game-template.js
 *
 *   Converter.mount(el)    심사대와 무대를 el 안에 그림
 *   Converter.update()     블록이 바뀔 때 main.js 가 호출
 *
 * Blocks 에서 꼭 필요한 것: mount, onChange, isComplete, filledCount, total, sentence, sentenceParts, title
 * 있으면 더 좋은 것: sentenceParts 의 slot.key/word/cardCat/glue (연결 토큰 규칙), Blocks.refresh()
 */
(function(){
  const TS = window.TokenSaver, J = window.Judges.JUDGES;
  const PREF_KEY = "amumal-converter-prefs-v3", DAY = 86400000;
  let root = null, sample = null, sampleState = "pending", downloads = null;
  let busy = false, ctl = null, lastHtml = "", lastTitle = "";
  let prefs = loadPrefs();
  const q = s => root.querySelector(s);
  const fmt = n => Math.round(n).toLocaleString();
  const mode = () => TS.MODES[prefs.mode];
  const judge = () => J[prefs.judge];

  function loadPrefs(){
    try{ const p=JSON.parse(localStorage.getItem(PREF_KEY)); if(p && TS.MODES[p.mode] && TS.TIERS[p.tier] && J[p.judge]) return {sound:true, ...p}; }catch{}
    return {mode:"config", tier:"quick", judge:"warm", sound:true};
  }
  function savePrefs(){ try{ localStorage.setItem(PREF_KEY, JSON.stringify(prefs)); }catch{} }

  /* Blocks.sentenceParts() 를 이 파일이 쓰는 모양으로 맞춤.
     블록 쪽이 key/word/cardCat/glue 를 안 주면 색 토큰으로 카테고리를 찾아 채움 (블록 쪽 구현이 바뀌어도 안 깨지게) */
  function parts(){
    const W = window.WORDS || {};
    const catByColor = c => Object.keys(W).find(k => W[k].color === c);
    return Blocks.sentenceParts().map(p=>{
      if(!p.slot) return p;
      const cat = p.slot.key || catByColor(p.slot.color);
      const word = p.slot.word ?? (p.slot.filled ? p.text : null);
      return {...p, slot:{...p.slot, key:cat, word, cardCat:p.slot.cardCat || cat}};
    });
  }
  const prompt = () => TS.buildPrompt(prefs.mode, Blocks.sentence(), prefs.judge);

  /* ---------- 효과음 (js/sounds.js, 출처 assets/sounds/CREDITS.md) ---------- */
  let drum = null;
  function play(name, loop){
    if(!prefs.sound || !window.SOUNDS?.[name]) return null;
    try{ const a=new Audio(SOUNDS[name]); a.loop=!!loop; a.volume=.8; a.play().catch(()=>{}); return a; }catch{ return null; }
  }
  const stopDrum = () => { if(drum){ drum.pause(); drum=null; } };
  const startDrum = () => { stopDrum(); drum = play("drumroll", true); };
  const wait = ms => new Promise(r=>setTimeout(r, ms));
  const cacheKey = () => TS.cache.key(prefs.mode, prefs.tier, prompt());
  const grammar = () => Grammar.check(parts());
  /* 제출 가능: 빈칸·못 들어가는 카드가 없을 때. 연결 토큰 초과는 제출은 되지만 바로 탈락 */
  const blocking = g => g.errors.filter(e=>!e.startsWith("연결 토큰 초과"));
  const overBudget = g => g.glueUsed > g.budget;

  function tokenize(s){
    const out=[]; for(const w of s.split(/\s+/)){ if(!w) continue; for(let i=0;i<w.length;i+=2) out.push((i===0?"·":"")+w.slice(i,i+2)); }
    return out;
  }

  /* ---------- 그리기 ---------- */
  const seg = (name, options) => `<div class="seg" role="radiogroup" data-seg="${name}">${
    Object.entries(options).map(([k,o])=>`<button role="radio" data-v="${k}" title="${o.desc}">${o.label}</button>`).join("")}</div>`;
  const judgeCards = () => `<div class="judges" role="radiogroup" aria-label="심사위원" data-judges>${
    Object.entries(J).map(([k,j])=>`<button role="radio" class="judge" data-v="${k}"><span class="j-face" aria-hidden="true">${j.emoji}</span><span class="j-name">${j.name}</span><span class="j-desc">${j.desc}</span></button>`).join("")}</div>`;

  const TEMPLATE = `
    <section class="panel" aria-labelledby="h-tok">
      <div class="ph"><h2 id="h-tok">심사대</h2><button class="btn sound" data-act="sound" aria-pressed="true"></button></div>
      <p class="sentence" data-sentence></p>
      <div class="tokens" data-tokens aria-label="토큰 미리보기"></div>

      <div class="sub">심사위원 고르기</div>
      ${judgeCards()}

      <div class="checks" data-checks aria-live="polite"></div>

      <details class="more">
        <summary>빌드 방식과 예상 사용량</summary>
        <div class="opts">
          <div class="opt"><span class="opt-l">빌드 방식</span>${seg("mode", TS.MODES)}</div>
          <div class="opt" data-tier-opt><span class="opt-l">모델</span>${seg("tier", TS.TIERS)}</div>
        </div>
        <div class="cost">
          <div><span>보내는 명령</span><b data-c="in">—</b></div>
          <div><span>받을 답 (예상)</span><b data-c="out">—</b></div>
          <div><span>이번 제출 합계 (예상)</span><b data-c="sum">—</b></div>
        </div>
        <p class="hint" data-c="note"></p>
        <p class="usage"><span data-usage></span> <button class="link" data-act="reset-usage">기록 지우기</button></p>
      </details>

      <div class="go">
        <button class="cta" data-act="build" disabled>제출하고 심사받기</button>
        <button class="btn" data-act="fresh" hidden>다시 심사받기</button>
        <button class="btn" data-act="copy">명령어 복사</button>
      </div>
      <div class="verdict" data-verdict hidden></div>
      <p class="status" data-status role="status"></p>
    </section>

    <section class="panel" aria-labelledby="h-stage">
      <div class="ph"><h2 id="h-stage">무대</h2><span data-meta>아직 통과한 게임이 없어요</span></div>
      <div class="tabs" role="tablist">
        <button class="tab" role="tab" aria-selected="true" data-tab="play">플레이</button>
        <button class="tab" role="tab" aria-selected="false" data-tab="code">코드</button>
        <button class="tab" role="tab" aria-selected="false" data-tab="prompt">명령어</button>
      </div>
      <div data-view="play">
        <div class="stage" data-stage>
          <div class="idle"><strong>통과하면 여기서 실행돼요</strong><p>손패로 일곱 칸을 채우고 심사위원에게 제출하세요. 말이 안 되면 게임은 만들어지지 않아요.</p></div>
        </div>
      </div>
      <pre class="codebox" data-view="code" hidden>아직 코드가 없어요.</pre>
      <pre class="codebox" data-view="prompt" hidden></pre>
      <div class="row">
        <button class="btn primary" data-act="download" hidden>게임 다운로드 (.html)</button>
        <button class="btn" data-act="restart" hidden>게임 다시 불러오기</button>
        <button class="btn" data-act="stop" hidden>멈추기</button>
      </div>
    </section>`;

  function update(){
    /* 문장 */
    const sEl=q("[data-sentence]"); sEl.innerHTML="";
    for(const p of Blocks.sentenceParts()){
      if(!p.slot){ sEl.append(p.text); continue; }
      const s=document.createElement("span");
      s.style.setProperty("--c",`var(${p.slot.color})`);
      s.className=p.slot.filled?"w":"gap"; s.textContent=p.text;
      if(p.slot.glue){ s.classList.add("glued"); s.title=`연결 토큰: ${p.slot.glue}`; }
      sEl.appendChild(s);
    }
    const tk=q("[data-tokens]"); tk.innerHTML="";
    tokenize(Blocks.sentence()).forEach(t=>{ const s=document.createElement("span"); s.className="tok"; s.textContent=t; tk.appendChild(s); });

    const sb=q('[data-act="sound"]'); sb.textContent = prefs.sound ? "🔊 소리 켜짐" : "🔇 소리 꺼짐"; sb.setAttribute("aria-pressed", prefs.sound);

    /* 심사위원 */
    q("[data-judges]").querySelectorAll(".judge").forEach(b=>b.setAttribute("aria-checked", b.dataset.v===prefs.judge));

    /* 제출 전 점검 */
    const gr = grammar(), done = Blocks.isComplete(), over = overBudget(gr), block = blocking(gr);
    const checks = [
      {ok: done, text: done ? "일곱 칸을 다 채웠어요" : `빈칸이 있어요 (${Blocks.filledCount()}/${Blocks.total()})`},
      {ok: !over, text: `연결 토큰 ${gr.glueUsed}/${gr.budget}` + (over ? `: ${judge().name}에게는 너무 많아요. 이대로 내면 바로 탈락해요` : gr.glueUsed ? ": 억지로 이은 곳이 있어요" : ": 억지 연결 없음")},
      ...block.filter(e=>e.includes("칸:")).map(e=>({ok:false, text:e})),
      {ok: null, text: mode().claude ? `${judge().name}이 말이 이어지는지 직접 봐요` : `0 토큰 모드: ${judge().name}의 미리 써 둔 멘트로 심사해요`}
    ];
    q("[data-checks]").innerHTML = checks.map(c=>`<div class="chk ${c.ok===true?"pass":c.ok===false?"fail":"info"}"><i aria-hidden="true">${c.ok===true?"✓":c.ok===false?"✕":"·"}</i><span></span></div>`).join("");
    q("[data-checks]").querySelectorAll(".chk span").forEach((el,i)=>el.textContent=checks[i].text);

    /* 빌드 방식 */
    root.querySelectorAll("[data-seg]").forEach(g=>{
      const cur = prefs[g.dataset.seg];
      g.querySelectorAll("button").forEach(b=>b.setAttribute("aria-checked", b.dataset.v===cur));
    });
    q("[data-tier-opt]").hidden = !mode().claude;

    /* 예상 사용량 */
    const canSubmit = done && !block.length;
    const local = !mode().claude || over;   // Claude를 안 부르는 경우
    const cached = canSubmit && !local ? TS.cache.get(cacheKey()) : null;
    if(!canSubmit){
      ["in","out","sum"].forEach(k=>q(`[data-c="${k}"]`).textContent="—");
      q('[data-c="note"]').textContent = "일곱 칸을 다 채워야 제출할 수 있어요.";
    } else if(local){
      ["in","out","sum"].forEach(k=>q(`[data-c="${k}"]`).textContent="0 토큰");
      q('[data-c="note"]').textContent = over ? "연결 토큰 한도를 넘어서 Claude에게 보내지 않고 바로 탈락 처리해요." : mode().desc;
    } else {
      const pin = TS.count(prompt()), [lo,hi] = mode().expectOut;
      q('[data-c="in"]').textContent = cached ? "0 (저장본)" : `≈ ${fmt(pin)} 토큰`;
      q('[data-c="out"]').textContent = cached ? "0 (저장본)" : `≈ ${fmt(lo)}~${fmt(hi)} 토큰`;
      q('[data-c="sum"]').textContent = cached ? "0 토큰" : `≈ ${fmt(pin+lo)}~${fmt(pin+hi)} 토큰`;
      q('[data-c="note"]').textContent = cached
        ? "같은 심사위원에게 같은 문장을 낸 적이 있어서 저장된 심사 결과를 써요."
        : mode().desc + " 심사 멘트가 3~5문장이라 그만큼 받는 토큰이 들어요. 탈락하면 멘트만 받아요. " + TS.TIERS[prefs.tier].desc;
    }
    q('[data-view="prompt"]').textContent = local
      ? "이번 제출은 Claude에게 아무것도 보내지 않아요."
      : done ? prompt() : "모든 칸을 채우면 명령어가 여기 나타나요.";

    /* 버튼 */
    const build=q('[data-act="build"]'), needClaude = !local && !cached;
    build.textContent = !canSubmit ? "일곱 칸을 채워야 제출할 수 있어요"
      : local ? `${judge().emoji} 제출하기 (0 토큰)`
      : cached ? `${judge().emoji} 저장된 심사 결과 보기 (0 토큰)`
      : sampleState==="off" ? "여기선 Claude 심사를 못 받아요"
      : `${judge().emoji} ${judge().name}에게 제출하기`;
    build.disabled = !canSubmit || busy || (needClaude && sampleState!=="on");
    q('[data-act="fresh"]').hidden = !cached || sampleState!=="on";
    q('[data-act="fresh"]').disabled = busy;

    const u=TS.usage.get();
    q("[data-usage]").textContent = u.builds
      ? `이 브라우저 누적: Claude 호출 ${u.builds}회 · 약 ${fmt(u.input+u.output)} 토큰 사용 · 저장본으로 약 ${fmt(u.saved)} 토큰 아낌`
      : (u.saved ? `저장본으로 약 ${fmt(u.saved)} 토큰 아낌` : "아직 이 브라우저에서 Claude를 부른 기록이 없어요.");
    q('[data-act="reset-usage"]').hidden = !u.builds && !u.saved;
  }

  const setStatus = t => { q("[data-status]").textContent=t; };
  function showTab(name){
    root.querySelectorAll(".tab").forEach(t=>t.setAttribute("aria-selected", t.dataset.tab===name));
    root.querySelectorAll("[data-view]").forEach(v=>v.hidden = v.dataset.view!==name);
  }
  function showVerdict(j, v){
    const box=q("[data-verdict]"); box.hidden=false; box.className="verdict "+(v.ok?"pass":"fail");
    box.innerHTML=`<div class="v-head"><span class="v-face" aria-hidden="true"></span><div><strong></strong><span class="v-who"></span></div><b class="v-score"></b></div><p class="v-comment"></p>`;
    box.querySelector(".v-face").textContent=j.emoji;
    box.querySelector("strong").textContent=v.ok?"통과":"탈락";
    box.querySelector(".v-who").textContent=j.name;
    box.querySelector(".v-score").textContent=v.ok?`${v.score}/10`:"";
    box.querySelector(".v-comment").textContent=`“${v.comment}”`;
  }
  const hideVerdict = () => { q("[data-verdict]").hidden = true; };

  /* ---------- 무대 ---------- */
  const titleOf = html => (html.match(/<title>([^<]*)<\/title>/i)?.[1] || "").trim();
  function showGame(html, codeText, meta){
    lastHtml = html; lastTitle = titleOf(html) || Blocks.title()+" 게임";
    const f=document.createElement("iframe");
    f.setAttribute("sandbox","allow-scripts"); f.title=lastTitle; f.srcdoc=html;
    q("[data-stage]").replaceChildren(f);
    q('[data-view="code"]').textContent = codeText;
    q("[data-meta]").textContent = meta;
    q('[data-act="restart"]').hidden=false;
    q('[data-act="download"]').hidden=false;
    showTab("play");
    setTimeout(()=>{ try{ f.focus(); }catch{} },300);
  }
  function liteTitle(code){ const m = code.match(/title\s*:\s*(["'`])([^"'`\n]+)\1/); return m ? m[2] : ""; }

  /* 심사 결과 → 게임 */
  function apply(j, v, m, base, costText){
    stopDrum(); play(j.sfx?.[v.ok ? "pass" : "fail"]);
    showVerdict(j, v);
    if(!v.ok){
      setStatus(`게임이 만들어지지 않았어요. 카드를 바꾸거나, 다른 칸에 넣거나, 다른 심사위원에게 내 보세요. ${costText}`);
      return;
    }
    let html, code;
    if(m==="config" || m==="zero"){ const cfg = v.config ? WordMeta.merge(base, v.config) : base; html = GameTemplate.wrapConfig(cfg, {muted:!prefs.sound}); code = JSON.stringify(cfg, null, 1); }
    else if(m==="lite"){ code = v.code; html = GameTemplate.wrap(v.code, liteTitle(v.code)); }
    else { code = v.html; html = v.html; }
    showGame(html, code, `“${titleOf(html) || Blocks.title()}” · ${j.name} ${v.score}/10 · ${costText}`);
    setStatus(`통과! 무대를 클릭하고 플레이하세요. ${costText}`);
  }

  /* ---------- 제출 ---------- */
  const ERR = {
    not_granted:"Claude 사용을 허락하지 않아서 심사를 못 받아요. 0 토큰 모드로 연습하거나 명령어를 복사해서 쓰세요.",
    sampling_disabled:"이 계정에서는 Claude를 부를 수 없어요.",
    rate_limited:"요청이 너무 많거나 사용 한도에 닿았어요. 잠시 뒤에 다시 눌러 주세요.",
    session_expired:"다시 로그인해야 해요.",
    refused:"Claude가 이 문장은 다루지 않겠다고 했어요. 카드를 바꿔 보세요.",
    empty_completion:"빈 답이 왔어요. 다시 눌러 보세요.",
    invalid_json:"심사 결과를 읽지 못했어요. 다시 눌러 보세요.",
    upstream_error:"연결이 끊겼어요. 다시 눌러 보세요."
  };

  function localJudge(){
    const ps = parts().filter(p=>p.slot), words = {};
    for(const p of ps) if(p.slot.key && !(p.slot.key in words)) words[p.slot.key] = p.text;
    const glued = ps.filter(p=>p.slot.glue).map(p=>p.slot.word);
    return Judges.localVerdict(prefs.judge, {words, glued, glueUsed: glued.length});
  }

  async function build(force){
    const gr = grammar();
    if(busy || !Blocks.isComplete() || blocking(gr).length) return;
    hideVerdict();
    const m = prefs.mode, j = judge();
    const {cfg: base, unknown} = WordMeta.compile(parts());

    /* Claude를 부르지 않는 경우: 0 토큰 모드, 또는 연결 토큰 초과(어차피 탈락) */
    if(!TS.MODES[m].claude || overBudget(gr)){
      const v = localJudge();
      busy=true; update(); startDrum(); setStatus(`${j.emoji} ${j.name}이 문장을 읽고 있어요…`);
      await wait(1400);   // 두구두구
      busy=false;
      apply(j, v, "zero", base, "0 토큰");
      if(v.ok && unknown.length) setStatus(`통과! 해석표에 없는 단어 ${unknown.length}개(${unknown.join(", ")})는 기본값으로 조립했어요. 0 토큰`);
      return;
    }

    const tier=prefs.tier, p=prompt(), key=TS.cache.key(m,tier,p);
    const hit = !force && TS.cache.get(key);
    if(hit){
      busy=true; update(); startDrum(); await wait(900); busy=false;
      TS.usage.addSaved((hit.inTok||0)+(hit.outTok||0));
      apply(j, hit.v, m, base, `저장된 결과라 0 토큰 (약 ${fmt((hit.inTok||0)+(hit.outTok||0))} 토큰 아낌)`);
      update(); return;
    }
    if(!sample) return;

    busy=true; update(); startDrum();
    const inTok=TS.count(p);
    ctl=new AbortController();
    q('[data-act="stop"]').hidden=false;
    const box=q('[data-view="code"]');
    box.textContent="심사 중…";
    setStatus(`${j.emoji} ${j.name}이 문장을 읽고 있어요…`);
    let raw="";
    try{
      const opts = {
        signal:ctl.signal, modelTier:tier,
        cache: force ? {gcTime:DAY, refresh:true} : {gcTime:DAY},   // 같은 명령이면 하루 동안 플랫폼도 다시 안 물어봄
        onText:({text})=>{ raw=text; box.textContent=text; box.scrollTop=box.scrollHeight; setStatus(`${j.emoji} 심사 중… 약 ${fmt(TS.count(text))} 토큰 받음`); }
      };
      let v;
      if(m==="config"){ const obj = await sample.json(p, opts); raw = raw || JSON.stringify(obj); v = TS.verdict(m, obj); }
      else { const {text} = await sample(p, opts); raw = text; v = TS.verdict(m, text); }
      const outTok = TS.count(raw);
      TS.usage.add(inTok, outTok);
      TS.cache.put(key, {v, inTok, outTok});
      apply(j, v, m, base, `약 ${fmt(inTok+outTok)} 토큰 (보냄 ${fmt(inTok)} + 받음 ${fmt(outTok)})`);
    }catch(e){
      if(e && e.code==="cancelled") setStatus("멈췄어요.");
      else{
        setStatus(ERR[e?.code] || ERR.upstream_error);
        if(e?.code==="not_granted"||e?.code==="sampling_disabled") sampleState="off";
        if(e?.code==="refused") box.textContent="";
      }
    }finally{
      busy=false; stopDrum(); q('[data-act="stop"]').hidden=true; update();
    }
  }

  /* ---------- 다운로드 ---------- */
  function fileName(){
    const base = (lastTitle || "아무말 게임").replace(/[\\/:*?"<>|\u0000-\u001f]/g, "").replace(/\s+/g, " ").trim().slice(0, 60);
    return (base || "아무말 게임") + ".html";
  }
  async function download(){
    if(!lastHtml) return;
    const filename = fileName();
    if(downloads){
      try{ await downloads.save({filename, data:lastHtml}); setStatus(`“${filename}”을 저장했어요.`); }
      catch(e){
        setStatus(e?.code==="declined" ? "저장을 취소했어요."
          : e?.code==="rate_limited" ? "저장 창이 이미 열려 있어요. 그 창부터 닫아 주세요."
          : "여기서는 파일을 저장할 수 없어요. 코드 탭의 내용을 복사해서 .html 파일로 저장해 주세요.");
      }
      return;
    }
    const url = URL.createObjectURL(new Blob([lastHtml], {type:"text/html;charset=utf-8"}));
    const a = document.createElement("a"); a.href=url; a.download=filename;
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(()=>URL.revokeObjectURL(url), 2000);
    setStatus(`“${filename}”을 내려받았어요. 더블클릭하면 브라우저에서 바로 실행돼요.`);
  }

  async function copyPrompt(){
    const text = mode().claude && Blocks.isComplete() ? prompt() : Blocks.sentence();
    try{ await navigator.clipboard.writeText(text); setStatus(`복사했어요 (약 ${fmt(TS.count(text))} 토큰).`); }
    catch{
      const v=q('[data-view="prompt"]'); showTab("prompt");
      const r=document.createRange(); r.selectNodeContents(v); const s=getSelection(); s.removeAllRanges(); s.addRange(r);
      setStatus("명령어를 선택해 두었어요. Ctrl+C로 복사하세요.");
    }
  }

  /* ---------- 공개 API ---------- */
  window.Converter = {
    mount(el){
      root = el; root.innerHTML = TEMPLATE;
      Grammar.setBudget(judge().budget);
      root.querySelectorAll(".tab").forEach(t=>t.onclick=()=>showTab(t.dataset.tab));
      root.querySelectorAll("[data-seg]").forEach(g=>g.onclick=e=>{
        const b=e.target.closest("button"); if(!b || busy) return;
        prefs[g.dataset.seg]=b.dataset.v; savePrefs(); update();
      });
      q("[data-judges]").onclick = e=>{
        const b=e.target.closest(".judge"); if(!b || busy || b.dataset.v===prefs.judge) return;
        prefs.judge=b.dataset.v; savePrefs(); hideVerdict();
        Grammar.setBudget(judge().budget);
        if(Blocks.refresh) Blocks.refresh(); else update();   // 연결 토큰 한도 표시가 바뀜
        setStatus(`${judge().emoji} ${judge().name}로 바꿨어요. ${judge().desc}`);
      };
      q('[data-act="build"]').onclick = ()=>build(false);
      q('[data-act="fresh"]').onclick = ()=>build(true);
      q('[data-act="copy"]').onclick = copyPrompt;
      q('[data-act="stop"]').onclick = ()=>ctl?.abort();
      q('[data-act="download"]').onclick = download;
      q('[data-act="restart"]').onclick = ()=>{ if(lastHtml) showGame(lastHtml, q('[data-view="code"]').textContent, q("[data-meta]").textContent); };
      q('[data-act="reset-usage"]').onclick = ()=>{ TS.usage.reset(); update(); };
      q('[data-act="sound"]').onclick = ()=>{ prefs.sound=!prefs.sound; savePrefs(); if(!prefs.sound) stopDrum(); update(); };
      (async()=>{
        await null; // main.js 가 Blocks 를 다 붙인 뒤에 실행
        const use = name => window.claude ? window.claude.use(name).catch(()=>null) : Promise.resolve(null);
        [sample, downloads] = await Promise.all([use("sample"), use("downloads")]);
        sampleState = sample ? "on" : "off";
        if(!sample){
          if(mode().claude){ prefs.mode="zero"; }
          setStatus("여기서는 Claude 심사를 받을 수 없어서 0 토큰 모드(미리 써 둔 멘트)로 심사해요.");
        }
        update();
      })();
    },
    update(){ if(root) update(); }
  };
})();
