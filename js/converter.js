/* 토큰 변환기·무대 담당: 문장 → 토큰 → 바이브 코딩 명령어 → Claude 빌드 → 무대에서 실행
 *
 * 블록 쪽 정보는 window.Blocks 로만 읽습니다 (blocks.js 맨 위 설명 참고).
 *
 *   Converter.mount(el)    토큰 변환기와 무대를 el 안에 그림
 *   Converter.update()     블록이 바뀔 때 main.js 가 호출
 *
 * 손볼 곳 안내
 * - 명령어 문구 / 토큰 절약 규칙  → buildPrompt()
 * - 토큰 수 계산                 → estTokens()
 * - 게임 다운로드 같은 버튼 추가   → TEMPLATE 의 .row 와 mount() 의 이벤트 연결
 *   (빌드된 게임 HTML 은 lastHtml 변수에 들어 있어요)
 */
(function(){
  let root = null, sample = null, sampleState = "pending", busy = false, ctl = null, lastHtml = "";
  const q = s => root.querySelector(s);

  /* ---------- 바이브 코딩 명령어 ---------- */
  function buildPrompt(){
    return `너는 바이브 코딩 엔진이다. 아래의 말도 안 되는 명령을 최대한 진지하게 해석해서, 실제로 플레이할 수 있는 브라우저 미니게임으로 만들어라.

명령: "${Blocks.sentence()}"

해석 가이드
${Blocks.guide().map(l=>"- "+l).join("\n")}

만들기 규칙
- 완전한 HTML 문서 하나. <!doctype html>부터 </html>까지.
- 외부 리소스 금지: 이미지 파일, 웹폰트, CDN 스크립트를 쓰지 마라. 그래픽은 canvas 도형과 이모지, 텍스트로 그려라.
- 키보드(방향키, 스페이스)와 터치/클릭을 모두 지원하라.
- 상단에 게임 제목, 점수, 한 줄 조작법. 게임 오버 화면과 다시하기 버튼은 canvas나 DOM 안에서 처리하라.
- 창 크기에 맞춰 canvas를 꽉 채우고, body 여백 0, 스크롤 없음.
- alert/confirm/prompt, localStorage, fetch 사용 금지.
- 화면에 보이는 글자는 모두 한국어. 코드는 250줄 안팎.
- 답은 \`\`\`html 코드 블록 하나만. 앞뒤 설명 없이.`;
  }

  /* 대략적인 토큰 수: 한글 한 글자 ≈ 0.9 토큰, 그 밖의 글자 3.6자 ≈ 1 토큰 */
  function estTokens(s){
    let h=0,a=0; for(const ch of s){ const c=ch.charCodeAt(0); if(c>=0xAC00&&c<=0xD7A3) h++; else a++; }
    return Math.round(h*0.9 + a/3.6);
  }
  function tokenize(s){
    const out=[]; for(const w of s.split(/\s+/)){ if(!w) continue; for(let i=0;i<w.length;i+=2) out.push((i===0?"·":"")+w.slice(i,i+2)); }
    return out;
  }

  /* ---------- 그리기 ---------- */
  const TEMPLATE = `
    <section class="panel" aria-labelledby="h-tok">
      <div class="ph"><h2 id="h-tok">토큰 변환기</h2><span>블록 → 문장 → 토큰 → 바이브 코딩 명령</span></div>
      <p class="sentence" data-sentence></p>
      <div class="tokens" data-tokens aria-label="토큰 미리보기"></div>
      <div class="meter"><span>채운 칸 <b data-m="fill">0</b></span><span>문장 토큰 <b data-m="tok">0</b></span><span>최종 명령 토큰 <b data-m="prompt">0</b></span></div>
      <div class="go">
        <button class="cta" data-act="build" disabled>토큰 연결하고 게임 만들기</button>
        <button class="btn" data-act="copy">명령어 복사</button>
      </div>
      <p class="status" data-status role="status"></p>
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
        <button class="btn" data-act="stop" hidden>멈추기</button>
        <button class="btn" data-act="restart" hidden>게임 다시 불러오기</button>
      </div>
    </section>`;

  function update(){
    const sEl=q("[data-sentence]"); sEl.innerHTML="";
    for(const p of Blocks.sentenceParts()){
      if(!p.slot){ sEl.append(p.text); continue; }
      const s=document.createElement("span"); s.style.setProperty("--c",`var(${p.slot.color})`);
      s.className=p.slot.filled?"w":"gap"; s.textContent=p.text; sEl.appendChild(s);
    }
    const sent=Blocks.sentence(), done=Blocks.isComplete();
    const tk=q("[data-tokens]"); tk.innerHTML="";
    tokenize(sent).forEach(t=>{ const s=document.createElement("span"); s.className="tok"; s.textContent=t; tk.appendChild(s); });
    q('[data-m="fill"]').textContent=`${Blocks.filledCount()}/${Blocks.total()}`;
    q('[data-m="tok"]').textContent=estTokens(sent);
    q('[data-m="prompt"]').textContent= done ? estTokens(buildPrompt()) : "—";
    q('[data-view="prompt"]').textContent = done ? buildPrompt() : "모든 칸을 채우면 최종 명령어가 여기 나타나요.";
    q('[data-act="build"]').disabled = !done || busy || sampleState==="off";
  }

  const setStatus = t => { q("[data-status]").textContent=t; };
  function showTab(name){
    root.querySelectorAll(".tab").forEach(t=>t.setAttribute("aria-selected", t.dataset.tab===name));
    root.querySelectorAll("[data-view]").forEach(v=>v.hidden = v.dataset.view!==name);
  }

  /* ---------- Claude 빌드 (Claude Artifact 안에서만 동작) ---------- */
  function extractHtml(t){
    const fence=t.match(/```(?:html)?\s*([\s\S]*?)(```|$)/i);
    let h = fence ? fence[1] : t;
    const i=h.search(/<!doctype html|<html/i); if(i>0) h=h.slice(i);
    const j=h.toLowerCase().lastIndexOf("</html>"); if(j>=0) h=h.slice(0,j+7);
    return h.trim();
  }
  function mountGame(html){
    const f=document.createElement("iframe");
    f.setAttribute("sandbox","allow-scripts"); f.title="생성된 게임"; f.srcdoc=html;
    q("[data-stage]").replaceChildren(f);
    setTimeout(()=>{ try{ f.focus(); }catch{} },300);
  }
  const ERR = {
    not_granted:"Claude 사용을 허락하지 않아서 빌드할 수 없어요. 명령어를 복사해서 다른 도구에서 써 보세요.",
    sampling_disabled:"이 계정에서는 Claude를 부를 수 없어요.",
    rate_limited:"요청이 너무 많아요. 잠시 뒤에 다시 눌러 주세요.",
    session_expired:"다시 로그인해야 해요.",
    refused:"Claude가 이 조합은 만들지 않겠다고 했어요. 카드를 바꿔 보세요.",
    empty_completion:"빈 답이 왔어요. 다시 눌러 보세요.",
    upstream_error:"연결이 끊겼어요. 다시 눌러 보세요."
  };
  function disableBuild(){
    sampleState="off";
    q('[data-act="build"]').textContent="이 화면에선 빌드를 못 해요";
  }
  async function build(){
    if(busy||!sample||!Blocks.isComplete()) return;
    busy=true; update();
    ctl=new AbortController();
    q('[data-act="stop"]').hidden=false; q('[data-act="restart"]').hidden=true;
    const box=q('[data-view="code"]');
    showTab("code"); box.textContent="생각하는 중…";
    setStatus("토큰을 Claude에 연결했어요. 아무말을 해석하는 중…");
    const started=Date.now();
    try{
      const {text,truncated}=await sample(buildPrompt(),{
        signal:ctl.signal, cache:false,
        onText:({text})=>{ box.textContent=text; box.scrollTop=box.scrollHeight;
          setStatus(`코드 받는 중… 약 ${estTokens(text).toLocaleString()} 토큰`); }
      });
      lastHtml=extractHtml(text);
      mountGame(lastHtml); showTab("play");
      q("[data-meta]").textContent=`“${Blocks.title()}” 게임 · ${Math.round((Date.now()-started)/1000)}초 걸림`;
      q('[data-act="restart"]').hidden=false;
      setStatus(truncated ? "코드가 길어서 중간에 잘렸어요. 안 돌아가면 다시 빌드해 보세요." : "빌드 완료. 무대를 클릭하고 플레이하세요.");
    }catch(e){
      if(e && e.code==="cancelled") setStatus("멈췄어요.");
      else{
        setStatus(ERR[e?.code] || ERR.upstream_error);
        if(e?.code==="not_granted"||e?.code==="sampling_disabled") disableBuild();
        if(e?.code==="refused") box.textContent="";
      }
    }finally{
      busy=false; q('[data-act="stop"]').hidden=true; update();
    }
  }
  async function copyPrompt(){
    const text = Blocks.isComplete() ? buildPrompt() : Blocks.sentence();
    try{ await navigator.clipboard.writeText(text); setStatus("명령어를 복사했어요."); }
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
      q('[data-act="build"]').onclick = build;
      q('[data-act="copy"]').onclick = copyPrompt;
      q('[data-act="stop"]').onclick = ()=>ctl?.abort();
      q('[data-act="restart"]').onclick = ()=>{ if(lastHtml){ mountGame(lastHtml); showTab("play"); } };
      (async()=>{
        await null; // main.js 가 Blocks 를 다 붙인 뒤에 실행
        try{ sample = window.claude ? await window.claude.use("sample") : null; }catch{ sample=null; }
        sampleState = sample ? "on" : "off";
        if(!sample){
          disableBuild();
          setStatus("여기서는 Claude 연결을 쓸 수 없어요. “명령어 복사”로 원하는 바이브 코딩 도구에 붙여넣으세요.");
        }
        update();
      })();
    },
    update
  };
})();
