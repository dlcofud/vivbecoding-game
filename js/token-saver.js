/* 토큰 변환기 담당: 토큰 절약 장치
 *
 * Claude 사용량은 "보내는 글(입력 토큰)"과 "받는 코드(출력 토큰)"로 나뉩니다.
 * 이 게임에서는 받는 코드가 훨씬 길어서, 출력 토큰을 줄이는 게 가장 효과가 큽니다.
 * 자세한 설명은 docs/TOKEN_SAVING.md
 *
 *   TokenSaver.MODES          빌드 방식(lite: 틀 사용 / full: 전체 HTML)
 *   TokenSaver.TIERS          모델 등급(quick / default)
 *   TokenSaver.buildPrompt(mode, sentence, guideLines)
 *   TokenSaver.extract(mode, answerText, title)   Claude 답 → 실행할 HTML
 *   TokenSaver.count(text)    토큰 수 어림 (setCounter 로 다른 토크나이저 연결 가능)
 *   TokenSaver.cache          같은 조합이면 저장된 결과 재사용 (Claude 호출 0회)
 *   TokenSaver.usage          이 브라우저에서 쓴 토큰 누적 (어림값)
 */
(function(){
  /* ---------- 토큰 세기 ----------
   * 기본은 어림 계산: 한글 한 글자 ≈ 0.9 토큰, 그 밖의 글자 약 3.6자 ≈ 1 토큰.
   * Claude 토크나이저는 브라우저용으로 공개돼 있지 않아서 정확한 값은 Anthropic count_tokens API로만 알 수 있어요.
   * 다른 토크나이저를 쓰려면: TokenSaver.setCounter(text => 숫자)
   */
  let counter = function(s){
    let h=0,a=0; for(const ch of s){ const c=ch.charCodeAt(0); if(c>=0xAC00&&c<=0xD7A3) h++; else a++; }
    return Math.round(h*0.9 + a/3.6);
  };

  /* ---------- 빌드 방식 ----------
   * expectOut: 받는 코드의 대략적인 토큰 수 (화면 표시용 어림값)
   */
  const MODES = {
    lite: {label:"절약 (틀 사용)", desc:"게임 틀은 미리 있고, Claude는 게임 규칙만 씁니다.", expectOut:[900, 1800]},
    full: {label:"전체 생성", desc:"Claude가 HTML 전체를 처음부터 씁니다. 자유롭지만 비쌉니다.", expectOut:[3500, 6500]}
  };
  const TIERS = {
    quick:   {label:"빠른 모델", desc:"가볍고 빠름. 사용량이 가장 적어요."},
    default: {label:"기본 모델", desc:"더 꼼꼼하지만 사용량이 더 들어요."}
  };

  function buildPrompt(mode, sentence, guideLines){
    const guide = guideLines.map(l=>"- "+l).join("\n");
    if(mode === "lite"){
      return `아무말 명령을 진지하게 해석해 미니게임 규칙을 짜라.
명령: "${sentence}"
${guide}

캔버스·루프·입력·HUD·게임오버·다시하기는 틀에 이미 있다. 너는 GAME 객체만 쓴다.
${GameTemplate.API}

규칙: 그래픽은 이모지와 도형. 외부 리소스·DOM 조작·alert 금지. 100줄 이내, 주석 없이 짧게. title·hint는 한국어.
답은 \`\`\`js 코드 블록 하나만.`;
    }
    return `너는 바이브 코딩 엔진이다. 아래의 말도 안 되는 명령을 최대한 진지하게 해석해서, 실제로 플레이할 수 있는 브라우저 미니게임으로 만들어라.

명령: "${sentence}"

해석 가이드
${guide}

만들기 규칙
- 완전한 HTML 문서 하나. <!doctype html>부터 </html>까지.
- 외부 리소스 금지: 이미지 파일, 웹폰트, CDN 스크립트를 쓰지 마라. 그래픽은 canvas 도형과 이모지, 텍스트로 그려라.
- 키보드(방향키, 스페이스)와 터치/클릭을 모두 지원하라.
- 상단에 게임 제목, 점수, 한 줄 조작법. 게임 오버 화면과 다시하기 버튼은 canvas나 DOM 안에서 처리하라.
- 창 크기에 맞춰 canvas를 꽉 채우고, body 여백 0, 스크롤 없음.
- alert/confirm/prompt, localStorage, fetch 사용 금지.
- 화면에 보이는 글자는 모두 한국어. 코드는 250줄 안팎, 주석 없이.
- 답은 \`\`\`html 코드 블록 하나만. 앞뒤 설명 없이.`;
  }

  function fenceBody(t){
    const m = t.match(/```[a-zA-Z]*\s*([\s\S]*?)(```|$)/);
    return (m ? m[1] : t).trim();
  }
  function extract(mode, text, title){
    if(mode === "lite") return GameTemplate.wrap(fenceBody(text), title);
    let h = fenceBody(text);
    const i=h.search(/<!doctype html|<html/i); if(i>0) h=h.slice(i);
    const j=h.toLowerCase().lastIndexOf("</html>"); if(j>=0) h=h.slice(0,j+7);
    return h.trim();
  }

  /* ---------- 저장소 (이 브라우저에만) ---------- */
  const read = (k, d) => { try{ return JSON.parse(localStorage.getItem(k)) ?? d; }catch{ return d; } };
  const write = (k, v) => { try{ localStorage.setItem(k, JSON.stringify(v)); return true; }catch{ return false; } };

  function hash(s){ let h=2166136261; for(let i=0;i<s.length;i++){ h^=s.charCodeAt(i); h=Math.imul(h,16777619); } return (h>>>0).toString(36); }

  /* 같은 문장·방식·모델이면 저장된 게임을 다시 씀 → Claude 호출 없음 */
  const CACHE_KEY = "amumal-build-cache-v1", CACHE_MAX = 12;
  const cache = {
    key(mode, tier, prompt){ return hash(mode+"|"+tier+"|"+prompt); },
    get(k){ return read(CACHE_KEY, {})[k] || null; },
    put(k, entry){
      const all = read(CACHE_KEY, {});
      all[k] = {...entry, at: Date.now()};
      const keys = Object.keys(all).sort((a,b)=>all[b].at-all[a].at);
      for(const old of keys.slice(CACHE_MAX)) delete all[old];
      if(!write(CACHE_KEY, all)){ write(CACHE_KEY, {[k]: all[k]}); } // 저장 공간이 꽉 차면 최신 것만
    },
    size(){ return Object.keys(read(CACHE_KEY, {})).length; },
    clear(){ write(CACHE_KEY, {}); }
  };

  /* 이 브라우저에서 쓴 토큰 누적 (어림값) */
  const USAGE_KEY = "amumal-usage-v1";
  const usage = {
    get(){ return read(USAGE_KEY, {builds:0, input:0, output:0, saved:0}); },
    add(input, output){ const u=this.get(); u.builds++; u.input+=input; u.output+=output; write(USAGE_KEY,u); },
    addSaved(tokens){ const u=this.get(); u.saved+=tokens; write(USAGE_KEY,u); },
    reset(){ write(USAGE_KEY, {builds:0, input:0, output:0, saved:0}); }
  };

  window.TokenSaver = {
    MODES, TIERS, buildPrompt, extract, cache, usage,
    count: s => counter(s),
    setCounter(fn){ counter = fn; }
  };
})();
