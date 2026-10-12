/* 토큰 변환기 담당: 단어 해석표 ("0 토큰" 모드의 핵심)
 *
 * 카드 단어마다 게임에서 무엇이 되는지 미리 정해 둔 표입니다.
 * 이 표가 있으면 Claude에게 묻지 않고도 바로 게임 설정(CFG)을 조립할 수 있어요.
 * 상대방이 words.js 에 새 단어를 넣으면, 표에 없는 단어는 기본값으로 조립되고
 * 화면에 "해석표에 없는 단어"로 알려 줍니다. 그때 여기 한 줄씩 추가하면 됩니다.
 *
 *   WordMeta.compile(Blocks.sentenceParts()) → {cfg, words, unknown:[단어...]}
 *   WordMeta.merge(baseCfg, claudeJson)      → Claude 설정을 검사해서 덮어쓴 cfg
 *
 * 값의 뜻은 js/game-template.js 의 OPTIONS 와 runGame() 참고.
 */
(function(){
  const META = {
    who: {
      "매국노":{player:"🕵️"}, "은퇴한 슬라임":{player:"🫠"}, "월급 밀린 용":{player:"🐉",size:1.2},
      "사춘기 냉장고":{player:"🧊"}, "철학하는 고등어":{player:"🐟"}, "미역 줄기 기사":{player:"🤺"},
      "탈모 고민 중인 사자":{player:"🦁"}, "출근하는 유령":{player:"👻"}, "감성 충만 지게차":{player:"🏗️"},
      "3대 500 치는 햄스터":{player:"🐹",size:.85}, "시험기간 펭귄":{player:"🐧"}, "다이어트 중인 두더지":{player:"🐭"},
      "이장님 트랙터":{player:"🚜",size:1.1}, "소심한 공룡":{player:"🦕",size:1.15}
    },
    where: {
      "반지하 우주정거장":{bg:["#0b1030","#2a1b4a"],ambient:"✨"}, "김치냉장고 속":{bg:["#cfe9ff","#7fa9d2"],ambient:"❄️"},
      "월요일 아침 지하철":{bg:["#3a4150","#1d222c"],ambient:"😪"}, "거대한 떡볶이 국물":{bg:["#d7261e","#6e0d08"],ambient:"🫧"},
      "구청 민원실":{bg:["#e9e4d4","#a39c84"],ambient:"📄"}, "무한 엘리베이터":{bg:["#5b5f6b","#25282f"],ambient:"🔼"},
      "노래방 7번 방":{bg:["#2b0a4a","#0a0018"],ambient:"🎵"}, "화산 위 독서실":{bg:["#ff7a1a","#4a0e00"],ambient:"📚"},
      "편의점 냉동고":{bg:["#e4f6ff","#86c3e3"],ambient:"🍦"}, "사우나 열탕":{bg:["#f2a37a","#9c4a30"],ambient:"♨️"},
      "교무실 앞 복도":{bg:["#d9e3c8","#7d9168"],ambient:"✏️"}, "결혼식 뷔페":{bg:["#fff1f5","#d9a3b6"],ambient:"🍤"}
    },
    like: {
      "매국노처럼":{emoji:"🕵️",move:"reverse"}, "첫사랑처럼":{emoji:"💘",move:"drift"}, "마감 직전 작가처럼":{emoji:"✍️",move:"jitter"},
      "신입사원처럼":{emoji:"🙇",move:"slow"}, "고장 난 로봇청소기처럼":{emoji:"🤖",move:"bounce"}, "등짝 스매싱처럼":{emoji:"✋",move:"fast"},
      "소개팅 나간 너구리처럼":{emoji:"🦝",move:"spin"}, "수능 전날처럼":{emoji:"📖",move:"jitter"}, "말년 병장처럼":{emoji:"🪖",move:"slow"},
      "발레리나처럼":{emoji:"🩰",move:"spin"}, "헤어진 연인처럼":{emoji:"💔",move:"reverse"}, "택배 기사처럼":{emoji:"🚚",move:"fast"}
    },
    act: {
      "뒤로 걷는다":{action:"teleport",shot:"👣",actLabel:"뒷걸음질"}, "김밥을 던진다":{action:"shoot",shot:"🍙",actLabel:"김밥 던지기"},
      "랩을 한다":{action:"wave",shot:"🎤",actLabel:"랩 폭격"}, "계속 점프한다":{action:"hop",shot:"🦘",actLabel:"점프"},
      "낮잠을 잔다":{action:"freeze",shot:"💤",actLabel:"낮잠"}, "반성문을 쓴다":{action:"shield",shot:"📜",actLabel:"반성문 방패"},
      "빙글빙글 돈다":{action:"wave",shot:"🌀",actLabel:"회전 공격"}, "순간이동한다":{action:"teleport",shot:"✨",actLabel:"순간이동"},
      "사과한다":{action:"convert",shot:"🙇",actLabel:"사과하기"}, "박수를 친다":{action:"wave",shot:"👏",actLabel:"박수"},
      "눈치를 본다":{action:"slowmo",shot:"👀",actLabel:"눈치 보기"}, "춤을 춘다":{action:"hop",shot:"💃",actLabel:"춤"}
    },
    hit: {
      "붕어빵":{hazard:"🐠",pattern:"fall"}, "팀장님":{hazard:"👔",pattern:"chase",speed:.85}, "고양이 털":{hazard:"🧶",pattern:"zigzag"},
      "택배 상자":{hazard:"📦",pattern:"fall",speed:1.1}, "지각 벌점":{hazard:"📛",pattern:"side",speed:1.2}, "민트초코":{hazard:"🍫",pattern:"bounce"},
      "비둘기 떼":{hazard:"🕊️",pattern:"swarm",speed:1.1}, "바나나 껍질":{hazard:"🍌",pattern:"side",speed:.9}, "무한 리필 단무지":{hazard:"🟡",pattern:"swarm",speed:.9},
      "알람시계":{hazard:"⏰",pattern:"chase"}, "엄마 잔소리":{hazard:"💬",pattern:"side",speed:1.3}, "시험지":{hazard:"📝",pattern:"zigzag",speed:1.1}
    },
    result: {
      "크기가 두 배가 된다":{emoji:"🍄",effect:"grow"}, "고백을 받는다":{emoji:"💌",effect:"hearts"}, "화면이 뒤집힌다":{emoji:"🙃",effect:"flip"},
      "둘로 분열한다":{emoji:"🧬",effect:"split"}, "음악이 빨라진다":{emoji:"🎶",effect:"fast"}, "느려진다":{emoji:"🐌",effect:"slow"},
      "온 세상이 분홍색이 된다":{emoji:"🌸",effect:"pink"}, "처음부터 다시 시작한다":{emoji:"🔁",effect:"reset"}, "점수가 반토막 난다":{emoji:"✂️",effect:"halve"},
      "갑자기 비가 온다":{emoji:"🌧️",effect:"rain"}, "방귀를 뀐다":{emoji:"💨",effect:"fart"}, "하늘로 날아간다":{emoji:"🎈",effect:"fly"}
    },
    unit: {
      "칼로리":{emoji:"🍔"}, "한숨":{emoji:"😮‍💨"}, "눈치":{emoji:"👀"}, "체면":{emoji:"🎭"}, "김치 포기":{emoji:"🥬"}, "학점":{emoji:"🅰️"},
      "반성 지수":{emoji:"📉"}, "하트":{emoji:"❤️"}, "주식 수익률":{emoji:"📈"}, "퇴근 시간":{emoji:"🕕"}, "좋아요":{emoji:"👍"}, "흑역사":{emoji:"📸"}
    }
  };

  /* 표에 없는 단어: 단어 글자로 정해지는 기본값 (같은 단어면 항상 같은 결과) */
  const O = () => window.GameTemplate.OPTIONS;
  const FALLBACK = {
    who:   n => ({player:["🙂","🤖","👾","🦆","🐸","🦄"][n%6]}),
    where: n => ({bg:[["#1b2340","#0b0f1e"],["#203a2e","#0d1a14"],["#3d2340","#170b1e"],["#40331b","#1e160b"]][n%4],ambient:["✨","🫧","🍃","⭐"][n%4]}),
    like:  n => ({move:O().move[n%O().move.length]}),
    act:   n => { const a=O().action[n%O().action.length]; return {action:a,shot:"✨",actLabel:"행동"}; },
    hit:   n => ({hazard:["❓","💥","🌀","🪨"][n%4],pattern:O().pattern[n%O().pattern.length]}),
    result:n => ({effect:O().effect[n%O().effect.length]})
  };
  const num = s => { let h=7; for(const c of s) h=(h*31+c.charCodeAt(0))>>>0; return h; };

  const TITLES = [
    w => `${w.who}의 ${w.where} 대소동`,
    w => `${w.where}에 간 ${w.who}`,
    w => `${w.who}, ${w.hit} 피하기`,
    w => `${w.like} ${w.who}`
  ];
  const emojiOf = m => m && (m.player || m.hazard || m.shot || m.emoji || m.ambient);

  /* 카드가 제 칸이 아닌 곳에 들어갔을 때: 카드의 그림(이모지)은 살리고 나머지는 단어로 정해지는 값 */
  function cross(slot, m, word){
    const f = FALLBACK[slot](num(word)), e = emojiOf(m);
    if(!e) return f;
    if(slot==="who") return {...f, player:e};
    if(slot==="where") return {...f, ambient:e};
    if(slot==="act") return {...f, shot:e, actLabel:word.replace(/처럼$/,"").slice(0,8)};
    if(slot==="hit") return {...f, hazard:e};
    return f;
  }

  /* parts: Blocks.sentenceParts() */
  function compile(parts){
    const unknown = [], words = {};
    const slots = Object.fromEntries(parts.filter(p=>p.slot).map(p=>[p.slot.key, p]));
    const part = key => {
      const p = slots[key]; if(!p || !p.slot.filled) return FALLBACK[key] ? FALLBACK[key](0) : {};
      words[key] = p.text;
      const w = p.slot.word, own = META[key]?.[w];
      if(own) return own;
      const fromCard = META[p.slot.cardCat]?.[w];
      if(!fromCard) unknown.push(w);
      return FALLBACK[key] ? cross(key, fromCard, w) : {};
    };
    const cfg = Object.assign({speed:1,size:1}, part("who"), part("where"), part("like"), part("act"), part("hit"), part("result"));
    part("unit"); delete cfg.emoji;
    const has = ["who","where","like","hit"].every(k=>words[k]);
    cfg.title = has ? TITLES[num(Object.values(words).join(""))%TITLES.length](words) : "아무말 게임";
    cfg.unit = words.unit || "점";
    cfg.hint = `방향키·드래그 이동 · 스페이스 ${cfg.actLabel||"행동"}`;
    return {cfg, words, unknown};
  }

  /* Claude가 준 설정을 검사해서 기본 설정 위에 덮어씀. 이상한 값은 버림 */
  function merge(base, o){
    const cfg = Object.assign({}, base);
    if(!o || typeof o!=="object") return cfg;
    const str = (v,max) => typeof v==="string" && v.trim() ? v.trim().slice(0,max) : null;
    const emo = v => { const s=str(v,8); return s && !/[a-z0-9<>]/i.test(s) ? s : null; };
    for(const k of ["title"]) { const v=str(o[k],20); if(v) cfg[k]=v; }
    { const v=str(o.actLabel,10); if(v) cfg.actLabel=v; }
    for(const k of ["player","hazard","shot","ambient"]) { const v=emo(o[k]); if(v) cfg[k]=v; }
    if(Array.isArray(o.bg) && o.bg.length>=2 && o.bg.every(c=>/^#[0-9a-f]{3,8}$/i.test(c))) cfg.bg=o.bg.slice(0,2);
    for(const k of ["move","action","pattern","effect"]) if(O()[k].includes(o[k])) cfg[k]=o[k];
    const sp = Number(o.speed); if(sp>=.5 && sp<=2) cfg.speed=sp;
    cfg.hint = `방향키·드래그 이동 · 스페이스 ${cfg.actLabel||"행동"}`;
    return cfg;
  }

  window.WordMeta = { META, compile, merge };
})();
