/* 토큰 변환기 담당: 아무말 문법 (컴파일 규칙)
 *
 * 카드는 아무 칸에나 놓을 수 있지만, 칸마다 받는 품사가 정해져 있습니다.
 * 품사가 안 맞으면 "연결 토큰"을 붙여 억지로 이어 줍니다.
 *   예) 행동 칸에 "팀장님"(명사)  → "팀장님이 된다"
 *       주인공 칸에 "랩을 한다"(동사) → "랩을 하는 자"
 *       방식 칸에 "붕어빵"(명사)   → "붕어빵처럼"
 * 연결 토큰은 한 판에 BUDGET 개까지만 쓸 수 있고, 넘으면 제출이 안 됩니다. 한도는 심사위원마다 달라요(setBudget).
 *
 *   Grammar.fit(slotKey, cardCat, text) → {text, glue, cost}
 *   Grammar.check(parts)                → {ok, errors:[...], glueUsed, budget}
 *   Grammar.typeOf(cat)                 → "N" | "PLACE" | "ADV" | "VERB"
 */
(function(){
  let budget = 2; // 심사위원마다 다름 (setBudget)
  const LABEL = {N:"명사", PLACE:"장소", ADV:"~처럼", VERB:"동사"};

  /* 카드가 원래 어느 카테고리에서 왔는지 → 품사. words.js 에 type 을 적으면 그게 우선 */
  const DEFAULT_TYPE = {who:"N", where:"PLACE", like:"ADV", act:"VERB", hit:"N", result:"VERB", unit:"N"};
  const typeOf = cat => (window.WORDS?.[cat]?.type) || DEFAULT_TYPE[cat] || "N";

  /* 칸마다 그대로 받는 품사 */
  const ACCEPT = {
    who:["N","PLACE"], where:["PLACE"], like:["ADV"], act:["VERB"],
    hit:["N","PLACE"], result:["VERB"], unit:["N","PLACE"]
  };

  /* ---------- 한국어 활용 ---------- */
  const isH = c => c>=0xAC00 && c<=0xD7A3;
  function jong(w){ const c=w.charCodeAt(w.length-1); return isH(c) ? (c-0xAC00)%28 : 0; }
  const iGa = w => jong(w) ? "이" : "가";
  /* "한다/던진다/걷는다" → 줄기 "하/던지/걷" */
  function stem(v){
    v=v.trim();
    if(v.endsWith("는다")) return v.slice(0,-2);
    if(v.endsWith("다")){
      const body=v.slice(0,-1), c=body.charCodeAt(body.length-1);
      if(isH(c) && (c-0xAC00)%28===4) return body.slice(0,-1)+String.fromCharCode(c-4); // ㄴ 받침 떼기
      return body;
    }
    return v;
  }
  const adnominal = v => stem(v)+"는";           // 하는, 던지는, 걷는
  const unAdv = a => a.trim().replace(/처럼$/,""); // 매국노처럼 → 매국노

  /* 칸이 원하는 품사로 바꾸는 연결 토큰. [바뀐 글, 붙은 연결 토큰] */
  const GLUE = {
    who:   {ADV:a=>[unAdv(a)+" 같은 녀석","같은 녀석"], VERB:v=>[adnominal(v)+" 자","~는 자"]},
    where: {N:n=>[n+" 속","속"], ADV:a=>[unAdv(a)+" 같은 곳","같은 곳"], VERB:v=>[adnominal(v)+" 곳","~는 곳"]},
    like:  {N:n=>[n+"처럼","처럼"], PLACE:n=>[n+"처럼","처럼"], VERB:v=>[stem(v)+"듯이","~듯이"]},
    act:   {N:n=>[n+iGa(n)+" 된다",iGa(n)+" 된다"], PLACE:n=>[n+iGa(n)+" 된다",iGa(n)+" 된다"], ADV:a=>[a+" 군다","군다"]},
    hit:   {ADV:a=>[unAdv(a)+" 같은 것","같은 것"], VERB:v=>[adnominal(v)+" 것","~는 것"]},
    result:{N:n=>[n+iGa(n)+" 된다",iGa(n)+" 된다"], PLACE:n=>[n+iGa(n)+" 된다",iGa(n)+" 된다"], ADV:a=>[a+" 군다","군다"]},
    unit:  {ADV:a=>[unAdv(a)+" 같은 것","같은 것"], VERB:v=>[adnominal(v)+" 횟수","~는 횟수"]}
  };

  function fit(slot, cardCat, text){
    const t = typeOf(cardCat);
    if(!ACCEPT[slot] || ACCEPT[slot].includes(t)) return {text, glue:null, cost:0};
    const g = GLUE[slot]?.[t];
    if(!g) return {text, glue:null, cost:0, bad:`${LABEL[t]}는 이 칸에 못 들어가요`};
    const [out, glue] = g(text);
    return {text:out, glue, cost:1};
  }

  /* parts: Blocks.sentenceParts() 결과 */
  function check(parts){
    const slots = parts.filter(p=>p.slot);
    const errors = [];
    const empty = slots.filter(p=>!p.slot.filled);
    if(empty.length) errors.push(`빈칸 ${empty.length}개: ${empty.map(p=>p.slot.label).join(", ")}`);
    const glued = slots.filter(p=>p.slot.glue);
    if(glued.length > budget) errors.push(`연결 토큰 초과 (${glued.length}/${budget}): 억지로 이은 곳이 너무 많아요`);
    for(const p of slots) if(p.slot.bad) errors.push(`${p.slot.label} 칸: ${p.slot.bad}`);
    return {ok: errors.length===0, errors, glueUsed: glued.length, budget};
  }

  window.Grammar = { get BUDGET(){ return budget; }, setBudget(n){ budget = n; }, LABEL, typeOf, fit, check, accepts:(slot,cat)=>!ACCEPT[slot]||ACCEPT[slot].includes(typeOf(cat)) };
})();
