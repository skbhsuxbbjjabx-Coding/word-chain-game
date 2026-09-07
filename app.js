const WORD_BANK = [
  ["마음", "사람의 생각이나 감정이 깃드는 곳"], ["음악", "소리로 감정과 생각을 표현하는 예술"], ["악수", "두 사람이 손을 마주 잡는 인사"], ["수박", "여름에 즐겨 먹는 큰 과일"], ["박수", "손뼉을 쳐서 기쁨을 나타냄"], ["수업", "학교나 교육 기관에서 배우는 시간"], ["업무", "맡아서 하는 일"], ["무지개", "비 온 뒤 하늘에 나타나는 일곱 빛깔"], ["개나리", "봄에 노란 꽃을 피우는 나무"], ["리본", "끈이나 천을 묶어 장식하는 것"], ["본능", "배우지 않아도 자연스럽게 나타나는 행동"], ["능력", "어떤 일을 해낼 수 있는 힘"], ["력사", "역사의 북한어"], ["사과", "잘못을 인정하고 용서를 비는 말"], ["과일", "나무나 풀에서 나는 먹을 수 있는 열매"], ["일기", "날마다 있었던 일을 적은 기록"], ["기차", "철길 위를 달리는 교통수단"], ["차표", "차를 타기 위해 사는 표"], ["표정", "마음속 감정이 얼굴에 드러난 모양"], ["정답", "질문이나 문제에 대한 바른 답"], ["답장", "편지나 메시지에 대한 회답"], ["장미", "가시가 있는 아름다운 꽃"], ["미소", "소리 없이 웃는 표정"], ["소나기", "갑자기 세차게 내리는 비"], ["기억", "지난 일을 잊지 않고 간직하는 것"], ["억울", "잘못이 없는데도 부당하게 당한 느낌"], ["울음", "슬프거나 아플 때 내는 소리"], ["음식", "사람이 먹는 것"], ["식탁", "음식을 차려 놓는 상"], ["탁구", "공을 라켓으로 넘기는 운동"], ["구름", "하늘에 떠 있는 수증기 덩어리"], ["름름", "소리를 흉내 낸 옛말"], ["름자", "이름을 낮추어 이르는 말"], ["자전거", "사람이 페달을 밟아 움직이는 탈것"], ["거울", "모습을 비추어 보는 물건"], ["울타리", "경계를 둘러막는 시설"], ["리더", "무리를 이끄는 사람"], ["더위", "기온이 높아 덥게 느껴지는 기운"], ["위치", "일정한 곳에 자리한 자리"], ["치약", "이를 닦는 데 쓰는 약"], ["약속", "서로 지키기로 정한 일"], ["속도", "움직이는 빠르기의 정도"], ["도서관", "책을 모아 두고 빌려주는 곳"], ["관심", "어떤 것에 마음을 기울임"], ["심장", "피를 온몸으로 보내는 기관"], ["장난", "재미로 하는 짓"], ["난로", "방을 따뜻하게 하는 기구"], ["로봇", "사람을 대신하여 일을 하는 기계"], ["봇물", "보에서 흘러나오는 물"], ["물고기", "물에서 사는 동물"], ["기린", "목이 긴 초식 동물"], ["린스", "머리를 감은 뒤 쓰는 세정제"], ["스키", "눈 위를 미끄러져 내려오는 운동"], ["키위", "새콤한 맛의 갈색 과일"], ["위성", "행성 주위를 도는 천체"], ["성냥", "불을 붙이는 작은 도구"], ["냥이", "고양이를 친근하게 부르는 말"], ["이야기", "사실이나 생각을 말로 풀어 놓은 것"], ["기분", "마음에 느껴지는 상태"], ["분필", "칠판에 글을 쓰는 도구"], ["필통", "필기구를 넣는 통"], ["통나무", "베어 낸 나무의 줄기"], ["무지", "아는 것이 없음"], ["지구", "우리가 사는 행성"], ["구두", "발에 신는 가죽 신발"], ["두부", "콩으로 만든 흰 음식"], ["부엌", "음식을 만드는 공간"], ["억새", "가을 들판에 자라는 풀"], ["새우", "껍데기가 있는 물속 동물"], ["우산", "비나 햇빛을 가리는 물건"], ["산책", "바람을 쐬며 천천히 걷는 일"], ["책상", "책을 놓고 공부하는 상"], ["상자", "물건을 넣는 네모난 용기"], ["자동차", "엔진으로 움직이는 탈것"], ["차례", "순서에 따라 돌아오는 차례"], ["례절", "예의와 절도를 아울러 이르는 말"], ["절약", "아껴서 씀"], ["약간", "얼마 안 되는 정도"], ["간식", "끼니 사이에 먹는 음식"], ["식물", "땅에 뿌리를 내리고 사는 생물"], ["물감", "그림을 그릴 때 쓰는 색 재료"], ["감자", "땅속에서 자라는 먹거리"], ["자두", "붉거나 보라색인 과일"], ["두꺼비", "몸이 크고 피부가 울퉁불퉁한 양서류"], ["비누", "몸이나 물건을 씻는 세정제"], ["누나", "남자가 손위 누이를 부르는 말"], ["나무", "줄기가 굵고 가지가 뻗는 식물"], ["무궁화", "우리나라의 나라꽃"], ["화분", "꽃을 심어 가꾸는 그릇"], ["분수", "물을 뿜어 올리는 시설"], ["수영", "물속에서 헤엄치는 운동"], ["영화", "움직이는 영상을 보여 주는 예술"], ["화산", "땅속의 마그마가 분출하는 산"], ["산책로", "산책을 위해 만든 길"], ["로맨스", "사랑을 주제로 한 이야기"], ["스마트폰", "전화와 인터넷이 가능한 휴대 기기"], ["폰트", "글자의 모양과 디자인"], ["트럭", "짐을 싣고 나르는 자동차"], ["럭비", "공을 들고 달리는 구기 종목"], ["비행기", "하늘을 나는 교통수단"], ["기상", "대기 중에서 일어나는 현상"], ["상상", "실제로 없지만 마음속으로 그려 봄"], ["상어", "바다에 사는 큰 물고기"], ["어깨", "팔과 몸통이 이어지는 부분"], ["깨소금", "볶은 참깨를 빻은 양념"], ["금요일", "일주일의 다섯째 날"], ["일몰", "해가 지는 일"], ["몰입", "한 가지 일에 깊이 빠져듦"], ["입구", "들어가는 곳"], ["구경", "둘러보며 보는 일"], ["경기", "운동이나 경쟁을 벌이는 일"], ["기회", "어떤 일을 할 수 있는 때"], ["회사", "일정한 목적을 가진 조직"], ["사무실", "사무를 보는 공간"], ["실내", "건물 안"], ["내일", "오늘의 다음 날"], ["일출", "해가 떠오르는 일"], ["출발", "길을 떠남"], ["발자국", "발로 밟은 자리에 남은 흔적"], ["국수", "밀가루나 곡물로 만든 면 음식"], ["수건", "몸을 닦는 천"], ["건강", "몸과 마음이 튼튼한 상태"], ["강물", "강을 흐르는 물"], ["물결", "물이 움직이며 이루는 물무늬"], ["결심", "마음을 굳게 정함"], ["심부름", "부탁받은 일을 해 주는 것"], ["름새", "생김새를 낮추어 이르는 말"], ["새벽", "날이 밝기 전의 시간"], ["벽돌", "건축에 쓰는 네모난 돌"], ["돌고래", "바다에 사는 포유동물"], ["래퍼", "랩을 하는 가수"], ["퍼즐", "조각을 맞추는 놀이"], ["즐거움", "즐겁게 느끼는 마음"], ["음료", "마시는 액체"], ["료리", "요리의 북한어"], ["리듬", "음악의 규칙적인 흐름"], ["듬성듬성", "드문드문 떨어져 있는 모양"], ["성공", "목적을 이루는 것"], ["공원", "사람들이 쉬거나 노는 곳"], ["원숭이", "나무를 잘 타는 동물"], ["이불", "잠잘 때 덮는 침구"], ["불꽃", "타오르는 불의 모양"], ["꽃병", "꽃을 꽂아 두는 병"], ["병원", "환자를 치료하는 곳"], ["원두", "볶기 전 커피 열매"], ["두더지", "땅속에 사는 포유동물"], ["지우개", "글씨를 지우는 도구"], ["개미", "작고 부지런한 곤충"], ["미술", "그림이나 조형으로 표현하는 예술"], ["술잔", "술을 담는 잔"], ["잔디", "마당이나 운동장에 까는 풀"], ["디자인", "모양과 기능을 계획하는 일"], ["인형", "사람이나 동물 모양 장난감"], ["형제", "같은 부모에게서 난 사람"], ["제비", "봄에 돌아오는 작은 새"], ["비밀", "남에게 알리지 않은 일"], ["밀가루", "밀을 빻아 만든 가루"], ["루비", "붉은 보석"], ["비상", "긴급한 상황"], ["상태", "현재 놓여 있는 형편"], ["태양", "스스로 빛을 내는 항성"], ["양말", "발에 신는 옷"], ["말풍선", "만화에서 말을 담는 모양"], ["선물", "고마움이나 축하의 뜻으로 주는 물건"], ["물병", "물을 담는 병"], ["병아리", "어린 닭"], ["리모컨", "기계를 멀리서 조종하는 장치"], ["컨디션", "몸과 마음의 상태"], ["션트", "전류를 우회시키는 장치"], ["트로피", "경기 우승자에게 주는 상"], ["피아노", "건반을 눌러 연주하는 악기"], ["노을", "해 질 무렵 하늘의 붉은 빛"], ["을지로", "서울의 거리 이름"], ["로켓", "추진력으로 우주로 날아가는 비행체"], ["켓찹", "토마토로 만든 조미료"], ["찹쌀", "찰기가 많은 쌀"], ["쌀밥", "쌀로 지은 밥"], ["밥상", "밥을 차려 놓은 상"], ["상쾌", "기분이 시원하고 산뜻함"], ["쾌속", "매우 빠른 속도"], ["속담", "교훈을 담은 짧은 말"], ["담요", "몸을 덮는 두꺼운 천"], ["요리", "재료를 익혀 음식을 만듦"], ["리어카", "사람이 끌고 다니는 수레"], ["카메라", "사진이나 영상을 찍는 기계"], ["라디오", "전파로 소리를 보내는 기기"], ["오리", "물과 땅에서 사는 새"], ["리더십", "집단을 이끄는 힘"], ["십자수", "실로 수를 놓는 공예"], ["수학", "수와 도형을 연구하는 학문"], ["학원", "학교 밖에서 공부하는 곳"], ["원칙", "행동의 기준이 되는 법칙"], ["칙령", "임금이 내린 명령"], ["령도", "앞장서서 이끎"], ["도시", "사람이 많이 모여 사는 지역"], ["시계", "시간을 알려 주는 기계"], ["계절", "일 년을 나눈 때"], ["절벽", "깎아지른 듯한 낭떠러지"], ["벽화", "벽에 그린 그림"], ["화요일", "일주일의 둘째 날"], ["일상", "날마다 반복되는 생활"], ["상담", "서로 이야기하며 의논함"], ["담당", "일을 맡아 처리함"], ["당근", "주황색 뿌리채소"], ["근육", "몸을 움직이는 힘줄"], ["육교", "사람이 건너도록 만든 다리"], ["교실", "수업을 하는 방"], ["실수", "잘못하거나 틀림"], ["수도", "나라의 중심 도시"], ["도깨비", "한국 설화에 나오는 존재"], ["비둘기", "도시에서 자주 보이는 새"], ["기러기", "먼 거리를 이동하는 새"], ["기차역", "기차가 서는 곳"], ["역사", "과거에 일어난 일"], ["사전", "낱말의 뜻을 풀이한 책"], ["전구", "전기로 빛을 내는 기구"], ["구급차", "응급 환자를 나르는 차"], ["차가운", "온도가 낮은 상태"], ["운동", "몸을 움직이는 활동"], ["동물", "스스로 움직이는 생물"], ["물리", "물질과 힘을 연구하는 학문"], ["리더보드", "순위를 보여 주는 판"], ["드라마", "사건과 인물을 표현한 작품"], ["마라톤", "긴 거리를 달리는 경기"], ["톤업", "색이나 분위기를 밝게 함"], ["업데이트", "최신 상태로 고침"], ["트리", "나무 모양의 구조"], ["리액션", "반응이나 호응"], ["션샤인", "햇빛을 뜻하는 말"], ["인사", "만나거나 헤어질 때 하는 말"], ["사랑", "아끼고 소중히 여기는 마음"], ["랑데부", "약속한 만남"], ["부채", "바람을 일으키는 도구"], ["채소", "밭에서 기르는 먹거리"], ["소나무", "사철 푸른 나무"], ["무대", "공연을 하는 자리"], ["대화", "마주 보며 나누는 이야기"], ["화음", "여러 음이 어울린 소리"], ["음표", "음의 길이와 높이를 나타내는 기호"], ["표현", "생각이나 느낌을 나타냄"], ["현관", "건물의 출입구"], ["관찰", "주의 깊게 살펴봄"], ["찰떡", "찹쌀로 만든 떡"], ["떡볶이", "떡을 양념에 볶은 음식"], ["이야기꽃", "즐겁게 나누는 이야기"], ["꽃게", "옆으로 걷는 바다 동물"], ["게임", "규칙에 따라 즐기는 놀이"], ["임무", "맡은 일"], ["무승부", "승패가 나지 않음"], ["부엉이", "밤에 활동하는 새"], ["이상", "생각이나 기준보다 높거나 나음"], ["상상력", "상상하는 힘"], ["역할", "맡은 구실"], ["할인", "값을 깎아 줌"], ["인기", "사람들의 관심을 많이 받음"]
];

const dictionary = new Map(WORD_BANK);
const words = WORD_BANK.map(([word]) => word);
const $ = (selector) => document.querySelector(selector);
const $$ = (selector) => [...document.querySelectorAll(selector)];
const state = {
  nickname: localStorage.getItem("kkeutit-nickname") || "단어수집가",
  players: 3,
  difficulty: "hard",
  roomCode: "QUICK",
  gameMode: "quick",
  requiredInitial: "마",
  lastWord: "마음",
  usedWords: new Set(["마음"]),
  round: 1,
  currentPlayer: "me",
  timer: 20,
  timerId: null,
  sound: localStorage.getItem("kkeutit-sound") !== "off",
  queueId: null,
  playerNames: [],
  matchTicket: null,
  matchPollId: null,
  matchId: null,
  playerId: null,
  selfIndex: 0,
  eventCursor: 0,
  eventPollId: null,
  startWord: "마음"
};

const avatarClasses = ["mint", "coral", "blue"];
const pick = (list) => list[Math.floor(Math.random() * list.length)];
const normalizeWord = (value) => value.trim().replace(/\s+/g, "");
const lastSyllable = (word) => [...word].at(-1) || "";
const firstSyllable = (word) => [...word][0] || "";
const roParticle = (syllable) => { const code = syllable.codePointAt(0); return code >= 0xAC00 && code <= 0xD7A3 && (code - 0xAC00) % 28 === 0 ? "로" : "으로"; };
const getCandidates = (initial, used = state.usedWords) => words.filter((word) => firstSyllable(word) === initial && !used.has(word));
const responseCount = (word, used) => getCandidates(lastSyllable(word), used).length;
const isOneShot = (word, used = state.usedWords) => responseCount(word, used) === 0;
const getDefinition = (word) => dictionary.get(word) || "끝잇 단어 데이터에 등록된 낱말";
const pickOpeningWord = () => pick(words.filter((word) => responseCount(word, new Set([word])) >= 2));

function showToast(message) {
  const toast = $("#toast");
  toast.textContent = message;
  toast.classList.add("show");
  clearTimeout(showToast.timeout);
  showToast.timeout = setTimeout(() => toast.classList.remove("show"), 2200);
}

function setView(view) {
  $("#lobbyView").classList.toggle("active-view", view === "lobby");
  $("#gameView").classList.toggle("active-view", view === "game");
  window.scrollTo({ top: 0, behavior: "smooth" });
}

function openModal(content) {
  $("#modalContent").innerHTML = content;
  $("#modalBackdrop").hidden = false;
  document.body.style.overflow = "hidden";
}

function closeModal() {
  $("#modalBackdrop").hidden = true;
  document.body.style.overflow = "";
}

function makeCode() {
  const alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  return Array.from({ length: 6 }, () => pick([...alphabet])).join("");
}

function copyText(value) {
  navigator.clipboard?.writeText(value).then(() => showToast(`${value} 복사했어요`)).catch(() => showToast("코드를 선택해서 복사해 주세요"));
}

function setupLobby() {
  $("#nicknameInput").value = state.nickname;
  $("#soundToggle").classList.toggle("active", state.sound);
  $$(".count-option").forEach((button) => button.addEventListener("click", () => {
    $$(".count-option").forEach((item) => item.classList.remove("selected"));
    button.classList.add("selected");
    state.players = Number(button.dataset.count);
  }));
  $("#nicknameInput").addEventListener("change", (event) => {
    state.nickname = event.target.value.trim() || "단어수집가";
    event.target.value = state.nickname;
    localStorage.setItem("kkeutit-nickname", state.nickname);
    showToast("닉네임을 저장했어요");
  });
  $("#quickMatchButton").addEventListener("click", startQuickMatch);
  $("#aiMatchButton").addEventListener("click", aiMatchModal);
  $("#createRoomButton").addEventListener("click", createRoomModal);
  $("#joinRoomButton").addEventListener("click", joinRoomModal);
  $("#rulesButton").addEventListener("click", rulesModal);
  $("#helpButton").addEventListener("click", helpModal);
  $("#privacyButton").addEventListener("click", () => showToast("즐거운 플레이를 위해 비속어와 개인정보를 입력하지 마세요"));
  $("#soundToggle").addEventListener("click", () => {
    state.sound = !state.sound;
    localStorage.setItem("kkeutit-sound", state.sound ? "on" : "off");
    $("#soundToggle").classList.toggle("active", state.sound);
    showToast(state.sound ? "소리를 켰어요" : "소리를 껐어요");
  });
  $("#settingsButton").addEventListener("click", settingsModal);
}

function createRoomModal() {
  const code = makeCode();
  state.roomCode = code;
  openModal(`<p class="panel-kicker">PRIVATE ROOM</p><h2 id="modalTitle">친구를 초대할 방이에요</h2><p>아래 코드를 친구에게 공유하면 같은 방에 들어올 수 있어요.</p><div class="modal-code"><span>초대 코드</span><strong>${code}</strong></div><div class="room-player"><i class="mini-avatar">${state.nickname[0]}</i><span>${state.nickname}</span><span class="room-status">방장</span></div><div class="room-player"><i class="mini-avatar mint">＋</i><span>친구를 기다리는 중</span><span class="room-status">0 / ${state.players - 1}</span></div><div class="modal-footer"><button class="secondary-button" id="copyRoomCode" style="min-height:42px"><span class="button-icon">⌘</span><span><strong>코드 복사</strong></span></button><button class="primary-button" id="startRoomButton">혼자 연습 시작</button></div>`);
  $("#copyRoomCode").addEventListener("click", () => copyText(code));
  $("#startRoomButton").addEventListener("click", () => { closeModal(); state.gameMode = "friend"; state.players = 2; state.roomCode = code; beginGame([state.nickname, "초대 대기 중"], "친구 방 · 2인"); });
}

function aiMatchModal() {
  openModal(`<p class="panel-kicker">PLAY WITH AI</p><h2 id="modalTitle">AI와 한 판 해볼까요?</h2><p>끝잇 AI는 현재 단어에서 이어질 수 있는 후보를 살펴보고, 난이도에 따라 영리하게 단어를 골라요.</p><label class="modal-label">난이도 선택</label><div class="difficulty-options" role="group" aria-label="AI 난이도 선택"><button class="difficulty-option" data-difficulty="easy"><strong>쉬움</strong><small>가끔 쉬운 길을 선택해요</small></button><button class="difficulty-option" data-difficulty="normal"><strong>보통</strong><small>균형 있게 이어가요</small></button><button class="difficulty-option selected" data-difficulty="hard"><strong>어려움</strong><small>카운터가 적은 단어를 찾아요</small></button></div><div class="modal-footer"><button class="ghost-button" id="cancelAi" style="width:auto;margin:0;padding:12px 17px">취소</button><button class="primary-button" id="startAiButton">AI 대전 시작</button></div>`);
  $$(".difficulty-option").forEach((button) => button.addEventListener("click", () => {
    $$(".difficulty-option").forEach((item) => item.classList.remove("selected"));
    button.classList.add("selected");
    state.difficulty = button.dataset.difficulty;
  }));
  $("#cancelAi").addEventListener("click", closeModal);
  $("#startAiButton").addEventListener("click", () => {
    closeModal();
    state.gameMode = "ai";
    state.players = 2;
    state.roomCode = "AI-" + state.difficulty.toUpperCase();
    beginGame([state.nickname, "단어든든 AI"], `AI 대전 · ${state.difficulty === "hard" ? "어려움" : state.difficulty === "normal" ? "보통" : "쉬움"}`);
  });
}

function joinRoomModal() {
  openModal(`<p class="panel-kicker">JOIN ROOM</p><h2 id="modalTitle">친구의 코드를 입력하세요</h2><p>친구에게 받은 6자리 코드를 입력하면 방으로 이동합니다.</p><label class="modal-label" for="roomCodeInput">초대 코드</label><input class="modal-input" id="roomCodeInput" maxlength="6" placeholder="예: MANGO7" autocomplete="off" /><div class="modal-footer"><button class="ghost-button" id="cancelJoin" style="width:auto;margin:0;padding:12px 17px">취소</button><button class="primary-button" id="joinRoomSubmit">방 입장</button></div>`);
  $("#roomCodeInput").focus();
  $("#cancelJoin").addEventListener("click", closeModal);
  $("#joinRoomSubmit").addEventListener("click", () => {
    const code = normalizeWord($("#roomCodeInput").value).toUpperCase();
    if (code.length < 4) return showToast("초대 코드를 확인해 주세요");
    closeModal(); state.gameMode = "friend"; state.players = 2; state.roomCode = code; beginGame([state.nickname, "친구 플레이어"], "친구 방 · 2인");
  });
}

function rulesModal() {
  openModal(`<p class="panel-kicker">RULE BOOK</p><h2 id="modalTitle">끝잇 게임 룰</h2><p>공식 단어를 이어가며 마지막까지 살아남는 사람이 승리해요.</p><div class="rule-list" style="grid-template-columns:1fr;margin-top:18px"><div class="rule-item"><span class="rule-symbol">가</span><div><strong>단어 검증</strong><small>공식 사전 API를 서버에서 확인한 뒤 판정합니다.</small></div></div><div class="rule-item"><span class="rule-symbol no">×</span><div><strong>첫 턴 한방단어 금지</strong><small>상대가 이어갈 후보가 없는 단어는 첫 단어로 사용할 수 없습니다.</small></div></div><div class="rule-item"><span class="rule-symbol time">20</span><div><strong>턴 제한</strong><small>20초 안에 단어를 입력하지 않으면 턴을 놓칩니다.</small></div></div></div>`);
}

function helpModal() {
  openModal(`<p class="panel-kicker">QUICK HELP</p><h2 id="modalTitle">처음이라면 이렇게 해보세요</h2><p>화면에 표시된 마지막 글자로 시작하는 단어를 입력하면 됩니다. 단어 아래의 작은 설명은 끝잇이 확인한 사전 뜻이에요.</p><div class="modal-code" style="text-align:left"><strong style="font-size:16px;letter-spacing:0">마음 → 음악 → 악수</strong><span style="margin-top:8px">마지막 글자와 다음 단어의 첫 글자를 이어보세요.</span></div>`);
}

function settingsModal() {
  openModal(`<p class="panel-kicker">SETTINGS</p><h2 id="modalTitle">플레이 설정</h2><p>닉네임과 소리 설정은 이 기기에 저장됩니다.</p><label class="modal-label" for="modalNickname">닉네임</label><input class="modal-input" id="modalNickname" maxlength="12" value="${state.nickname}" /><div class="modal-footer"><button class="primary-button" id="saveSettings">저장하기</button></div>`);
  $("#saveSettings").addEventListener("click", () => { state.nickname = $("#modalNickname").value.trim() || "단어수집가"; $("#nicknameInput").value = state.nickname; localStorage.setItem("kkeutit-nickname", state.nickname); closeModal(); showToast("설정을 저장했어요"); });
}

async function startQuickMatch() {
  const count = state.players;
  const button = $("#quickMatchButton");
  button.disabled = true;
  button.innerHTML = '<span>◌</span> 실제 플레이어를 찾는 중...';
  try {
    const response = await fetch("/api/matchmaking/join", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ nickname: state.nickname, size: count }) });
    if (!response.ok) throw new Error("match_join_failed");
    state.matchTicket = (await response.json()).ticket;
    await pollQuickMatch();
    state.matchPollId = setInterval(pollQuickMatch, 900);
  } catch {
    button.disabled = false;
    button.innerHTML = '<span>⌁</span> 빠른 매칭 시작';
    showToast("매칭 서버에 연결하지 못했어요");
  }
}

async function pollQuickMatch() {
  if (!state.matchTicket) return;
  const response = await fetch(`/api/matchmaking/status?ticket=${encodeURIComponent(state.matchTicket)}`);
  if (!response.ok) return;
  const status = await response.json();
  const button = $("#quickMatchButton");
  if (status.status === "waiting") {
    button.innerHTML = `<span>◌</span> 실제 플레이어 ${status.waiting}명 대기 중...`;
    return;
  }
  clearInterval(state.matchPollId);
  state.matchPollId = null;
  state.gameMode = "human";
  state.matchId = status.matchId;
  state.playerId = status.playerId;
  state.selfIndex = status.selfIndex;
  state.eventCursor = 0;
  state.roomCode = status.roomCode;
  state.startWord = status.startWord;
  beginGame(status.players, `빠른 매칭 · ${status.players.length}인`, status.startWord);
  button.disabled = false;
  button.innerHTML = '<span>⌁</span> 빠른 매칭 시작';
}

function beginGame(names, title, openingWord = pickOpeningWord()) {
  state.playerNames = names;
  state.gameMode = state.gameMode || "quick";
  state.round = 1;
  state.currentPlayer = state.gameMode === "human" && state.selfIndex !== 0 ? "remote" : "me";
  state.startWord = openingWord;
  state.lastWord = openingWord;
  state.requiredInitial = lastSyllable(state.lastWord);
  state.usedWords = new Set([openingWord]);
  $("#gameTitle").textContent = title;
  $("#playerCountLabel").textContent = `${names.length}명`;
  $("#gameRoomCode").textContent = state.roomCode || "QUICK";
  renderPlayers();
  $("#chatLog").innerHTML = "";
  addMessage("system", "게임이 시작됐어요. 첫 단어는 한방단어를 사용할 수 없습니다.");
  addMessage("system", `시작 단어가 정해졌어요: ${openingWord} · ${getDefinition(openingWord)}`);
  $("#roundNumber").textContent = "01";
  $("#turnStatus").textContent = state.currentPlayer === "me" ? "당신의 턴이에요" : "첫 플레이어의 턴이에요";
  $("#turnPrompt").textContent = state.currentPlayer === "me" ? `마지막 글자 '${state.requiredInitial}'${roParticle(state.requiredInitial)} 시작하는 단어를 이어주세요.` : "다른 플레이어의 첫 단어를 기다리는 중...";
  $("#factCheck").textContent = "";
  $("#wordInput").value = "";
  setView("game");
  if (state.gameMode === "human") startMatchEventPolling();
  if (state.currentPlayer === "me") {
    startTimer();
    setTimeout(() => $("#wordInput").focus(), 250);
  }
}

function renderPlayers() {
  $("#playersList").innerHTML = state.playerNames.map((name, index) => {
    const isMe = state.gameMode === "human" ? index === state.selfIndex : index === 0;
    return `<div class="player-row"><span class="player-avatar ${avatarClasses[index % avatarClasses.length]}">${name[0]}</span><span class="player-info"><strong>${name}${isMe ? " (나)" : ""}</strong><small>${isMe ? "준비 완료" : index === 1 ? "좋은 단어를 찾는 중" : "플레이 중"}</small></span><i class="player-turn ${isMe && state.currentPlayer === "me" ? "active" : ""}"></i></div>`;
  }).join("");
}

function addMessage(type, word, note = "") {
  const isMine = type === "player";
  const displayName = isMine ? state.nickname : type === "ai" ? "단어든든 AI" : type === "remote" ? note.split("::")[0] || "플레이어" : "게임 안내";
  const visibleNote = type === "remote" ? note.split("::").slice(1).join("::") : note;
  const avatar = isMine ? state.nickname[0] : type === "ai" ? "AI" : type === "remote" ? displayName[0] : "끝";
  const body = type === "system"
    ? `<div class="chat-note">${word}</div>`
    : `<div class="word-bubble">${word}</div>${visibleNote ? `<div class="fact-inline">✓ ${visibleNote}</div>` : ""}`;
  const html = `<div class="chat-message ${isMine ? "mine" : ""}"><span class="chat-avatar ${type === "ai" ? "ai" : ""}">${avatar}</span><div class="chat-content"><div class="chat-meta"><strong>${displayName}</strong><span>${type === "system" ? "지금" : "방금"}</span></div>${body}</div></div>`;
  $("#chatLog").insertAdjacentHTML("beforeend", html);
  $("#chatLog").scrollTop = $("#chatLog").scrollHeight;
}

function startMatchEventPolling() {
  clearInterval(state.eventPollId);
  state.eventPollId = setInterval(pollMatchEvents, 750);
  pollMatchEvents();
}

async function pollMatchEvents() {
  if (state.gameMode !== "human" || !state.matchId) return;
  const response = await fetch(`/api/matches/${state.matchId}/events?after=${state.eventCursor}`);
  if (!response.ok) return;
  const payload = await response.json();
  state.eventCursor = payload.cursor;
  for (const event of payload.events) {
    if (event.playerId === state.playerId) continue;
    if (event.timeout) {
      state.currentPlayer = "me";
      state.requiredInitial = event.nextInitial;
      addMessage("system", `${event.nickname}님의 시간이 끝났어요. 당신의 턴입니다.`);
      $("#turnStatus").textContent = "당신의 턴이에요";
      $("#turnPrompt").textContent = `마지막 글자 '${state.requiredInitial}'${roParticle(state.requiredInitial)} 시작하는 단어를 이어주세요.`;
      renderPlayers();
      startTimer();
      continue;
    }
    state.usedWords.add(event.word);
    state.lastWord = event.word;
    state.requiredInitial = event.nextInitial;
    state.round += 1;
    state.currentPlayer = "me";
    addMessage("remote", event.word, `${event.nickname}::${event.note || getDefinition(event.word)} · 다음 글자 ${event.nextInitial}`);
    $("#roundNumber").textContent = String(state.round).padStart(2, "0");
    $("#turnStatus").textContent = "당신의 턴이에요";
    $("#turnPrompt").textContent = `마지막 글자 '${state.requiredInitial}'${roParticle(state.requiredInitial)} 시작하는 단어를 이어주세요.`;
    $("#factCheck").textContent = "✓ 다른 플레이어의 단어를 확인했어요.";
    $("#factCheck").className = "fact-check success";
    renderPlayers();
    startTimer();
    $("#wordInput").focus();
  }
}

function startTimer() {
  clearInterval(state.timerId);
  state.timer = 20;
  $("#timerValue").textContent = state.timer;
  state.timerId = setInterval(() => {
    state.timer -= 1;
    $("#timerValue").textContent = Math.max(0, state.timer);
    if (state.timer <= 0) {
      clearInterval(state.timerId);
      addMessage("system", "시간이 끝났어요. 이번 턴은 자동으로 넘어갑니다.");
      showToast("시간이 끝나 턴이 넘어갔어요");
      if (state.gameMode === "human") {
        fetch(`/api/matches/${state.matchId}/timeout`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ playerId: state.playerId }) }).then((response) => response.ok ? response.json() : null).then((payload) => {
          if (!payload) return;
          state.eventCursor = payload.cursor;
          state.currentPlayer = "remote";
          $("#turnStatus").textContent = "상대의 턴이에요";
          $("#turnPrompt").textContent = "다른 플레이어의 단어를 기다리는 중...";
          renderPlayers();
        });
      } else {
        state.currentPlayer = "ai";
        setTimeout(aiTurn, 650);
      }
    }
  }, 1000);
}

async function validateWord(word) {
  if (!word) return { ok: false, message: "단어를 입력해 주세요.", kind: "error" };
  if (state.usedWords.has(word)) return { ok: false, message: "이미 나온 단어예요.", kind: "error" };
  if (firstSyllable(word) !== state.requiredInitial) return { ok: false, message: `첫 글자가 '${state.requiredInitial}'인 단어가 필요해요.`, kind: "error" };
  try {
    const response = await fetch(`/api/dictionary/lookup?word=${encodeURIComponent(word)}`);
    const remote = await response.json();
    if (remote.configured && !remote.valid) return { ok: false, message: "공식 국립국어원 사전에서 확인되지 않은 단어예요.", kind: "error" };
    if (remote.configured) return { ok: true, definition: remote.definition || getDefinition(word), message: `공식 사전 확인 완료 · ${remote.definition || getDefinition(word)}`, kind: "success" };
  } catch {
    return { ok: false, message: "사전 검증 서버에 연결되지 않았어요. 잠시 후 다시 시도해 주세요.", kind: "error" };
  }
  if (!dictionary.has(word)) return { ok: false, message: "공식 사전 API 키가 연결되지 않아 아직 확인할 수 없는 단어예요.", kind: "error" };
  if (state.round === 1 && isOneShot(word)) return { ok: false, message: "첫 턴에는 상대가 이을 수 없는 한방단어를 사용할 수 없어요.", kind: "warning" };
  return { ok: true, definition: getDefinition(word), message: `사전 API 준비 중 · ${getDefinition(word)}`, kind: "warning" };
}

async function submitWord(event) {
  event.preventDefault();
  if (state.currentPlayer !== "me") return showToast("상대의 턴을 기다려 주세요");
  const word = normalizeWord($("#wordInput").value);
  const result = await validateWord(word);
  $("#factCheck").textContent = result.message;
  $("#factCheck").className = `fact-check ${result.kind}`;
  if (!result.ok) return;

  if (state.gameMode === "human") {
    const response = await fetch(`/api/matches/${state.matchId}/word`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ playerId: state.playerId, word, note: result.definition || getDefinition(word) }) });
    if (!response.ok) {
      $("#factCheck").textContent = "서버에서 턴 상태가 바뀌었어요. 다른 플레이어의 단어를 확인해 주세요.";
      $("#factCheck").className = "fact-check error";
      return;
    }
    const payload = await response.json();
    state.eventCursor = payload.cursor;
  }

  clearInterval(state.timerId);
  state.usedWords.add(word);
  state.lastWord = word;
  state.requiredInitial = lastSyllable(word);
  addMessage("player", word, `${result.definition || getDefinition(word)} · 다음 글자 ${state.requiredInitial}`);
  $("#wordInput").value = "";
  $("#factCheck").textContent = "✓ 단어가 이어졌어요. 실제 플레이어의 단어를 기다리는 중...";
  $("#factCheck").className = "fact-check success";
  state.currentPlayer = state.gameMode === "human" ? "remote" : "ai";
  $("#turnStatus").textContent = "상대의 턴이에요";
  $("#turnPrompt").textContent = `'${state.lastWord}' 다음 단어를 기다리는 중...`;
  renderPlayers();
  if (state.gameMode === "ai") setTimeout(aiTurn, 800);
}

function lookAhead(word, used, depth = 2) {
  const nextUsed = new Set([...used, word]);
  const replies = getCandidates(lastSyllable(word), nextUsed);
  if (depth <= 0 || !replies.length) return { replies: replies.length, future: 0 };
  const future = Math.max(...replies.map((reply) => lookAhead(reply, nextUsed, depth - 1).replies));
  return { replies: replies.length, future };
}

function selectAIWord() {
  let candidates = getCandidates(state.requiredInitial);
  if (state.round === 1) candidates = candidates.filter((word) => !isOneShot(word));
  if (!candidates.length) return null;
  if (state.difficulty === "easy") return pick(candidates);
  const scored = candidates.map((word) => {
    const forecast = lookAhead(word, state.usedWords, state.difficulty === "hard" ? 3 : 2);
    const deadEndBonus = forecast.replies === 0 ? 80 : 0;
    const pressure = -forecast.replies * (state.difficulty === "hard" ? 18 : 7);
    const futurePressure = -forecast.future * (state.difficulty === "hard" ? 6 : 2);
    const lengthBonus = Math.min(word.length, 4) * (state.difficulty === "hard" ? 1.2 : .4);
    return { word, score: deadEndBonus + pressure + futurePressure + lengthBonus + Math.random() * (state.difficulty === "hard" ? .4 : 4) };
  }).sort((a, b) => b.score - a.score);
  return scored[0].word;
}

function aiTurn() {
  if (!$("#gameView").classList.contains("active-view")) return;
  const word = selectAIWord();
  if (!word) {
    addMessage("system", "상대가 이을 단어를 찾지 못했어요. 당신의 승리입니다!");
    showToast("축하해요. 이번 판에서 승리했어요");
    $("#turnStatus").textContent = "승리했어요";
    return;
  }
  state.usedWords.add(word);
  state.lastWord = word;
  state.requiredInitial = lastSyllable(word);
  state.round += 1;
  state.currentPlayer = "me";
  addMessage("ai", word, `${getDefinition(word)} · 다음 글자 ${state.requiredInitial}`);
  $("#roundNumber").textContent = String(state.round).padStart(2, "0");
  $("#turnStatus").textContent = "당신의 턴이에요";
  $("#turnPrompt").textContent = `마지막 글자 '${state.requiredInitial}'${roParticle(state.requiredInitial)} 시작하는 단어를 이어주세요.`;
  $("#factCheck").textContent = `✓ AI가 후보 ${getCandidates(state.requiredInitial).length}개를 살피고 다음 수까지 계산했어요.`;
  $("#factCheck").className = "fact-check success";
  renderPlayers();
  startTimer();
  $("#wordInput").focus();
}

function initGameControls() {
  $("#wordForm").addEventListener("submit", submitWord);
  $("#clearWordButton").addEventListener("click", () => { $("#wordInput").value = ""; $("#factCheck").textContent = ""; $("#wordInput").focus(); });
  $("#leaveGameButton").addEventListener("click", () => {
    clearInterval(state.timerId);
    clearInterval(state.matchPollId);
    clearInterval(state.eventPollId);
    if (state.matchTicket) fetch("/api/matchmaking/cancel", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ ticket: state.matchTicket }) }).catch(() => {});
    state.matchTicket = null;
    state.matchId = null;
    setView("lobby");
  });
  $("#copyGameCode").addEventListener("click", () => copyText(state.roomCode));
  $("#copyCodeButton").addEventListener("click", () => copyText(state.roomCode));
  $("#inviteButton").addEventListener("click", () => copyText(state.roomCode));
  $("#gameRulesButton").addEventListener("click", rulesModal);
}

$("#modalClose").addEventListener("click", closeModal);
$("#modalBackdrop").addEventListener("click", (event) => { if (event.target === $("#modalBackdrop")) closeModal(); });
setupLobby();
initGameControls();
