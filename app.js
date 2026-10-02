// ==========================================================================
// 끝말잇기 AI - 프론트엔드 컨트롤러 (배틀, AI브리핑 흐름 모드, 단어 사전, 4단계 난이도)
// ==========================================================================

document.addEventListener('DOMContentLoaded', () => {
  // ------------------------------------------------------------------------
  // 1. DOM 요소 캐싱
  // ------------------------------------------------------------------------
  // 글로벌 헤더
  const soundToggleBtn = document.getElementById('soundToggleBtn');
  const soundIcon = document.getElementById('soundIcon');
  const resetGameBtn = document.getElementById('resetGameBtn');
  const appNav = document.getElementById('appNav');
  const navTabs = document.querySelectorAll('.nav-tab');

  // 대시보드 패널
  const panelBattle = document.getElementById('panelBattle');
  const panelAux = document.getElementById('panelAux');
  const auxTabBtns = document.querySelectorAll('.aux-tab-btn');
  const auxBriefing = document.getElementById('auxBriefing');
  const auxDict = document.getElementById('auxDict');

  // 배틀 DOM
  const turnBadge = document.getElementById('turnBadge');
  const turnStatusText = document.getElementById('turnStatusText');
  const comboBadge = document.getElementById('comboBadge');
  const comboText = document.getElementById('comboText');
  const diffBtns = document.querySelectorAll('.diff-btn');
  const targetCharDisplay = document.getElementById('targetCharDisplay');
  const dueumBadge = document.getElementById('dueumBadge');
  const lastWordText = document.getElementById('lastWordText');
  const lastWordMeaning = document.getElementById('lastWordMeaning');
  const turnLog = document.getElementById('turnLog');
  const emptyLogState = document.getElementById('emptyLogState');
  const gameForm = document.getElementById('gameForm');
  const inputPrefixBadge = document.getElementById('inputPrefixBadge');
  const prefixChar = document.getElementById('prefixChar');
  const wordInput = document.getElementById('wordInput');
  const submitBtn = document.getElementById('submitBtn');
  const inputFeedback = document.getElementById('inputFeedback');

  // AI브리핑 DOM
  const flowModeCheckbox = document.getElementById('flowModeCheckbox');
  const flowCountBadge = document.getElementById('flowCountBadge');
  const clearChatBtn = document.getElementById('clearChatBtn');
  const briefingMessages = document.getElementById('briefingMessages');
  const briefingForm = document.getElementById('briefingForm');
  const briefingInput = document.getElementById('briefingInput');
  const briefingSendBtn = document.getElementById('briefingSendBtn');
  const quickBriefingChips = document.querySelectorAll('.briefing-chip');

  // 단어 사전 DOM
  const dictSearchForm = document.getElementById('dictSearchForm');
  const dictSearchInput = document.getElementById('dictSearchInput');
  const dictClearBtn = document.getElementById('dictClearBtn');
  const dictEmptyState = document.getElementById('dictEmptyState');
  const dictContentArea = document.getElementById('dictContentArea');
  const dictChips = document.querySelectorAll('.dict-chip');

  // 토스트
  const toastContainer = document.getElementById('toastContainer');

  // ------------------------------------------------------------------------
  // 2. 상태 변수
  // ------------------------------------------------------------------------
  // 배틀 상태
  let gameHistory = [];
  let currentTargetChar = '';
  let isGameOver = false;
  let turnCount = 0;
  let comboCount = 0;
  let isSubmitting = false;
  let currentDifficulty = 'hell'; // 기본값: 헬 (쉬움, 중간, 어려움, 헬)

  // AI브리핑 상태
  let briefedWords = [];
  let isBriefingLoading = false;

  // ------------------------------------------------------------------------
  // 3. 두음법칙 엔진 (국립국어원 한글 맞춤법 제10항·제11항 정방향 규칙만 적용)
  // ------------------------------------------------------------------------
  function getDueumVariantsClient(char) {
    if (!char || typeof char !== 'string') return [char];
    const code = char.charCodeAt(0) - 0xAC00;
    if (code < 0 || code > 11171) return [char];

    const initial = Math.floor(code / 588);
    const medial = Math.floor((code % 588) / 28);
    const final = code % 28;
    const variants = [char];

    // [한글 맞춤법 제10항] ㄴ 두음법칙: '냐, 녀, 녜, 뇨, 뉴, 니' -> '야, 여, 예, 요, 유, 이' (초성 ㄴ -> ㅇ)
    // * 역방향(ㄴ -> ㄹ: 예: '니' -> '리'('리튬'))은 일체 금지!
    if (initial === 2) {
      if ([2, 3, 6, 7, 12, 17, 20].includes(medial)) {
        variants.push(String.fromCharCode(0xAC00 + (11 * 588) + (medial * 28) + final));
      }
    }
    // [한글 맞춤법 제11항] ㄹ 두음법칙:
    // 1) '랴, 려, 례, 료, 류, 리' -> '야, 여, 예, 요, 유, 이' (초성 ㄹ -> ㅇ)
    // 2) '라, 로, 루, 르, 래, 뢰...' -> '나, 노, 누, 느, 내, 뇌...' (초성 ㄹ -> ㄴ)
    else if (initial === 5) {
      if ([2, 3, 6, 7, 12, 17, 20].includes(medial)) {
        variants.push(String.fromCharCode(0xAC00 + (11 * 588) + (medial * 28) + final));
      } else {
        variants.push(String.fromCharCode(0xAC00 + (2 * 588) + (medial * 28) + final));
      }
    }

    return [...new Set(variants)];
  }

  // ------------------------------------------------------------------------
  // 4. 사운드 및 알림 유틸리티
  // ------------------------------------------------------------------------
  function showToast(message) {
    const toast = document.createElement('div');
    toast.className = 'toast';
    toast.innerHTML = `<span>⚡</span><span>${message}</span>`;
    toastContainer.appendChild(toast);

    setTimeout(() => {
      toast.style.opacity = '0';
      toast.style.transform = 'translateY(10px)';
      toast.style.transition = '0.3s ease';
      setTimeout(() => toast.remove(), 300);
    }, 2200);
  }

  function showFeedback(message, type = 'error') {
    inputFeedback.textContent = message;
    inputFeedback.className = `input-feedback ${type}`;
    inputFeedback.style.display = 'block';
  }

  function clearFeedback() {
    inputFeedback.textContent = '';
    inputFeedback.style.display = 'none';
  }

  soundToggleBtn.addEventListener('click', () => {
    if (window.soundEngine) {
      const isMuted = window.soundEngine.toggleMute();
      soundIcon.textContent = isMuted ? '🔇' : '🔊';
      showToast(isMuted ? '사운드가 꺼졌습니다.' : '사운드가 켜졌습니다.');
      if (!isMuted) window.soundEngine.playCopy();
    }
  });

  // ------------------------------------------------------------------------
  // 5. 탭 전환 (모바일 상단 탭 & PC 보조 탭)
  // ------------------------------------------------------------------------
  function switchTab(tabKey) {
    // 모바일 네비게이션 탭 갱신
    navTabs.forEach(tab => {
      tab.classList.toggle('active', tab.getAttribute('data-tab') === tabKey);
    });

    if (tabKey === 'battle') {
      panelBattle.classList.add('active');
      panelAux.classList.remove('active');
    } else if (tabKey === 'briefing') {
      panelBattle.classList.remove('active');
      panelAux.classList.add('active');
      switchAuxTab('briefing');
    } else if (tabKey === 'dict') {
      panelBattle.classList.remove('active');
      panelAux.classList.add('active');
      switchAuxTab('dict');
    }
  }

  function switchAuxTab(auxKey) {
    auxTabBtns.forEach(btn => {
      btn.classList.toggle('active', btn.getAttribute('data-aux') === auxKey);
    });

    if (auxKey === 'briefing') {
      auxBriefing.classList.add('active');
      auxDict.classList.remove('active');
    } else if (auxKey === 'dict') {
      auxBriefing.classList.remove('active');
      auxDict.classList.add('active');
    }
  }

  navTabs.forEach(tab => {
    tab.addEventListener('click', () => {
      const targetTab = tab.getAttribute('data-tab');
      switchTab(targetTab);
    });
  });

  auxTabBtns.forEach(btn => {
    btn.addEventListener('click', () => {
      const targetAux = btn.getAttribute('data-aux');
      switchAuxTab(targetAux);
    });
  });

  // ------------------------------------------------------------------------
  // 6. 배틀 로직 및 난이도 관리 (쉬움, 중간, 어려움, 헬)
  // ------------------------------------------------------------------------
  diffBtns.forEach(btn => {
    btn.addEventListener('click', () => {
      diffBtns.forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      currentDifficulty = btn.getAttribute('data-diff');
      
      const diffName = btn.textContent;
      showToast(`난이도가 [${diffName}] 모드로 변경되었습니다.`);
      if (window.soundEngine) window.soundEngine.playCopy();
    });
  });

  function updateTargetSection(char, isUserTurn, lastWord = null, lastMeaning = null) {
    currentTargetChar = char || '';

    if (!char) {
      targetCharDisplay.textContent = '시작';
      prefixChar.textContent = '시작';
      dueumBadge.textContent = '원하는 단어로 시작하세요 (2자 이상)';
      lastWordText.textContent = '배틀 준비 완료';
      lastWordMeaning.textContent = '사전에 등재된 표준 표제어만 유효합니다.';
      turnBadge.className = 'turn-badge user';
      turnStatusText.textContent = '플레이어 차례';
      return;
    }

    targetCharDisplay.textContent = char;
    prefixChar.textContent = char;

    const variants = getDueumVariantsClient(char);
    if (variants.length > 1) {
      const altChar = variants.find(v => v !== char);
      dueumBadge.textContent = `두음법칙 적용: '${altChar}' 가능 ('${variants.join("', '")}')`;
    } else {
      dueumBadge.textContent = `'${char}'(으)로 시작하는 단어를 입력하세요`;
    }

    if (lastWord) {
      lastWordText.textContent = `직전 단어: 「${lastWord}」`;
      if (lastMeaning) {
        lastWordMeaning.textContent = lastMeaning;
      }
    }

    if (isGameOver) {
      turnBadge.className = 'turn-badge gameover';
      turnStatusText.textContent = '게임 종료';
    } else if (isUserTurn) {
      turnBadge.className = 'turn-badge user';
      turnStatusText.textContent = '플레이어 차례';
    } else {
      turnBadge.className = 'turn-badge ai';
      turnStatusText.textContent = 'AI 수읽기 중...';
    }
  }

  function appendTurnCard({
    speaker,
    word,
    partOfSpeech,
    meaning,
    source,
    link,
    tierNumber,
    strategyBrief
  }) {
    if (emptyLogState && emptyLogState.parentElement) {
      emptyLogState.remove();
    }

    turnCount++;
    const card = document.createElement('div');
    card.className = `turn-card ${speaker}`;

    const isUser = speaker === 'user';
    const speakerLabel = isUser ? '👤 플레이어' : '🤖 마스터 AI';
    const dictBadge = source || '공인 국어사전';
    const posBadge = partOfSpeech || '명사';
    const dictUrl = link || `https://ko.dict.naver.com/#/search?query=${encodeURIComponent(word)}`;

    let strategyHtml = '';
    if (!isUser && strategyBrief) {
      strategyHtml = `<div class="card-strategy-brief">${strategyBrief}</div>`;
    }

    card.innerHTML = `
      <div class="card-header-row">
        <span class="card-speaker">${speakerLabel}</span>
        <span class="card-turn-number">#${turnCount}</span>
      </div>
      <div class="card-word-row">
        <span class="card-word-text">${word}</span>
        <span class="card-pos-badge">[${posBadge}]</span>
        <span class="card-dict-source">${dictBadge}</span>
      </div>
      <div class="card-meaning">${meaning || '공인 국어사전에 등재된 유효 표준 표제어입니다.'}</div>
      ${strategyHtml}
      <div class="card-footer-row">
        <a href="${dictUrl}" target="_blank" rel="noopener noreferrer" class="dict-link-btn" title="네이버 사전에서 뜻 확인">
          사전 보기 ↗
        </a>
      </div>
    `;

    turnLog.appendChild(card);
    card.scrollIntoView({ behavior: 'smooth', block: 'end' });
  }

  function appendGameOverCard(winner, message) {
    const isUserWinner = winner === 'user';
    const card = document.createElement('div');
    card.className = 'turn-card gameover';

    card.innerHTML = `
      <div style="font-size: 2rem; margin-bottom: 6px;">${isUserWinner ? '🏆' : '💀'}</div>
      <h3 style="font-size: 1.15rem; font-weight: 800; color: ${isUserWinner ? '#34d399' : '#f87171'}; margin-bottom: 4px;">
        ${isUserWinner ? '플레이어 승리!' : '마스터 AI 승리!'}
      </h3>
      <p style="font-size: 0.85rem; color: #cbd5e1; line-height: 1.5; margin-bottom: 12px;">${message}</p>
      <button id="cardResetBtn" class="submit-btn" style="padding: 0 20px; height: 38px;">
        🔄 한 판 더 하기
      </button>
    `;

    turnLog.appendChild(card);
    card.scrollIntoView({ behavior: 'smooth', block: 'end' });

    const cardResetBtn = card.querySelector('#cardResetBtn');
    if (cardResetBtn) {
      cardResetBtn.addEventListener('click', resetGame);
    }
  }

  async function submitWord(rawInput) {
    if (isGameOver) {
      showFeedback('게임이 종료되었습니다. 상단의 [새 게임] 버튼을 눌러주세요.', 'info');
      return;
    }

    if (isSubmitting) return;

    const cleanWord = (rawInput || '').trim().replace(/[^\uAC00-\uD7A3]/g, '');

    // 1차 룰 검증
    if (cleanWord.length < 2) {
      showFeedback('단어는 최소 2글자 이상이어야 합니다.');
      if (window.soundEngine) window.soundEngine.playError();
      wordInput.focus();
      return;
    }

    if (currentTargetChar) {
      const allowedStarts = getDueumVariantsClient(currentTargetChar);
      if (!allowedStarts.includes(cleanWord[0])) {
        const dueumMsg = allowedStarts.length > 1 ? ` (두음법칙 허용: '${allowedStarts.join("', '")}')` : '';
        showFeedback(`'${currentTargetChar}'(으)로 시작해야 합니다.${dueumMsg}`);
        if (window.soundEngine) window.soundEngine.playError();
        wordInput.focus();
        return;
      }
    }

    if (gameHistory.some(item => item.word === cleanWord)) {
      showFeedback(`이미 사용된 단어입니다: 「${cleanWord}」`);
      if (window.soundEngine) window.soundEngine.playError();
      wordInput.focus();
      return;
    }

    clearFeedback();
    isSubmitting = true;
    submitBtn.disabled = true;
    turnBadge.className = 'turn-badge ai';
    turnStatusText.textContent = '사전 탐색 및 검증 중...';

    try {
      const res = await fetch('/api/game/move', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          userWord: cleanWord,
          history: gameHistory,
          difficulty: currentDifficulty
        })
      });

      const data = await res.json();

      if (!data.success) {
        showFeedback(data.message || '공인 국어사전에 등재되지 않은 단어입니다.');
        if (window.soundEngine) window.soundEngine.playError();
        turnBadge.className = 'turn-badge user';
        turnStatusText.textContent = '플레이어 차례';
        wordInput.focus();
        return;
      }

      if (window.soundEngine) window.soundEngine.playCombo(comboCount + 1);

      appendTurnCard({
        speaker: 'user',
        word: data.userWord,
        partOfSpeech: data.userPartOfSpeech,
        meaning: data.userMeaning,
        source: data.userSource,
        link: data.userLink
      });

      gameHistory.push({ word: data.userWord, speaker: 'user' });
      comboCount++;
      comboText.textContent = `${comboCount} COMBO`;

      if (data.gameOver && data.winner === 'user') {
        isGameOver = true;
        updateTargetSection('', true, data.userWord, data.userMeaning);
        appendGameOverCard('user', data.message || '더 이상 이어갈 수 있는 단어가 사전에 없습니다!');
        if (window.soundEngine) window.soundEngine.playVictory();
        wordInput.value = '';
        return;
      }

      if (data.aiWord) {
        setTimeout(() => {
          appendTurnCard({
            speaker: 'ai',
            word: data.aiWord,
            partOfSpeech: data.aiPartOfSpeech,
            meaning: data.aiMeaning,
            source: data.aiSource,
            link: data.aiLink,
            tierNumber: data.tierNumber,
            strategyBrief: data.strategyBrief
          });

          gameHistory.push({ word: data.aiWord, speaker: 'ai' });
          comboCount++;
          comboText.textContent = `${comboCount} COMBO`;

          if (data.gameOver && data.winner === 'ai') {
            isGameOver = true;
            updateTargetSection(data.aiEndChar, false, data.aiWord, data.aiMeaning);
            appendGameOverCard('ai', `AI가 낸 「${data.aiWord}」의 끝글자 '${data.aiEndChar}'(으)로 시작하는 단어가 국어사전에 없어 패배하였습니다.`);
            if (window.soundEngine) window.soundEngine.playError();
            wordInput.value = '';
            return;
          }

          updateTargetSection(data.aiEndChar, true, data.aiWord, data.aiMeaning);
          wordInput.value = '';
          wordInput.focus();
        }, 280);
      }

      wordInput.value = '';
    } catch (err) {
      showFeedback('서버와의 통신에 실패했습니다. 다시 시도해주세요.');
      if (window.soundEngine) window.soundEngine.playError();
      turnBadge.className = 'turn-badge user';
      turnStatusText.textContent = '플레이어 차례';
    } finally {
      isSubmitting = false;
      submitBtn.disabled = false;
    }
  }

  function resetGame() {
    gameHistory = [];
    currentTargetChar = '';
    isGameOver = false;
    turnCount = 0;
    comboCount = 0;
    isSubmitting = false;

    turnLog.innerHTML = `
      <div class="empty-log-state" id="emptyLogState">
        <div class="empty-icon">🎮</div>
        <h3>끝말잇기 배틀을 시작하세요!</h3>
        <p>
          국립국어원 우리말샘(약 118만 개) 및 네이버 어학사전에 정식 등재된<br>
          유효 표제어만 인정되며, <strong>한글 맞춤법 제10항·제11항 정방향 두음법칙</strong>만 적용됩니다.
        </p>
        <div class="rules-chips">
          <span class="rule-chip">✓ 비표준어/억지단어 원천 차단</span>
          <span class="rule-chip">✓ 역방향 두음법칙(니→리 등) 금지</span>
          <span class="rule-chip">✓ AI 환각(없는 단어) 생성 불가</span>
        </div>
      </div>
    `;

    comboText.textContent = '0 COMBO';
    updateTargetSection('', true);
    clearFeedback();
    wordInput.value = '';
    wordInput.disabled = false;
    submitBtn.disabled = false;
    wordInput.focus();

    if (window.soundEngine) window.soundEngine.playCopy();
    showToast('새 배틀이 시작되었습니다!');
  }

  gameForm.addEventListener('submit', (e) => {
    e.preventDefault();
    submitWord(wordInput.value);
  });

  resetGameBtn.addEventListener('click', resetGame);
  wordInput.addEventListener('input', () => {
    if (inputFeedback.style.display !== 'none') clearFeedback();
  });

  // ------------------------------------------------------------------------
  // 7. [AI브리핑] 로직 (흐름 모드 & 4단계 우선순위 브리핑)
  // ------------------------------------------------------------------------
  function updateFlowCount() {
    flowCountBadge.textContent = `(${briefedWords.length})`;
  }

  flowModeCheckbox.addEventListener('change', () => {
    const isFlow = flowModeCheckbox.checked;
    showToast(isFlow ? '흐름 모드가 켜졌습니다. (중복 추천 차단)' : '흐름 모드가 꺼졌습니다.');
    if (window.soundEngine) window.soundEngine.playCopy();
  });

  clearChatBtn.addEventListener('click', () => {
    briefedWords = [];
    updateFlowCount();
    briefingMessages.innerHTML = `
      <div class="briefing-msg ai">
        <div class="msg-avatar">⚡</div>
        <div class="msg-bubble">
          <p>채팅 및 흐름 모드가 초기화되었습니다! 🔄</p>
          <p>원하시는 앞글자(예: <em>'기'</em>, <em>'하'</em>, <em>'마'</em>)나 단어를 입력해주세요.</p>
          <ol class="briefing-priority-list">
            <li>💥 <strong>1순위</strong>: 한방 단어 위주</li>
            <li>⚔️ <strong>2순위</strong>: 되받아칠 단어가 거의 없는 단어</li>
            <li>🛡️ <strong>3순위</strong>: 한방단어에 당하지 않는 단어</li>
            <li>⚠️ <strong>4순위</strong>: 할 수라도 있는 단어</li>
          </ol>
        </div>
      </div>
    `;
    showToast('AI브리핑 채팅이 초기화되었습니다.');
    if (window.soundEngine) window.soundEngine.playCopy();
  });

  async function requestBriefing(queryText) {
    if (isBriefingLoading) return;
    const cleanQuery = queryText.trim();
    if (!cleanQuery) return;

    // 사용자 메시지 표시
    const userMsg = document.createElement('div');
    userMsg.className = 'briefing-msg user';
    userMsg.innerHTML = `<div class="msg-bubble">${cleanQuery}</div>`;
    briefingMessages.appendChild(userMsg);
    userMsg.scrollIntoView({ behavior: 'smooth' });

    // 로딩 메시지
    const loadingMsg = document.createElement('div');
    loadingMsg.className = 'briefing-msg ai';
    loadingMsg.innerHTML = `
      <div class="msg-avatar">⚡</div>
      <div class="msg-bubble">분석 중... 4단계 지능으로 최적의 수를 탐색하고 있습니다.</div>
    `;
    briefingMessages.appendChild(loadingMsg);
    loadingMsg.scrollIntoView({ behavior: 'smooth' });

    isBriefingLoading = true;
    briefingSendBtn.disabled = true;

    try {
      const res = await fetch('/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          message: cleanQuery,
          flowMode: flowModeCheckbox.checked,
          briefedWords: briefedWords
        })
      });

      const data = await res.json();
      loadingMsg.remove();

      const aiMsg = document.createElement('div');
      aiMsg.className = 'briefing-msg ai';
      aiMsg.innerHTML = `
        <div class="msg-avatar">⚡</div>
        <div class="msg-bubble">${data.text || '추천 단어를 찾을 수 없습니다.'}</div>
      `;
      briefingMessages.appendChild(aiMsg);
      aiMsg.scrollIntoView({ behavior: 'smooth' });

      if (data.briefedWord && flowModeCheckbox.checked) {
        if (!briefedWords.includes(data.briefedWord)) {
          briefedWords.push(data.briefedWord);
          updateFlowCount();
        }
      }

      if (window.soundEngine) window.soundEngine.playCopy();
    } catch (err) {
      loadingMsg.remove();
      const errorMsg = document.createElement('div');
      errorMsg.className = 'briefing-msg ai';
      errorMsg.innerHTML = `
        <div class="msg-avatar">⚡</div>
        <div class="msg-bubble">네트워크 오류가 발생했습니다. 잠시 후 다시 시도해주세요.</div>
      `;
      briefingMessages.appendChild(errorMsg);
    } finally {
      isBriefingLoading = false;
      briefingSendBtn.disabled = false;
      briefingInput.value = '';
    }
  }

  briefingForm.addEventListener('submit', (e) => {
    e.preventDefault();
    requestBriefing(briefingInput.value);
  });

  quickBriefingChips.forEach(chip => {
    chip.addEventListener('click', () => {
      const char = chip.getAttribute('data-char');
      if (char === 'auto') {
        const target = currentTargetChar || '시작';
        if (target === '시작') {
          requestBriefing('끝말잇기 첫 턴 추천 단어 알려줘');
        } else {
          requestBriefing(`'${target}' 최적수 브리핑`);
        }
      } else {
        requestBriefing(`'${char}' 최적수 브리핑`);
      }
    });
  });

  // ------------------------------------------------------------------------
  // 8. [단어 사전] 로직 (국어사전 실시간 검색 & 일치 단어 리스트)
  // ------------------------------------------------------------------------
  async function searchDictionary(word) {
    const clean = word.trim().replace(/[^\uAC00-\uD7A3]/g, '');
    if (!clean) return;

    dictSearchInput.value = clean;
    dictClearBtn.style.display = 'block';
    dictEmptyState.style.display = 'none';
    dictContentArea.style.display = 'block';
    dictContentArea.innerHTML = '<div style="text-align:center; padding: 30px; color: var(--text-muted);">국어사전 실시간 탐색 중...</div>';

    try {
      const res = await fetch(`/api/dict/search?word=${encodeURIComponent(clean)}`);
      const data = await res.json();

      let rebuttalHtml = '';
      if (data.rebuttal) {
        const r = data.rebuttal;
        let statusClass = 'safe';
        if (r.totalCount === 0) statusClass = 'killing';
        else if (r.totalCount <= 3) statusClass = 'trap';

        rebuttalHtml = `
          <div class="dict-rebuttal-box">
            <div class="dict-rebuttal-title">⚔️ 끝글자 '${r.endChar}' 반격 분석</div>
            <div class="dict-rebuttal-status ${statusClass}">
              ${r.totalCount === 0 ? '💥 반격 불가 (상대 단어 0개 / 100% 필승 한방)' : (r.totalCount <= 3 ? `⚔️ 외통수 포위 (상대 선택지 ${r.totalCount}개뿐)` : `안전 글자 (상대 선택지 ${r.totalCount}개)`)}
            </div>
            ${r.samples && r.samples.length > 0 ? `<div style="font-size: 0.74rem; color: var(--text-muted); margin-top: 4px;">상대 가능 단어 예시: ${r.samples.slice(0, 5).join(', ')}</div>` : ''}
          </div>
        `;
      }

      let matchedHtml = '';
      if (data.matchedWords && data.matchedWords.length > 0) {
        matchedHtml = `
          <div class="dict-matched-section">
            <h5>📚 연관 공인 단어 (${data.matchedCount}개)</h5>
            <div class="dict-word-chips-grid">
              ${data.matchedWords.slice(0, 36).map(item => `
                <button type="button" class="matched-word-pill" data-word="${item.word}" title="이 단어 검색">
                  ${item.word}
                </button>
              `).join('')}
            </div>
          </div>
        `;
      }

      dictContentArea.innerHTML = `
        <div class="dict-card">
          <div class="dict-card-head">
            <span class="dict-card-word">${data.word || clean}</span>
            <span class="dict-card-source">${data.source || '공인 국어사전'}</span>
          </div>
          <div style="font-size: 0.78rem; color: var(--text-muted); font-weight: 600;">
            품사: [${data.partOfSpeech || '명사'}] · ${data.isVerified ? '✅ 공인 등재 확인' : '❌ 사전 미등재'}
          </div>
          <div class="dict-card-meaning">
            ${(data.meanings && data.meanings.length > 0) ? data.meanings[0] : '사전에 등록된 상세 뜻이 없습니다.'}
          </div>
          ${rebuttalHtml}
          <div style="text-align: right;">
            <a href="${data.link || `https://ko.dict.naver.com/#/search?query=${encodeURIComponent(clean)}`}" target="_blank" rel="noopener noreferrer" class="dict-link-btn">
              네이버 국어사전 원문 보기 ↗
            </a>
          </div>
        </div>
        ${matchedHtml}
      `;

      // 연관 단어 클릭 시 즉시 검색
      dictContentArea.querySelectorAll('.matched-word-pill').forEach(pill => {
        pill.addEventListener('click', () => {
          searchDictionary(pill.getAttribute('data-word'));
        });
      });

      if (window.soundEngine) window.soundEngine.playCopy();
    } catch (err) {
      dictContentArea.innerHTML = '<div style="color: var(--diff-hell); text-align:center; padding: 20px;">사전 조회 중 오류가 발생했습니다.</div>';
    }
  }

  dictSearchForm.addEventListener('submit', (e) => {
    e.preventDefault();
    searchDictionary(dictSearchInput.value);
  });

  dictClearBtn.addEventListener('click', () => {
    dictSearchInput.value = '';
    dictClearBtn.style.display = 'none';
    dictContentArea.style.display = 'none';
    dictEmptyState.style.display = 'block';
    dictSearchInput.focus();
  });

  dictSearchInput.addEventListener('input', () => {
    dictClearBtn.style.display = dictSearchInput.value ? 'block' : 'none';
  });

  dictChips.forEach(chip => {
    chip.addEventListener('click', () => {
      searchDictionary(chip.getAttribute('data-word'));
    });
  });

  // 초기 상태 설정
  updateTargetSection('', true);
  updateFlowCount();
  wordInput.focus();
});
