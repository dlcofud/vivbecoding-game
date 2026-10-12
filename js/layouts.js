/* 블록 코딩 조합 담당: 블록 구조(레이아웃) 데이터
 *
 * 작업대 위 "블록 구조" 버튼 하나 = 아래 presets 하나.
 * - id, name: 버튼 이름 / guide: 바이브 코딩 명령어의 해석 가이드 첫 줄에 들어갈 구조 설명
 * - blocks: 위에서 아래로 쌓이는 블록들
 *     k: 블록 종류  ev(시작, 노랑) ctrl(제어, 주황) mot(동작, 파랑) look(형태, 보라) snd(소리, 분홍) var(변수, 청록) cap(끝 블록)
 *        c(입 벌린 C 블록) → body 에 안쪽 블록들, loop:true 면 ↻ 표시, else/elseBody 로 "아니면" 칸 추가
 *     t: 블록 글자. {who} 처럼 중괄호가 빈칸
 * - sentence: 토큰 변환기로 넘어갈 문장
 * - roles(선택): 빈칸별로 이름·해석 가이드를 바꿀 때 {빈칸: {label, guide}}
 *
 * 빈칸 문법
 * - {who}  words.js 의 카테고리 이름. 같은 카테고리를 또 쓰려면 {hit2}, {who2} 처럼 숫자를 붙여요 (따로 카드를 받음)
 * - {who|이가} 처럼 | 뒤에 조사를 쓰면 단어 받침에 맞춰 바뀌어요: 이가 을를 은는 와과 으로
 *
 * parts: 🎲 랜덤 조립 버튼이 무작위로 고르는 블록 조각들 (t = 블록 글자, s = 문장 조각)
 */
window.LAYOUTS = {
  presets: [
    {id:"basic", name:"무한 반복", guide:"가장 기본적인 액션 게임. 주인공이 계속 움직이고 장애물에 닿으면 무언가 일어난다",
      blocks:[
        {k:"ev", t:"시작하면 {who|이가} {where}에서 등장"},
        {k:"c", loop:true, t:"무한 반복", body:[{k:"mot", t:"{like} {act}"}]},
        {k:"ctrl", t:"만약 {hit}에 닿으면 {result}"},
        {k:"var", t:"점수 단위를 {unit|으로} 정하기"}
      ],
      sentence:"{who|이가} {where}에서 {like} {act}. {hit}에 닿으면 {result}. 점수는 {unit|으로} 센다."},

    {id:"boss", name:"보스전", guide:"화면 위쪽의 보스가 탄을 쏘고 주인공이 피하며 반격하는 보스전",
      roles:{hit2:{label:"보스", guide:"보스 (화면 위쪽의 거대한 적, 체력 바 있음)"}, hit:{label:"보스의 탄", guide:"보스가 쏘는 탄막"}},
      blocks:[
        {k:"ev", t:"시작하면 {where}에 {who|이가} 나타남"},
        {k:"look", t:"보스 {hit2|이가} 등장"},
        {k:"c", loop:true, t:"3초마다", body:[
          {k:"ctrl", t:"보스가 {hit|을를} 발사"},
          {k:"mot", t:"{who|은는} {like} {act}"}
        ]},
        {k:"ctrl", t:"만약 {hit}에 맞으면 {result}"},
        {k:"var", t:"보스를 쓰러뜨리면 {unit} +100"}
      ],
      sentence:"{where}에 {who|이가} 나타나자 보스 {hit2|이가} 등장한다. 보스는 3초마다 {hit|을를} 발사하고, {who|은는} {like} {act}. {hit}에 맞으면 {result}. 보스를 쓰러뜨리면 {unit} 100점."},

    {id:"branch", name:"갈림길", guide:"닿는 것에 따라 결과가 갈리는 구조. 장애물 두 종류가 서로 다른 효과를 낸다",
      blocks:[
        {k:"ev", t:"시작하면 {who|이가} {where}에 들어감"},
        {k:"c", loop:true, t:"무한 반복", body:[
          {k:"mot", t:"{like} {act}"},
          {k:"c", t:"만약 {hit}에 닿으면", body:[{k:"look", t:"{result}"}],
            else:"아니면 만약 {hit2}에 닿으면", elseBody:[{k:"snd", t:"{result2}"}]}
        ]},
        {k:"var", t:"점수 단위를 {unit|으로} 정하기"}
      ],
      sentence:"{who|이가} {where}에서 {like} {act}. {hit}에 닿으면 {result}. 하지만 {hit2}에 닿으면 {result2}. 점수는 {unit|으로} 센다."},

    {id:"time", name:"타임 어택", guide:"60초 제한 시간 안에 아이템을 최대한 많이 모으는 게임",
      roles:{hit:{guide:"모아야 할 아이템"}, result:{guide:"시간이 끝났을 때의 엔딩 연출"}},
      blocks:[
        {k:"ev", t:"시작하면 타이머 60초, {who|이가} {where}에 떨어짐"},
        {k:"c", loop:true, t:"타이머가 0이 될 때까지", body:[
          {k:"mot", t:"{like} {act}"},
          {k:"ctrl", t:"{hit|을를} 먹으면 {unit} +1"}
        ]},
        {k:"look", t:"시간이 다 되면 {result}"},
        {k:"cap", t:"게임 끝"}
      ],
      sentence:"60초 동안 {who|이가} {where}에서 {like} {act}. {hit|을를} 먹을 때마다 {unit} 1점. 시간이 다 되면 {result}."},

    {id:"duo", name:"2인 협동", guide:"한 화면 2인 플레이. 1P는 WASD, 2P는 방향키. 둘이 힘을 합쳐야 한다",
      blocks:[
        {k:"ev", t:"시작하면 {who|와과} {who2|이가} {where}에서 만남"},
        {k:"c", loop:true, t:"무한 반복", body:[
          {k:"mot", t:"{who|은는} {like} {act}"},
          {k:"mot", t:"{who2|은는} {act2}"}
        ]},
        {k:"ctrl", t:"만약 둘이 동시에 {hit}에 닿으면 {result}"},
        {k:"var", t:"팀 점수 단위를 {unit|으로} 정하기"}
      ],
      sentence:"{who|와과} {who2|이가} {where}에서 만난다. {who|은는} {like} {act}. {who2|은는} {act2}. 둘이 동시에 {hit}에 닿으면 {result}. 팀 점수는 {unit|으로} 센다."},

    {id:"reverse", name:"주객전도", guide:"역할이 뒤집힌 게임. 플레이어가 장애물을 조종해서 몰려오는 주인공 무리를 막는다",
      roles:{hit:{label:"내 캐릭터", guide:"플레이어가 조종하는 것 (원래는 장애물이었음)"}, who:{label:"몰려오는 적", guide:"떼로 몰려오는 적 무리"}},
      blocks:[
        {k:"ev", t:"시작하면 내가 {hit|이가} 됨"},
        {k:"look", t:"{where}에 {who|이가} 떼로 몰려옴"},
        {k:"c", loop:true, t:"무한 반복", body:[
          {k:"mot", t:"{who|은는} {like} {act}"},
          {k:"ctrl", t:"만약 {who|이가} 나에게 닿으면 {result}"}
        ]},
        {k:"var", t:"막아낸 수를 {unit|으로} 세기"},
        {k:"cap", t:"{who|이가} 끝까지 가면 게임 끝"}
      ],
      sentence:"플레이어는 {hit|이가} 되어 {where}에 몰려오는 {who|을를} 막는다. {who|은는} {like} {act}. {who|이가} 나에게 닿으면 {result}. 막아낸 수는 {unit|으로} 센다."},

    {id:"stage", name:"스테이지 2개", guide:"두 단계로 된 게임. 점수를 채우면 배경과 장애물이 바뀌는 2단계로 넘어간다",
      blocks:[
        {k:"ev", t:"시작하면 {who|이가} 1단계 {where}에서 출발"},
        {k:"c", loop:true, t:"무한 반복", body:[
          {k:"mot", t:"{like} {act}"},
          {k:"ctrl", t:"만약 {hit}에 닿으면 {result}"}
        ]},
        {k:"look", t:"{unit} 10점을 넘으면 2단계 {where2|으로} 이동"},
        {k:"snd", t:"2단계에서는 {hit2|이가} 섞여 나옴"},
        {k:"var", t:"최종 점수를 {unit|으로} 표시"}
      ],
      sentence:"{who|이가} {where}에서 출발해 {like} {act}. {hit}에 닿으면 {result}. {unit} 10점을 넘으면 {where2|으로} 넘어가고, 거기서는 {hit2}도 나온다."}
  ],

  parts: {
    start:[
      {t:"시작하면 {who|이가} {where}에서 등장", s:"{who|이가} {where}에서 등장한다."},
      {t:"시작하면 {where}에 {who|이가} 떨어짐", s:"{where}에 {who|이가} 떨어진다."},
      {t:"깃발을 누르면 {who|이가} {where}에서 깨어남", s:"{who|이가} {where}에서 깨어난다."},
      {t:"시작하면 {who|이가} {where}에 갇힘", s:"{who|이가} {where}에 갇혔다."}
    ],
    loop:[
      {t:"무한 반복", s:"계속", loop:true},
      {t:"10번 반복", s:"열 번", loop:true},
      {t:"2초마다", s:"2초마다", loop:true},
      {t:"{hit}에 닿을 때까지 반복", s:"{hit}에 닿을 때까지", loop:true},
      {t:"스페이스를 누르는 동안", s:"스페이스를 누르는 동안"}
    ],
    body:[
      {k:"mot", t:"{like} {act}", s:"{like} {act}"},
      {k:"mot", t:"{who|은는} {like} 움직임", s:"{who|은는} {like} 움직인다"},
      {k:"mot", t:"{act}", s:"{act}"},
      {k:"look", t:"{hit|이가} 쏟아짐", s:"{hit|이가} 쏟아진다"},
      {k:"look", t:"화면이 흔들림", s:"화면이 흔들린다"},
      {k:"snd", t:"{hit|이가} 노래를 부름", s:"{hit|이가} 노래를 부른다"}
    ],
    rule:[
      {k:"ctrl", t:"만약 {hit}에 닿으면 {result}", s:"{hit}에 닿으면 {result}."},
      {k:"ctrl", t:"만약 {hit|을를} 피하면 {unit} +1", s:"{hit|을를} 피할 때마다 {unit} 1점."},
      {k:"ctrl", t:"만약 {unit} 10점이 되면 {result}", s:"{unit} 10점이 되면 {result}."},
      {k:"look", t:"{hit|와과} 부딪히면 {result}", s:"{hit|와과} 부딪히면 {result}."},
      {k:"snd", t:"{hit|이가} 말을 걸면 {result}", s:"{hit|이가} 말을 걸면 {result}."}
    ],
    score:[
      {k:"var", t:"점수 단위를 {unit|으로} 정하기", s:"점수는 {unit|으로} 센다."},
      {k:"var", t:"{unit|이가} 0이 되면 게임 끝", s:"{unit|이가} 0이 되면 끝난다."},
      {k:"var", t:"최고 기록을 {unit|으로} 저장", s:"최고 기록은 {unit|으로} 남긴다."}
    ],
    end:[
      {k:"cap", t:"3분 지나면 게임 끝", s:"3분이 지나면 게임이 끝난다."},
      {k:"cap", t:"{who|이가} 넘어지면 멈추기", s:"{who|이가} 넘어지면 모든 게 멈춘다."}
    ]
  }
};
