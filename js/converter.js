/* 토큰 변환기 담당: 문장 → 컴파일 검사 → (Claude 심사) → 게임 빌드 → 무대 → 다운로드
 *
 * 블록 쪽 정보는 window.Blocks 로만 읽습니다 (blocks.js 맨 위 설명 참고).
 *   문법·연결 토큰 규칙  js/grammar.js
 *   명령어·절약 장치     js/token-saver.js
 *   단어 해석표          js/word-meta.js
 *   게임 엔진            js/game-template.js
 *
 *   Converter.mount(el)    토큰 변환기와 무대를 el 안에 그림
 *   Converter.update()     블록이 바뀔 때 main.js 가 호출
 */
(function(){
  const TS = window.TokenSaver;
  const PREF_KEY = "amumal-converter-prefs-v2", DAY = 86400000;
  let root = null, sample = null, sampleState = "pending", downloads = null;
  let busy = false, ctl = null, lastHtml = "", lastTitle = "";
  let prefs = loadPrefs();
  const q = s => root.querySelector(s);
  const fmt = n => Math.round(n).toLocaleString();
  const mode = () => TS.MODES[prefs.mode];

  function loadPrefs(){
    try{ const p=JSON.parse(localStorage.getItem(PREF_KEY)); if(p && TS.MODES[p.mode] && TS.TIERS[p.tier]) return p; }catch{}
    return {mode:"config", tier:"quick"};
  }
  function savePrefs(){ try{ localStorage.setItem(PREF_KEY, JSON.stringify(prefs)); }catch{} }

  const prompt = () => TS.buildPrompt(prefs.mode, Blocks.sentence());
  const cacheKey = () => TS.cache.key(prefs.mode, prefs.tier, prompt());
  const grammar = () => Grammar.check(Blocks.sentenceParts());

  function tokenize(s){
    const out=[]; for(const w of s.split(/\s+/)){ if(!w) continue; for(let i=0;i<w.length;i+=2) out.push((i===0?"·":"")+w.slice(i,i+2)); }
    return out;
  }

  /* ---------- 그리기 ---------- */
  const seg = (name, options) => `<div class="seg" role="radiogroup" data-seg="${name}">${
    Object.entries(options).map(([k,o])=>`<button role="radio" data-v="${k}" title="${o.desc}">${o.label}</button>`).join("")}</div>`;

  const TEMPLATE = `
    <section class="panel" aria-labelledby="h-tok">
      <div class="ph"><h2 id="h-tok">토큰 변환기</h2><span>블록 → 문장 → 컴파일 검사 → 심사 → 게임</span></div>
      <p class="sentence" data-sentence></p>
      <div class="tokens" data-tokens aria-label="토큰 미리보기"></div>

      <div class="checks" data-checks aria-live="polite"></div>

      <div class="opts">
        <div class="opt"><span class="opt-l">빌드 방식</span>${seg("mode", TS.MODES)}</div>
        <div class="opt" data-tier-opt><span class="opt-l">모델</span>${seg("tier", TS.TIERS)}</div>
      </div>

      <div class="cost">
        <div><span>보내는 명령</span><b data-c="in">—</b></div>
        <div><span>받을 답 (예상)</span><b data-c="out">—</b></div>
        <div><span>이번 빌드 합계 (예상)</span><b data-c="sum">—</b></div>
      </div>
      <p class="hint" data-c="note"></p>

      <div class="go">
        <button class="cta" data-act="build" disabled>컴파일하고 게임 만들기</button>
        <button class="btn" data-act="fresh" hidden>다시 심사받기</button>
        <button class="btn" data-act="copy">명령어 복사</button>
      </div>
      <div class="verdict" data-verdict hidden></div>
      <p class="status" data-status role="status"></p>
      <p class="usage"><span data-usage></span> <button class="link" data-act="reset-usage">기록 지우기</button></p>
    </section>

    <section class="panel" aria-labelledby="h-stage">
      <div class="ph"><h2 id="h-stage">무대</h2><span data-meta>아직 빌드한 게임이 없어요</span></div>
      <div class="tabs" role="tablist">
        <button class="tab" role="tab" aria-selected="true" data-tab="play">플레이</button>
        <button class="tab" role="tab" aria-selected="false" data-tab="code">코드</button>
        <button class="tab" role="tab" aria-selected="false" data-tab="prompt">명령어</button>
      </div>
      <div data-view="play">
        <div class="stage" data-stage>
          <div class="idle"><strong>여기서 실행돼요</strong><p>손패로 일곱 칸을 채우고 컴파일 검사를 통과하면 게임이 만들어져요. 말이 안 되면 안 만들어져요.</p></div>
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
    /* 문장: 연결 토큰은 따로 표시 */
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

    /* 컴파일 검사 */
    const gr = grammar(), done = Blocks.isComplete();
    const checks = [
      {ok: done, text: done ? "일곱 칸을 다 채웠어요" : `빈칸이 있어요 (${Blocks.filledCount()}/${Blocks.total()})`},
      {ok: gr.glueUsed <= gr.budget, text: `연결 토큰 ${gr.glueUsed}/${gr.budget}` + (gr.glueUsed > gr.budget ? ": 억지로 이은 곳이 너무 많아요" : gr.glueUsed ? ": 억지로 이은 곳이 있어요" : ": 억지 연결 없음")},
      ...gr.errors.filter(e=>e.includes("칸:")).map(e=>({ok:false, text:e})),
      {ok: null, text: mode().claude ? "의미 심사: 빌드할 때 Claude가 말이 이어지는지 봐요" : "의미 심사: 0 토큰 모드라 건너뛰어요 (연습용)"}
    ];
    q("[data-checks]").innerHTML = checks.map(c=>`<div class="chk ${c.ok===true?"pass":c.ok===false?"fail":"info"}"><i aria-hidden="true">${c.ok===true?"✓":c.ok===false?"✕":"?"}</i><span></span></div>`).join("");
    q("[data-checks]").querySelectorAll(".chk span").forEach((el,i)=>el.textContent=checks[i].text);

    /* 선택 상태 */
    root.querySelectorAll("[data-seg]").forEach(g=>{
      const cur = prefs[g.dataset.seg];
      g.querySelectorAll("button").forEach(b=>b.setAttribute("aria-checked", b.dataset.v===cur));
    });
    q("[data-tier-opt]").hidden = !mode().claude;

    /* 비용 */
    const compiled = gr.ok;
    const cached = compiled && mode().claude ? TS.cache.get(cacheKey()) : null;
    if(!compiled){
      ["in","out","sum"].forEach(k=>q(`[data-c="${k}"]`).textContent="—");
      q('[data-c="note"]').textContent = "컴파일 검사를 통과해야 빌드할 수 있어요.";
    } else if(!mode().claude){
      ["in","out","sum"].forEach(k=>q(`[data-c="${k}"]`).textContent="0 토큰");
      q('[data-c="note"]').textContent = mode().desc;
    } else {
      const pin = TS.count(prompt()), [lo,hi] = mode().expectOut;
      q('[data-c="in"]').textContent = cached ? "0 (저장본)" : `≈ ${fmt(pin)} 토큰`;
      q('[data-c="out"]').textContent = cached ? "0 (저장본)" : `≈ ${fmt(lo)}~${fmt(hi)} 토큰`;
      q('[data-c="sum"]').textContent = cached ? "0 토큰" : `≈ ${fmt(pin+lo)}~${fmt(pin+hi)} 토큰`;
      q('[data-c="note"]').textContent = cached
        ? "이 문장은 전에 심사받은 적이 있어서 저장된 결과를 써요. Claude를 부르지 않아요."
        : mode().desc + " 거절되면 짧은 이유만 받아서 더 적게 들어요. " + TS.TIERS[prefs.tier].desc;
    }
    q('[data-view="prompt"]').textContent = !mode().claude
      ? "0 토큰 모드는 Claude에게 아무것도 보내지 않아요."
      : done ? prompt() : "모든 칸을 채우면 명령어가 여기 나타나요.";

    /* 버튼 */
    const build=q('[data-act="build"]'), needClaude = mode().claude && !cached;
    build.textContent = !compiled ? "컴파일 실패: 문장을 고쳐 주세요"
      : !mode().claude ? "게임 만들기 (0 토큰)"
      : cached ? "저장된 결과 불러오기 (토큰 0)"
      : sampleState==="off" ? "여기선 Claude 심사를 못 받아요"
      : "Claude 심사받고 게임 만들기";
    build.disabled = !compiled || busy || (needClaude && sampleState!=="on");
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
  function showVerdict(kind, title, body){
    const v=q("[data-verdict]"); v.hidden=false; v.className="verdict "+kind;
    v.innerHTML="<strong></strong><p></p>"; v.firstChild.textContent=title; v.lastChild.textContent=body;
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

  /* 심사 결과 → 게임. 통과/거절 모두 같은 길로 */
  function apply(v, m, base, costText){
    if(!v.ok){
      showVerdict("fail", "심사 탈락", v.why);
      setStatus(`게임이 만들어지지 않았어요. 카드를 바꾸거나 다른 칸에 넣어 보세요. ${costText}`);
      return;
    }
    let html, code;
    if(m==="config"){ const cfg = WordMeta.merge(base, v.config); html = GameTemplate.wrapConfig(cfg); code = JSON.stringify(cfg, null, 1); }
    else if(m==="lite"){ code = v.code; html = GameTemplate.wrap(v.code, liteTitle(v.code)); }
    else { code = v.html; html = v.html; }
    showVerdict("pass", `심사 통과 · 창의력 ${v.score ? v.score+"/10" : "통과"}`, `“${Blocks.sentence()}”`);
    showGame(html, code, `“${titleOf(html) || Blocks.title()}” · ${TS.MODES[m].label} · ${costText}`);
    setStatus(`빌드 완료. 무대를 클릭하고 플레이하세요. ${costText}`);
  }

  /* ---------- 빌드 ---------- */
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

  function buildZero(){
    const {cfg, unknown} = WordMeta.compile(Blocks.sentenceParts());
    showVerdict("pass", "컴파일 통과 · 0 토큰", "의미 심사 없이 단어 해석표로 조립했어요. 진짜 심사는 Claude 모드에서 받아요.");
    showGame(GameTemplate.wrapConfig(cfg), JSON.stringify(cfg, null, 1), `“${cfg.title}” · 0 토큰`);
    setStatus(unknown.length
      ? `해석표에 없는 단어 ${unknown.length}개(${unknown.join(", ")})는 기본값으로 조립했어요.`
      : "Claude를 부르지 않고 만들었어요. 0 토큰.");
  }

  async function build(force){
    if(busy || !grammar().ok) return;
    hideVerdict();
    const m = prefs.mode;
    if(!TS.MODES[m].claude){ buildZero(); return; }

    const tier=prefs.tier, p=prompt(), key=TS.cache.key(m,tier,p);
    const base = WordMeta.compile(Blocks.sentenceParts()).cfg;
    const hit = !force && TS.cache.get(key);
    if(hit){
      TS.usage.addSaved((hit.inTok||0)+(hit.outTok||0));
      apply(hit.v, m, base, `저장된 결과라 0 토큰 (약 ${fmt((hit.inTok||0)+(hit.outTok||0))} 토큰 아낌)`);
      update(); return;
    }
    if(!sample) return;

    busy=true; update();
    const inTok=TS.count(p);
    ctl=new AbortController();
    q('[data-act="stop"]').hidden=false;
    const box=q('[data-view="code"]');
    showTab("code"); box.textContent="심사 중…";
    setStatus(`토큰 약 ${fmt(inTok)}개를 Claude 심사위원에게 보냈어요…`);
    let raw="";
    try{
      const opts = {
        signal:ctl.signal, modelTier:tier,
        cache: force ? {gcTime:DAY, refresh:true} : {gcTime:DAY},   // 같은 명령이면 하루 동안 플랫폼도 다시 안 물어봄
        onText:({text})=>{ raw=text; box.textContent=text; box.scrollTop=box.scrollHeight; setStatus(`답 받는 중… 약 ${fmt(TS.count(text))} 토큰`); }
      };
      let v;
      if(m==="config"){ const obj = await sample.json(p, opts); raw = raw || JSON.stringify(obj); v = TS.verdict(m, obj); }
      else { const {text, truncated} = await sample(p, opts); raw = text; v = TS.verdict(m, text); if(truncated && v.ok) setStatus("답이 길어서 잘렸어요."); }
      const outTok = TS.count(raw);
      TS.usage.add(inTok, outTok);
      TS.cache.put(key, {v, inTok, outTok});
      apply(v, m, base, `약 ${fmt(inTok+outTok)} 토큰 (보냄 ${fmt(inTok)} + 받음 ${fmt(outTok)})`);
    }catch(e){
      if(e && e.code==="cancelled") setStatus("멈췄어요.");
      else{
        setStatus(ERR[e?.code] || ERR.upstream_error);
        if(e?.code==="not_granted"||e?.code==="sampling_disabled") sampleState="off";
        if(e?.code==="refused") box.textContent="";
      }
    }finally{
      busy=false; q('[data-act="stop"]').hidden=true; update();
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
      root.querySelectorAll(".tab").forEach(t=>t.onclick=()=>showTab(t.dataset.tab));
      root.querySelectorAll("[data-seg]").forEach(g=>g.onclick=e=>{
        const b=e.target.closest("button"); if(!b || busy) return;
        prefs[g.dataset.seg]=b.dataset.v; savePrefs(); update();
      });
      q('[data-act="build"]').onclick = ()=>build(false);
      q('[data-act="fresh"]').onclick = ()=>build(true);
      q('[data-act="copy"]').onclick = copyPrompt;
      q('[data-act="stop"]').onclick = ()=>ctl?.abort();
      q('[data-act="download"]').onclick = download;
      q('[data-act="restart"]').onclick = ()=>{ if(lastHtml) showGame(lastHtml, q('[data-view="code"]').textContent, q("[data-meta]").textContent); };
      q('[data-act="reset-usage"]').onclick = ()=>{ TS.usage.reset(); update(); };
      (async()=>{
        await null; // main.js 가 Blocks 를 다 붙인 뒤에 실행
        const use = name => window.claude ? window.claude.use(name).catch(()=>null) : Promise.resolve(null);
        [sample, downloads] = await Promise.all([use("sample"), use("downloads")]);
        sampleState = sample ? "on" : "off";
        if(!sample) setStatus("여기서는 Claude 심사를 받을 수 없어요. 0 토큰 모드로 연습하거나 명령어를 복사해서 쓰세요.");
        update();
      })();
    },
    update(){ if(root) update(); }
  };
})();
