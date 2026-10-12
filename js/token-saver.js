/* 토큰 변환기 담당: 토큰 절약 장치 + 심사 명령어
 *
 * Claude 사용량은 "보내는 글(입력 토큰)"과 "받는 답(출력 토큰)"으로 나뉩니다.
 * 받는 답이 훨씬 길어서, 답을 줄이는 게 가장 효과가 큽니다. 자세한 설명은 docs/TOKEN_SAVING.md
 *
 * 빌드 방식 (위에서 아래로 갈수록 비쌈)
 *   zero   0 토큰     Claude 없이 단어 해석표(word-meta.js)로 조립. 문법 검사만 함
 *   config 설정만     Claude가 심사 + 게임 설정 JSON 몇 줄만 씀 (엔진은 game-template.js)
 *   lite   규칙 코드  Claude가 심사 + GAME 규칙 코드
 *   full   전체 코드  Claude가 심사 + HTML 전체
 * 모든 Claude 모드는 먼저 심사합니다. 말이 안 이어지면 짧은 거절 이유만 받으니 그 자체로 토큰이 적게 듭니다.
 *
 *   TokenSaver.MODES / TIERS
 *   TokenSaver.buildPrompt(mode, sentence)
 *   TokenSaver.verdict(mode, answer)  → {ok:false, why} | {ok:true, ...}
 *   TokenSaver.count(text)            토큰 수 어림 (setCounter 로 바꿀 수 있음)
 *   TokenSaver.cache / usage
 */
(function(){
  let counter = function(s){
    let h=0,a=0; for(const ch of s){ const c=ch.charCodeAt(0); if(c>=0xAC00&&c<=0xD7A3) h++; else a++; }
    return Math.round(h*0.9 + a/3.6);
  };

  const MODES = {
    zero:   {label:"0 토큰", claude:false, desc:"Claude를 부르지 않고 단어 해석표로 바로 조립해요. 문법 검사만 하고 의미 심사는 없어요.", expectOut:[0,0]},
    config: {label:"설정만", claude:true, desc:"Claude가 심사하고, 통과하면 게임 설정 몇 줄만 써요. 엔진은 미리 있어요.", expectOut:[60,160]},
    lite:   {label:"규칙 코드", claude:true, desc:"Claude가 심사하고 게임 규칙 코드를 써요. 틀이 나머지를 처리해요.", expectOut:[900,1800]},
    full:   {label:"전체 코드", claude:true, desc:"Claude가 심사하고 HTML 전체를 처음부터 써요. 가장 비싸요.", expectOut:[3500,6500]}
  };
  const TIERS = {
    quick:   {label:"빠른 모델", desc:"사용량이 가장 적어요."},
    default: {label:"기본 모델", desc:"더 꼼꼼하지만 사용량이 더 들어요."}
  };

  /* 같은 뜻이면 영어가 한국어보다 토큰이 적어서 지시문은 영어로 씁니다. 화면 글자만 한국어로 받아요. */
  const JUDGE = `You are a strict judge in a nonsense word-card game (like a "make-a-proposal-from-random-words" game). Players glue random cards into one sentence.
Pass only if hero, place, motion, obstacle, result and score unit hang together as ONE playable game idea. Absurd is fine; disconnected or forced is not. Reward clever reinterpretation.`;

  function buildPrompt(mode, sentence){
    const s = `"${sentence}"`;
    const O = GameTemplate.OPTIONS;
    if(mode === "config") return `${JUDGE}
${s}
Reply JSON only.
Fail: {"ok":false,"why":"<Korean ≤40 chars, witty>"}
Pass: {"ok":true,"score":<1-10 creativity>,"title":"<Korean ≤14>","actLabel":"<Korean ≤8, what Space does>","player":"<emoji>","hazard":"<emoji>","shot":"<emoji>","ambient":"<emoji>","bg":["#hex","#hex"],"move":"${O.move.join("|")}","action":"${O.action.join("|")}","pattern":"${O.pattern.join("|")}","effect":"${O.effect.join("|")}","speed":<0.6-1.8>}`;

    const reject = `If it fails, reply only: REJECT: <Korean reason ≤40 chars>`;
    if(mode === "lite") return `${JUDGE}
${s}
${reject}
If it passes, write the game. Engine already handles canvas, loop, input, HUD, game over. Write only:
${GameTemplate.API}
Emoji/shapes only, no external/DOM/alert, ≤80 lines, no comments, Korean title/hint, unit from the sentence. Reply one \`\`\`js block only.`;

    return `${JUDGE}
${s}
${reject}
If it passes, write one complete HTML file (<!doctype html>…</html>) for that game: canvas fills window, body margin 0, no scroll; keyboard (arrows, space) and touch; title, score with the sentence's unit, one-line controls, in-canvas game over and restart; no external resources, alert, localStorage, fetch; emoji/shapes for art; Korean on-screen text; ≤200 lines, no comments. Reply one \`\`\`html block only.`;
  }

  function fenceBody(t){
    const m = t.match(/```[a-zA-Z]*\s*([\s\S]*?)(```|$)/);
    return (m ? m[1] : t).trim();
  }
  /* Claude 답 → 심사 결과 */
  function verdict(mode, answer){
    if(mode === "config"){
      if(!answer || typeof answer !== "object") return {ok:false, why:"심사 결과를 읽지 못했어요. 다시 눌러 보세요."};
      if(answer.ok !== true) return {ok:false, why: String(answer.why || "말이 안 이어진대요.").slice(0,80)};
      return {ok:true, score: Math.max(1, Math.min(10, Math.round(Number(answer.score)||5))), config: answer};
    }
    const t = String(answer).trim();
    const rej = t.match(/^\s*REJECT\s*[:：]\s*([\s\S]*)/i);
    if(rej) return {ok:false, why: rej[1].trim().slice(0,80) || "말이 안 이어진대요."};
    if(mode === "lite") return {ok:true, code: fenceBody(t)};
    let h = fenceBody(t);
    const i=h.search(/<!doctype html|<html/i); if(i>0) h=h.slice(i);
    const j=h.toLowerCase().lastIndexOf("</html>"); if(j>=0) h=h.slice(0,j+7);
    return {ok:true, html: h.trim()};
  }

  /* ---------- 저장소 (이 브라우저에만) ---------- */
  const read = (k, d) => { try{ return JSON.parse(localStorage.getItem(k)) ?? d; }catch{ return d; } };
  const write = (k, v) => { try{ localStorage.setItem(k, JSON.stringify(v)); return true; }catch{ return false; } };
  function hash(s){ let h=2166136261; for(let i=0;i<s.length;i++){ h^=s.charCodeAt(i); h=Math.imul(h,16777619); } return (h>>>0).toString(36); }

  /* 같은 문장·방식·모델이면 저장된 결과(통과든 거절이든)를 다시 씀 → Claude 호출 없음 */
  const CACHE_KEY = "amumal-build-cache-v2", CACHE_MAX = 20;
  const cache = {
    key(mode, tier, prompt){ return hash(mode+"|"+tier+"|"+prompt); },
    get(k){ return read(CACHE_KEY, {})[k] || null; },
    put(k, entry){
      const all = read(CACHE_KEY, {});
      all[k] = {...entry, at: Date.now()};
      const keys = Object.keys(all).sort((a,b)=>all[b].at-all[a].at);
      for(const old of keys.slice(CACHE_MAX)) delete all[old];
      if(!write(CACHE_KEY, all)) write(CACHE_KEY, {[k]: all[k]});
    },
    clear(){ write(CACHE_KEY, {}); }
  };

  const USAGE_KEY = "amumal-usage-v1";
  const usage = {
    get(){ return read(USAGE_KEY, {builds:0, input:0, output:0, saved:0}); },
    add(input, output){ const u=this.get(); u.builds++; u.input+=input; u.output+=output; write(USAGE_KEY,u); },
    addSaved(tokens){ const u=this.get(); u.saved+=tokens; write(USAGE_KEY,u); },
    reset(){ write(USAGE_KEY, {builds:0, input:0, output:0, saved:0}); }
  };

  window.TokenSaver = {
    MODES, TIERS, buildPrompt, verdict, cache, usage,
    count: s => counter(s),
    setCounter(fn){ counter = fn; }
  };
})();
