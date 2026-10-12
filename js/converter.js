/* 토큰 변환기 담당: 문장 → 토큰 → 바이브 코딩 명령어 → Claude 빌드 → 무대에서 실행 → 다운로드
 *
 * 블록 쪽 정보는 window.Blocks 로만 읽습니다 (blocks.js 맨 위 설명 참고).
 * 명령어 문구와 토큰 절약 장치는 js/token-saver.js, 게임 틀은 js/game-template.js 에 있습니다.
 *
 *   Converter.mount(el)    토큰 변환기와 무대를 el 안에 그림
 *   Converter.update()     블록이 바뀔 때 main.js 가 호출
 */
(function(){
  const TS = window.TokenSaver;
  const PREF_KEY = "amumal-converter-prefs-v1";
  let root = null, sample = null, sampleState = "pending", downloads = null;
  let busy = false, ctl = null, lastHtml = "", lastTitle = "";
  let prefs = loadPrefs();
  const q = s => root.querySelector(s);

  function loadPrefs(){
    try{ const p=JSON.parse(localStorage.getItem(PREF_KEY)); if(p && TS.MODES[p.mode] && TS.TIERS[p.tier]) return p; }catch{}
    return {mode:"lite", tier:"quick"};
  }
  function savePrefs(){ try{ localStorage.setItem(PREF_KEY, JSON.stringify(prefs)); }catch{} }

  const prompt = () => TS.buildPrompt(prefs.mode, Blocks.sentence(), Blocks.guide());
  const cacheKey = () => TS.cache.key(prefs.mode, prefs.tier, prompt());
  const fmt = n => Math.round(n).toLocaleString();

  function tokenize(s){
    const out=[]; for(const w of s.split(/\s+/)){ if(!w) continue; for(let i=0;i<w.length;i+=2) out.push((i===0?"·":"")+w.slice(i,i+2)); }
    return out;
  }

  /* ---------- 그리기 ---------- */
  const seg = (name, options) => `<div class="seg" role="radiogroup" data-seg="${name}">${
    Object.entries(options).map(([k,o])=>`<button role="radio" data-v="${k}" title="${o.desc}">${o.label}</button>`).join("")}</div>`;

  const TEMPLATE = `
    <section class="panel" aria-labelledby="h-tok">
      <div class="ph"><h2 id="h-tok">토큰 변환기</h2><span>블록 → 문장 → 토큰 → 바이브 코딩 명령</span></div>
      <p class="sentence" data-sentence></p>
      <div class="tokens" data-tokens aria-label="토큰 미리보기"></div>

      <div class="opts">
        <div class="opt"><span class="opt-l">빌드 방식</span>${seg("mode", TS.MODES)}</div>
        <div class="opt"><span class="opt-l">모델</span>${seg("tier", TS.TIERS)}</div>
      </div>

      <div class="cost" aria-live="polite">
        <div><span>보내는 명령</span><b data-c="in">—</b></div>
        <div><span>받을 코드 (예상)</span><b data-c="out">—</b></div>
        <div><span>이번 빌드 합계 (예상)</span><b data-c="sum">—</b></div>
      </div>
      <p class="hint" data-c="note"></p>

      <div class="go">
        <button class="cta" data-act="build" disabled>토큰 연결하고 게임 만들기</button>
        <button class="btn" data-act="fresh" hidden>새로 만들기</button>
        <button class="btn" data-act="copy">명령어 복사</button>
      </div>
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
          <div class="idle"><strong>여기서 실행돼요</strong><p>모든 칸을 채우고 “토큰 연결하고 게임 만들기”를 누르면 Claude가 그 아무말을 진지하게 게임으로 만듭니다.</p></div>
        </div>
      </div>
      <pre class="codebox" data-view="code" hidden>아직 코드가 없어요.</pre>
      <pre class="codebox" data-view="prompt" hidden></pre>
      <div class="row">
        <button class="btn primary" data-act="download" hidden>게임 다운로드 (.html)</button>
        <button class="btn" data-act="restart" hidden>게임 다시 불러오기</button>
        <button class="btn" data-act="stop" hidden>멈추기</button>
        <button class="btn" data-act="sample">틀 미리보기</button>
      </div>
    </section>`;

  function update(){
    /* 문장 */
    const sEl=q("[data-sentence]"); sEl.innerHTML="";
    for(const p of Blocks.sentenceParts()){
      if(!p.slot){ sEl.append(p.text); continue; }
      const s=document.createElement("span"); s.style.setProperty("--c",`var(${p.slot.color})`);
      s.className=p.slot.filled?"w":"gap"; s.textContent=p.text; sEl.appendChild(s);
    }
    const tk=q("[data-tokens]"); tk.innerHTML="";
    tokenize(Blocks.sentence()).forEach(t=>{ const s=document.createElement("span"); s.className="tok"; s.textContent=t; tk.appendChild(s); });

    /* 선택 상태 */
    root.querySelectorAll("[data-seg]").forEach(g=>{
      const cur = prefs[g.dataset.seg];
      g.querySelectorAll("button").forEach(b=>b.setAttribute("aria-checked", b.dataset.v===cur));
    });

    /* 비용 */
    const done = Blocks.isComplete();
    const cached = done ? TS.cache.get(cacheKey()) : null;
    if(done){
      const pin = TS.count(prompt()), [lo,hi] = TS.MODES[prefs.mode].expectOut;
      q('[data-c="in"]').textContent = `≈ ${fmt(pin)} 토큰`;
      q('[data-c="out"]').textContent = cached ? "0 (저장본)" : `≈ ${fmt(lo)}~${fmt(hi)} 토큰`;
      q('[data-c="sum"]').textContent = cached ? "0 토큰" : `≈ ${fmt(pin+lo)}~${fmt(pin+hi)} 토큰`;
      q('[data-c="note"]').textContent = cached
        ? "이 조합은 전에 만든 적이 있어서 저장본을 불러오면 Claude를 부르지 않아요."
        : TS.MODES[prefs.mode].desc + " " + TS.TIERS[prefs.tier].desc;
      q('[data-view="prompt"]').textContent = prompt();
    } else {
      ["in","out","sum"].forEach(k=>q(`[data-c="${k}"]`).textContent="—");
      q('[data-c="note"]').textContent = "모든 칸을 채우면 예상 사용량이 나와요.";
      q('[data-view="prompt"]').textContent = "모든 칸을 채우면 최종 명령어가 여기 나타나요.";
    }

    /* 버튼 */
    const build=q('[data-act="build"]');
    if(sampleState==="off" && !cached){ build.textContent="이 화면에선 빌드를 못 해요"; }
    else build.textContent = cached ? "저장된 게임 불러오기 (토큰 0)" : "토큰 연결하고 게임 만들기";
    build.disabled = !done || busy || (sampleState==="off" && !cached);
    q('[data-act="fresh"]').hidden = !cached || sampleState==="off";
    q('[data-act="fresh"]').disabled = busy;

    /* 누적 사용량 */
    const u=TS.usage.get();
    q("[data-usage]").textContent = u.builds
      ? `이 브라우저 누적: 빌드 ${u.builds}회 · 약 ${fmt(u.input+u.output)} 토큰 사용 · 저장본으로 약 ${fmt(u.saved)} 토큰 아낌`
      : (u.saved ? `저장본으로 약 ${fmt(u.saved)} 토큰 아낌` : "아직 이 브라우저에서 빌드한 기록이 없어요.");
    q('[data-act="reset-usage"]').hidden = !u.builds && !u.saved;
  }

  const setStatus = t => { q("[data-status]").textContent=t; };
  function showTab(name){
    root.querySelectorAll(".tab").forEach(t=>t.setAttribute("aria-selected", t.dataset.tab===name));
    root.querySelectorAll("[data-view]").forEach(v=>v.hidden = v.dataset.view!==name);
  }

  /* ---------- 무대 ---------- */
  function titleOf(html){
    const m = html.match(/<title>([^<]*)<\/title>/i);
    return (m && m[1].trim()) || "";
  }
  function liteTitle(code){
    const m = code.match(/title\s*:\s*(["'`])([^"'`\n]+)\1/);
    return m ? m[2] : "";
  }
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

  /* ---------- 빌드 ---------- */
  const ERR = {
    not_granted:"Claude 사용을 허락하지 않아서 빌드할 수 없어요. 명령어를 복사해서 다른 도구에서 써 보세요.",
    sampling_disabled:"이 계정에서는 Claude를 부를 수 없어요.",
    rate_limited:"요청이 너무 많거나 사용 한도에 닿았어요. 잠시 뒤에 다시 눌러 주세요.",
    session_expired:"다시 로그인해야 해요.",
    refused:"Claude가 이 조합은 만들지 않겠다고 했어요. 카드를 바꿔 보세요.",
    empty_completion:"빈 답이 왔어요. 다시 눌러 보세요.",
    upstream_error:"연결이 끊겼어요. 다시 눌러 보세요."
  };

  function loadCached(){
    const c = TS.cache.get(cacheKey()); if(!c) return false;
    showGame(c.html, c.code, `“${titleOf(c.html) || Blocks.title()}” · 저장본 (토큰 0)`);
    TS.usage.addSaved((c.inTok||0) + (c.outTok||0));
    setStatus(`저장본을 불러왔어요. 약 ${fmt((c.inTok||0)+(c.outTok||0))} 토큰을 아꼈어요.`);
    update(); return true;
  }

  async function build(force){
    if(busy || !Blocks.isComplete()) return;
    if(!force && loadCached()) return;
    if(!sample) return;
    busy=true; update();
    const mode=prefs.mode, tier=prefs.tier, p=prompt(), key=TS.cache.key(mode,tier,p), inTok=TS.count(p);
    ctl=new AbortController();
    q('[data-act="stop"]').hidden=false;
    const box=q('[data-view="code"]');
    showTab("code"); box.textContent="생각하는 중…";
    setStatus(`토큰 ${fmt(inTok)}개를 Claude에 연결했어요. 아무말을 해석하는 중…`);
    const started=Date.now();
    try{
      const {text,truncated}=await sample(p,{
        signal:ctl.signal, cache:false, modelTier:tier,
        onText:({text})=>{ box.textContent=text; box.scrollTop=box.scrollHeight;
          setStatus(`코드 받는 중… 약 ${fmt(TS.count(text))} 토큰`); }
      });
      const code = text.replace(/^[\s\S]*?```[a-zA-Z]*\s*/, "").replace(/```[\s\S]*$/, "").trim() || text;
      const html = TS.extract(mode, text, mode==="lite" ? liteTitle(code) : "");
      const outTok = TS.count(text);
      TS.usage.add(inTok, outTok);
      if(!truncated) TS.cache.put(key, {html, code, inTok, outTok});
      const secs = Math.round((Date.now()-started)/1000);
      showGame(html, code, `“${titleOf(html) || Blocks.title()}” · ${TS.MODES[mode].label} · 약 ${fmt(inTok+outTok)} 토큰 · ${secs}초`);
      setStatus(truncated
        ? "코드가 길어서 중간에 잘렸어요. 안 돌아가면 절약 모드로 다시 빌드해 보세요."
        : `빌드 완료. 보낸 명령 약 ${fmt(inTok)} + 받은 코드 약 ${fmt(outTok)} 토큰. 무대를 클릭하고 플레이하세요.`);
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
    if(downloads){ // Claude Artifact 안: 저장 확인 창을 거쳐 저장
      try{ await downloads.save({filename, data:lastHtml}); setStatus(`“${filename}”을 저장했어요.`); }
      catch(e){
        setStatus(e?.code==="declined" ? "저장을 취소했어요."
          : e?.code==="rate_limited" ? "저장 창이 이미 열려 있어요. 그 창부터 닫아 주세요."
          : "여기서는 파일을 저장할 수 없어요. 코드 탭의 내용을 복사해서 .html 파일로 저장해 주세요.");
      }
      return;
    }
    // 일반 브라우저 (로컬 파일, GitHub Pages 등)
    const url = URL.createObjectURL(new Blob([lastHtml], {type:"text/html;charset=utf-8"}));
    const a = document.createElement("a"); a.href=url; a.download=filename;
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(()=>URL.revokeObjectURL(url), 2000);
    setStatus(`“${filename}”을 내려받았어요. 더블클릭하면 브라우저에서 바로 실행돼요.`);
  }

  async function copyPrompt(){
    const text = Blocks.isComplete() ? prompt() : Blocks.sentence();
    try{ await navigator.clipboard.writeText(text); setStatus(`명령어를 복사했어요 (약 ${fmt(TS.count(text))} 토큰).`); }
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
      q('[data-act="sample"]').onclick = ()=>{
        showGame(GameTemplate.wrap(GameTemplate.SAMPLE, "틀 미리보기"), GameTemplate.SAMPLE, "틀 미리보기 · 예시 GAME 코드 (토큰 0)");
        setStatus("절약 모드에서 Claude는 코드 탭에 보이는 GAME 객체만 씁니다. 나머지는 틀이 처리해요.");
      };
      q('[data-act="reset-usage"]').onclick = ()=>{ TS.usage.reset(); update(); };
      (async()=>{
        await null; // main.js 가 Blocks 를 다 붙인 뒤에 실행
        const use = name => window.claude ? window.claude.use(name).catch(()=>null) : Promise.resolve(null);
        [sample, downloads] = await Promise.all([use("sample"), use("downloads")]);
        sampleState = sample ? "on" : "off";
        if(!sample) setStatus("여기서는 Claude 연결을 쓸 수 없어요. “명령어 복사”로 원하는 바이브 코딩 도구에 붙여넣으세요.");
        update();
      })();
    },
    update(){ if(root) update(); }
  };
})();
