/* 토큰 변환기 담당: 심사위원
 *
 * 디자인 회사에서 신입에게 "까다로운 클라이언트", "뭐든 좋다는 클라이언트" 같은 역할을 정해 두고
 * 로고를 그려 오게 하듯, 같은 문장도 누가 심사하느냐에 따라 결과와 멘트가 달라집니다.
 *
 *   JUDGES[id] = {name, emoji, desc, budget, sfx:{pass,fail}, persona, local}
 *     sfx      통과·탈락 때 나는 소리 (js/sounds.js 이름)
 *     budget   연결 토큰 한도 (grammar.js 에 넘김)
 *     persona  Claude에게 주는 성격 설명 (영어가 토큰이 적게 들어서 영어)
 *     local    0 토큰 모드에서 쓰는 미리 써 둔 멘트와 점수 규칙
 *
 *   Judges.localVerdict(id, ctx) → {ok, score, comment}   Claude 없이 심사
 *     ctx = {words:{who,where,...}, glued:[연결 토큰 붙은 원래 단어], glueUsed}
 */
(function(){
  const pick = a => a[Math.floor(Math.random()*a.length)];
  const fill = (s, w) => s.replace(/\{(\w+)\}/g, (_, k) => w[k] ?? "그거");

  const JUDGES = {
    warm: {
      name:"다정한 심사위원", emoji:"🥰", budget:3, sfx:{pass:"airhorn", fail:"trombone"},
      desc:"웬만하면 통과. 칭찬을 아끼지 않아요. 연결 토큰 3개까지.",
      persona:`You are the WARM judge: generous and encouraging. Pass unless nothing at all connects. Praise specific word choices, find hidden meaning in forced connectors, end with one gentle tip. Score 6-10 when passing.`,
      local:{
        pass:[
          "어머, {who}{가} {where}에 있다는 발상부터 너무 사랑스러워요.",
          "억지로 이은 부분도 오히려 매력이에요. 저는 이런 용기를 높이 사요.",
          "특히 '{result}' 부분에서 웃음이 났어요. 플레이어들도 분명 좋아할 거예요.",
          "다음엔 '{hit}'{를} 조금 더 살려 보면 어떨까요? 그래도 오늘은 무조건 통과예요!"
        ],
        fail:[
          "아이고, 정말 열심히 하신 게 보여요. 그런데 연결 토큰을 너무 많이 써서 제가 문장을 따라가질 못했어요.",
          "카드 한두 장만 바꾸면 금방 통과할 것 같아요. 다시 기다릴게요!"
        ],
        score: ctx => 10 - ctx.glueUsed
      }
    },
    strict: {
      name:"깐깐한 심사위원", emoji:"🧐", budget:1, sfx:{pass:"ding", fail:"buzzer"},
      desc:"억지 연결을 싫어해요. 조금만 어색해도 탈락. 연결 토큰 1개까지.",
      persona:`You are the STRICT judge: demanding, dry, sarcastic but never cruel. Pass only if every part clearly drives one playable mechanic. Nitpick each forced connector and weak link by quoting it. Score 1-7 even when passing; 8+ is legendary.`,
      local:{
        pass:[
          "흠. {who}{가} {where}에서 움직인다. 여기까지는 납득했습니다.",
          "'{like}' 같은 수식은 조작감으로 살릴 수 있겠군요. 겨우요.",
          "'{hit}'에 닿으면 '{result}'... 인과가 약하지만 게임은 됩니다.",
          "통과는 시켜 드리죠. 다음엔 연결 토큰 없이 와 보세요."
        ],
        fail:[
          "'{glue}'. 이건 연결이 아니라 테이프로 붙인 겁니다.",
          "주인공과 장애물 사이에 아무 이야기가 없어요. 게임은 관계에서 나옵니다.",
          "탈락입니다. 카드를 다시 보시죠."
        ],
        score: ctx => Math.max(1, 6 - ctx.glueUsed*2)
      }
    },
    bored: {
      name:"관심 없는 심사위원", emoji:"🥱", budget:2, sfx:{pass:"rimshot", fail:"scratch"},
      desc:"사실 심사에 별 관심이 없어요. 기분 따라 통과. 연결 토큰 2개까지.",
      persona:`You are the BORED judge: you barely read it. Mostly pass, but fail on a whim for an unrelated reason (lunch, your phone, the weather). Ramble about something off-topic, mention one random word from the sentence as if skimming. Score is arbitrary 1-10.`,
      local:{
        pass:[
          "아 네네, {who}... 좋네요. 근데 오늘 점심 뭐 먹지.",
          "{where}? 거기 가 본 것 같기도 하고요. 잘 모르겠어요.",
          "음, 그냥 통과요. 휴대폰 배터리가 3%라서요.",
          "점수는... 그냥 기분이에요. 너무 의미 두지 마세요."
        ],
        fail:[
          "음... 오늘은 왠지 '{unit}'{라는} 단어가 별로네요.",
          "죄송한데 방금 졸았어요. 탈락으로 할게요. 다음 분~"
        ],
        score: () => 1 + Math.floor(Math.random()*10),
        whim: .2   // 문법이 맞아도 이 확률로 그냥 탈락
      }
    }
  };

  /* 조사: {가} {를} {라는} 을 앞 단어 받침에 맞춰 바꿈 (따옴표가 끼어 있어도 됨) */
  const PAIRS = {"가":["이","가"], "를":["을","를"], "라는":["이라는","라는"]};
  function josa(s){
    return s.replace(/([가-힣])(['’]?)\{(가|를|라는)\}/g, (_, ch, qt, k) => ch + qt + PAIRS[k][((ch.charCodeAt(0)-0xAC00)%28) ? 0 : 1]);
  }

  function localVerdict(id, ctx){
    const j = JUDGES[id], L = j.local;
    const w = {...ctx.words, glue: ctx.glued[0] || ctx.words.act};
    let ok = ctx.glueUsed <= j.budget;
    if(ok && L.whim && Math.random() < L.whim) ok = false;
    const lines = ok ? L.pass : L.fail;
    const comment = lines.map(l => josa(fill(l, w))).join(" ");
    return {ok, score: ok ? Math.max(1, Math.min(10, L.score(ctx))) : 0, comment};
  }

  window.Judges = { JUDGES, localVerdict };
})();
