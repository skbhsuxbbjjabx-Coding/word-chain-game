// 끝말잇기 마스터 AI v2.0 프론트엔드 컨트롤러
document.addEventListener('DOMContentLoaded', () => {
  // DOM 요소 캐싱
  const soundToggleBtn = document.getElementById('soundToggleBtn');
  const soundIcon = document.getElementById('soundIcon');
  const soundText = document.getElementById('soundText');
  const newChatBtn = document.getElementById('newChatBtn');

  // 챗 관련 DOM
  const chatMessages = document.getElementById('chatMessages');
  const chatForm = document.getElementById('chatForm');
  const chatInput = document.getElementById('chatInput');
  const quickChips = document.querySelectorAll('.query-chip');

  // 탭 네비게이션 DOM
  const tabBtns = document.querySelectorAll('.tab-btn');
  const tabContents = document.querySelectorAll('.tab-content');

  // 끄투 배틀 게임 DOM 캐싱
  const targetCharDisplay = document.getElementById('targetCharDisplay');
  const dueumNoticeDisplay = document.getElementById('dueumNoticeDisplay');
  const gameInputForm = document.getElementById('gameInputForm');
  const gameWordInput = document.getElementById('gameWordInput');
  const chainChipsFlow = document.getElementById('chainChipsFlow');
  const rallyCountBadge = document.getElementById('rallyCountBadge');
  const turnIndicator = document.getElementById('turnIndicator');
  const aiDifficultyBadge = document.getElementById('aiDifficultyBadge');
  const difficultyBtns = document.querySelectorAll('.difficulty-btn');
  const resetGameBtn = document.getElementById('resetGameBtn');

  // 끄투 전용 DOM 요소
  const timerProgressCircle = document.getElementById('timerProgressCircle');
  const timerSecondsText = document.getElementById('timerSecondsText');
  const userScoreDisplay = document.getElementById('userScoreDisplay');
  const aiScoreDisplay = document.getElementById('aiScoreDisplay');
  const aiThinkingPulse = document.getElementById('aiThinkingPulse');
  const prefixChar = document.getElementById('prefixChar');
  const latestWordCard = document.getElementById('latestWordCard');
  const comboBanner = document.getElementById('comboBanner');
  const outCountHintBadge = document.getElementById('outCountHintBadge');

  // 사전 분석실 DOM
  const inspectorForm = document.getElementById('inspectorForm');
  const inspectorInput = document.getElementById('inspectorInput');
  const inspectorResultContainer = document.getElementById('inspectorResultContainer');

  // 한방 도감 DOM
  const lexiconGrid = document.getElementById('lexiconGrid');

  // 토스트 DOM
  const toastContainer = document.getElementById('toastContainer');

  // 게임 상태 변수
  let currentDifficulty = 'master';
  let gameHistory = [];
  let currentTargetChar = '';
  let isGameOver = false;
  let userScore = 0;
  let aiScore = 0;
  let comboCount = 0;

  // 끄투 턴 타이머 상태
  const TURN_LIMIT = 10; // 턴당 10초
  let timerRemaining = TURN_LIMIT;
  let timerInterval = null;
  let currentTurn = 'user'; // 'user' or 'ai'

  // 1. 사운드 시스템 제어
  soundToggleBtn.addEventListener('click', () => {
    const isMuted = window.soundEngine.toggleMute();
    if (isMuted) {
      soundIcon.textContent = '🔇';
      soundText.textContent = '사운드 OFF';
      soundToggleBtn.classList.remove('active');
      showToast('사운드가 꺼졌습니다.');
    } else {
      soundIcon.textContent = '🔊';
      soundText.textContent = '사운드 ON';
      soundToggleBtn.classList.add('active');
      window.soundEngine.playCopy();
      showToast('사운드가 켜졌습니다.');
    }
  });

  // 2. 토스트 알림 헬퍼
  function showToast(message, type = 'info') {
    const toast = document.createElement('div');
    toast.className = 'toast';
    let icon = '⚡';
    if (type === 'success') icon = '🎉';
    if (type === 'error') icon = '⚠️';
    if (type === 'copy') icon = '📋';

    toast.innerHTML = `<span>${icon}</span><span>${message}</span>`;
    toastContainer.appendChild(toast);

    setTimeout(() => {
      toast.style.opacity = '0';
      toast.style.transform = 'translateY(10px)';
      toast.style.transition = '0.3s ease';
      setTimeout(() => toast.remove(), 300);
    }, 2500);
  }

  // 3. 클립보드 복사 헬퍼
  window.copyWordToClipboard = function(word) {
    if (!word) return;
    navigator.clipboard.writeText(word).then(() => {
      window.soundEngine.playCopy();
      showToast(`「${word}」 단어가 복사되었습니다!`, 'copy');
    }).catch(() => {
      showToast(`복사에 실패했습니다: ${word}`, 'error');
    });
  };

  // 3-1. 클라이언트 두음법칙 변이 계산기 (표준 및 끄투 상호 교차 규칙)
  function getDueumVariantsClient(char) {
    if (!char || typeof char !== 'string') return [char];
    const code = char.charCodeAt(0) - 0xAC00;
    if (code < 0 || code > 11171) return [char];
    const initial = Math.floor(code / 588);
    const medial = Math.floor((code % 588) / 28);
    const final = code % 28;
    const variants = [char];

    // 1) ㄴ -> ㅇ 또는 ㄹ (예: 냐/녀/뇨/뉴/니 -> 야/여/요/유/이, 늄 -> 윰/륨)
    if (initial === 2) {
      if ([2, 6, 12, 17, 20, 7].includes(medial)) {
        variants.push(String.fromCharCode(0xAC00 + (11 * 588) + (medial * 28) + final));
      }
      const rChar = String.fromCharCode(0xAC00 + (5 * 588) + (medial * 28) + final);
      variants.push(rChar);
    }
    // 2) ㄹ -> ㄴ 또는 ㅇ (예: 륨 -> 늄 / 윰, 랴/려/례/료/류/리 -> 야/여/예/요/유/이)
    else if (initial === 5) {
      const nChar = String.fromCharCode(0xAC00 + (2 * 588) + (medial * 28) + final);
      variants.push(nChar);
      if ([2, 6, 7, 12, 17, 20].includes(medial)) {
        variants.push(String.fromCharCode(0xAC00 + (11 * 588) + (medial * 28) + final));
      }
    }
    // 3) ㅇ -> ㄹ 또는 ㄴ (예: 윰 -> 륨 / 늄, 역 -> 력 / 녁 등 상호 연동)
    else if (initial === 11) {
      if ([2, 6, 7, 12, 17, 20].includes(medial)) {
        const rChar = String.fromCharCode(0xAC00 + (5 * 588) + (medial * 28) + final);
        const nChar = String.fromCharCode(0xAC00 + (2 * 588) + (medial * 28) + final);
        variants.push(rChar);
        variants.push(nChar);
      }
    }
    return [...new Set(variants)];
  }

  // 4. 배틀에 단어 즉시 투입 헬퍼 (AI/사전/도감 100% 상호 연동)
  window.useWordInBattle = function(word) {
    if (!word) return;
    switchTab('battle');

    // 게임이 끝났거나 아직 첫 단어 입력 전인 경우
    if (isGameOver || gameHistory.length === 0) {
      if (isGameOver) {
        resetGame();
      }
      gameWordInput.value = word;
      submitGameWord(word);
      return;
    }

    // 이미 배틀 진행 중인 경우: 현재 글자와 맞으면 즉시 투입, 아니면 입력창에 준비
    const lastWord = gameHistory[gameHistory.length - 1].word;
    const requiredChar = lastWord[lastWord.length - 1];
    const allowedStarts = getDueumVariantsClient(requiredChar);

    if (allowedStarts.includes(word[0])) {
      gameWordInput.value = word;
      submitGameWord(word);
    } else {
      gameWordInput.value = word;
      gameWordInput.focus();
      showToast(`「${word}」 단어를 배틀 입력창에 준비했습니다! (현재 턴 시작 글자: '${currentTargetChar}')`, 'info');
    }
  };

  // 4-1. 네이버 국어사전 52만 분석실 연동 헬퍼
  window.inspectWordInDict = function(word) {
    if (!word) return;
    switchTab('inspector');
    inspectorInput.value = word;
    inspectorForm.dispatchEvent(new Event('submit'));
    showToast(`사전 분석실에서 「${word}」 조회를 시작합니다.`, 'info');
  };

  // 4-2. AI 전략 참모에게 단어 질문 연동 헬퍼
  window.askAiAboutWord = function(word) {
    if (!word) return;
    chatInput.value = `'${word}' 다음 끝말잇기 최선의 전략과 필승 단어 알려줘`;
    chatForm.dispatchEvent(new Event('submit'));
    showToast(`AI 참모에게 「${word}」 전략을 문의했습니다.`, 'info');
  };

  // 5. 탭 전환 (모바일 & 데스크톱 100% 반응형)
  function switchTab(tabName) {
    tabBtns.forEach(btn => {
      if (btn.getAttribute('data-tab') === tabName) btn.classList.add('active');
      else btn.classList.remove('active');
    });

    const chatPanel = document.querySelector('.chat-panel');
    const isMobile = window.innerWidth <= 1024;

    if (isMobile) {
      if (tabName === 'chat') {
        if (chatPanel) chatPanel.classList.add('mobile-active');
        tabContents.forEach(content => content.classList.remove('active'));
      } else {
        if (chatPanel) chatPanel.classList.remove('mobile-active');
        tabContents.forEach(content => {
          if (content.id === `tab-${tabName}`) content.classList.add('active');
          else content.classList.remove('active');
        });
      }
    } else {
      if (chatPanel) chatPanel.classList.remove('mobile-active');
      tabContents.forEach(content => {
        if (content.id === `tab-${tabName}`) content.classList.add('active');
        else content.classList.remove('active');
      });
    }

    if (tabName === 'lexicon') loadKillingLexicon();
  }

  window.addEventListener('resize', () => {
    const isMobile = window.innerWidth <= 1024;
    const chatPanel = document.querySelector('.chat-panel');
    if (!isMobile && chatPanel) {
      chatPanel.classList.remove('mobile-active');
      const activeBtn = document.querySelector('.tab-btn.active');
      if (activeBtn && activeBtn.getAttribute('data-tab') === 'chat') {
        switchTab('battle');
      }
    }
  });

  tabBtns.forEach(btn => {
    btn.addEventListener('click', () => {
      window.soundEngine.playTyping();
      switchTab(btn.getAttribute('data-tab'));
    });
  });

  // 6. AI 어드바이저 챗 로직
  chatForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    const query = chatInput.value.trim();
    if (!query) return;

    window.soundEngine.playTyping();
    appendUserChatMessage(query);
    chatInput.value = '';

    try {
      const loadingBubble = appendAiLoadingMessage();
      const res = await fetch('/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ message: query, history: [] })
      });

      const data = await res.json();
      loadingBubble.remove();

      if (data.text) {
        appendAiChatMessage(data.text, data.analysis);
      }
    } catch (err) {
      appendAiChatMessage('서버와의 통신 중 오류가 발생했습니다. 다시 시도해주세요.');
      window.soundEngine.playError();
    }
  });

  quickChips.forEach(chip => {
    chip.addEventListener('click', () => {
      const q = chip.getAttribute('data-query');
      chatInput.value = q;
      chatForm.dispatchEvent(new Event('submit'));
    });
  });

  function appendUserChatMessage(text) {
    const msgDiv = document.createElement('div');
    msgDiv.className = 'message user';
    msgDiv.innerHTML = `
      <div class="message-sender"><span>플레이어</span></div>
      <div class="message-bubble"><p>${escapeHtml(text)}</p></div>
    `;
    chatMessages.appendChild(msgDiv);
    chatMessages.scrollTop = chatMessages.scrollHeight;
  }

  function appendAiLoadingMessage() {
    const msgDiv = document.createElement('div');
    msgDiv.className = 'message ai';
    msgDiv.innerHTML = `
      <div class="message-sender"><span>⚡ 끝말잇기 마스터 AI</span></div>
      <div class="message-bubble" style="color: var(--neon-gold);">
        <em>52만 네이버 국어사전 전수 스캔 및 상대방 반격 수 싸움 계산 중...</em>
      </div>
    `;
    chatMessages.appendChild(msgDiv);
    chatMessages.scrollTop = chatMessages.scrollHeight;
    return msgDiv;
  }

  // ⭐ 단 하나의 궁극의 최고 단어 카드 (Ultimate Card) 렌더링
  function appendAiChatMessage(text, analysis = null) {
    const msgDiv = document.createElement('div');
    msgDiv.className = 'message ai';

    let cardHtml = '';
    if (analysis && analysis.ultimateWord) {
      const u = analysis.ultimateWord;
      const r = u.rebuttal;

      // 되받아칠 단어 상태별 클래스 및 뱃지
      let boxClass = 'rebuttal-analysis-box';
      let badgeClass = 'rebuttal-count-badge many';
      let badgeText = `되받아칠 단어: ${r.totalCount}개`;

      if (r.totalCount === 0) {
        boxClass += ' impossible';
        badgeClass = 'rebuttal-count-badge zero';
        badgeText = '💥 반격 불가 (0개 / 100% 즉시 승리)';
      } else if (r.totalCount <= 3) {
        boxClass += ' trapped';
        badgeClass = 'rebuttal-count-badge few';
        badgeText = `⚔️ 외통수 포위 (${r.totalCount}개뿐)`;
      }

      // 상대방의 반격 단어 칩들
      let samplesHtml = '';
      if (r.samples && r.samples.length > 0) {
        samplesHtml = `
          <div style="font-size: 11px; color: var(--text-muted); margin-top: 6px;">
            상대방이 낼 수 있는 다음 단어 목록:
          </div>
          <div class="rebuttal-samples-flow">
            ${r.samples.map(w => `<span class="rebuttal-chip" onclick="inspectWordInDict('${w}')" title="클릭 시 사전 분석실에서 확인">${w}</span>`).join('')}
          </div>
        `;
      } else if (r.totalCount === 0) {
        samplesHtml = `
          <div style="font-size: 12px; color: #f87171; font-weight: 700; margin-top: 6px;">
            ✔ 상대방이 사전에 등재된 단어를 단 1개도 이을 수 없어 게임이 즉시 종료됩니다!
          </div>
        `;
      }

      // 2수 앞 연계 공격 시뮬레이션
      let counterHtml = '';
      if (r.counterAnalysis && r.counterAnalysis.length > 0) {
        counterHtml = `
          <div style="font-size: 11px; color: var(--neon-cyan); margin-top: 8px; font-weight: 600;">
            🎯 2수 앞 필승 연계 시뮬레이션:
          </div>
          <div style="font-size: 11px; color: #cbd5e1; margin-top: 2px;">
            ${r.counterAnalysis.map(ca => `
              <div>• 상대가 「<strong style="cursor:pointer; text-decoration:underline;" onclick="inspectWordInDict('${ca.opponentWord}')" title="사전 분석">${ca.opponentWord}</strong>」을 내면 ➔ 나는 「<strong style="cursor:pointer; text-decoration:underline; color:var(--neon-gold);" onclick="useWordInBattle('${ca.myBestCounter}')" title="배틀에 사용">${ca.myBestCounter || '카운터'}</strong>」(으)로 즉시 반격!</div>
            `).join('')}
          </div>
        `;
      }

      // 차선책 대안 후보 칩들
      let altsHtml = '';
      if (analysis.alternatives && analysis.alternatives.length > 0) {
        altsHtml = `
          <div class="alternatives-bar">
            <span>대안 후보:</span>
            ${analysis.alternatives.map(alt => {
              const tierShort = alt.tierName ? alt.tierName.split(':')[0].replace(/[^0-9순위]/g, '') : '';
              return `
                <span class="alt-pill ${alt.tierBadgeClass || ''}" onclick="inspectWordInDict('${alt.word}')" title="클릭 시 사전 분석실로 이동">
                  ${alt.word} <span style="font-size: 10px; opacity: 0.85;">${tierShort ? `[${tierShort}] ` : ''}(${alt.rebuttalSummary})</span>
                </span>
              `;
            }).join('')}
          </div>
        `;
      }

      const tierBadgeClass = u.tierInfo?.tierBadgeClass || 'tier-1';
      const tierName = u.tierInfo?.tierName || '👑 최선·최적·최강·최상의 단어';
      const tierIcon = u.tierInfo?.tierIcon || '👑';

      cardHtml = `
        <div class="ultimate-word-card">
          <div class="ultimate-badge-row">
            <div class="ultimate-title-badge ${tierBadgeClass}">
              <span>${tierIcon}</span>
              <span>${tierName}</span>
            </div>
            <span class="ultimate-pure-tag">✔ 공인 순수 표준어</span>
          </div>

          <div class="ultimate-word-display">
            <span class="ultimate-main-word" onclick="inspectWordInDict('${u.word}')" style="cursor: pointer;" title="클릭 시 사전 분석실로 이동">${u.word}</span>
            <span class="ultimate-part-tag">[${u.partOfSpeech || '명사'}]</span>
          </div>

          <!-- 상대방 되받아칠 단어 정밀 분석 패널 -->
          <div class="${boxClass}">
            <div class="rebuttal-header">
              <span class="rebuttal-title">
                <span>🎯</span>
                <span>상대방 되받아칠 단어 정밀 분석</span>
              </span>
              <span class="${badgeClass}">${badgeText}</span>
            </div>
            <div style="font-size: 12px; color: #e2e8f0; line-height: 1.4;">
              내가 <strong>「${u.word}」</strong>을(를) 내면, 상대는 끝글자 <strong>'${u.endChar}'</strong>${r.isDueumApplied ? `(두음: ${r.variants.join(', ')})` : ''}(으)로 이어야 합니다.
            </div>
            ${samplesHtml}
            ${counterHtml}
          </div>

          <!-- 4대 선정 근거 그리드 -->
          <div class="four-pillars-grid">
            <div class="pillar-item">
              <div class="pillar-label strongest">💥 최강 (위력)</div>
              <div class="pillar-text">${u.strongestReason}</div>
            </div>
            <div class="pillar-item">
              <div class="pillar-label optimal">⚔️ 최적 (수 싸움)</div>
              <div class="pillar-text">${u.optimalReason}</div>
            </div>
            <div class="pillar-item">
              <div class="pillar-label best">🛡️ 최선 (신뢰성)</div>
              <div class="pillar-text">${u.bestReason}</div>
            </div>
            <div class="pillar-item">
              <div class="pillar-label supreme">🌟 최상 (완성도)</div>
              <div class="pillar-text">${u.supremeReason}</div>
            </div>
          </div>

          <!-- 네이버 국어사전 실시간 공식 뜻풀이 -->
          <div class="naver-meaning-section">
            <div class="naver-label" style="display: flex; align-items: center; justify-content: space-between;">
              <div><span>📚</span> 네이버 국어사전 공식 뜻풀이</div>
              ${u.naverLink ? `<a href="${u.naverLink}" target="_blank" rel="noopener noreferrer" style="font-size: 11px; color: var(--neon-cyan); text-decoration: underline; font-weight: 500;">네이버 사전 바로가기 ↗</a>` : ''}
            </div>
            <div style="margin-top: 4px;">${escapeHtml(u.naverMeaning)}</div>
          </div>

          <!-- 액션 버튼 -->
          <div class="ultimate-card-actions">
            <button class="ultimate-action-btn copy" onclick="copyWordToClipboard('${u.word}')">
              📋 복사
            </button>
            <button class="ultimate-action-btn play" onclick="useWordInBattle('${u.word}')">
              ⚔️ 배틀에 즉시 사용
            </button>
            <button class="ultimate-action-btn inspect" onclick="inspectWordInDict('${u.word}')" style="background: rgba(30, 41, 59, 0.9); border: 1px solid var(--neon-cyan); color: var(--neon-cyan);">
              🔍 사전 정밀 분석
            </button>
          </div>

          ${altsHtml}
        </div>
      `;
    }

    const formattedText = text.replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>')
                              .replace(/\*(.*?)\*/g, '<em>$1</em>')
                              .replace(/\n\n/g, '</p><p>')
                              .replace(/\n/g, '<br>');

    msgDiv.innerHTML = `
      <div class="message-sender"><span>⚡ 끝말잇기 마스터 AI</span></div>
      <div class="message-bubble">
        <p>${formattedText}</p>
        ${cardHtml}
      </div>
    `;

    chatMessages.appendChild(msgDiv);
    chatMessages.scrollTop = chatMessages.scrollHeight;

    if (analysis && analysis.ultimateWord && analysis.ultimateWord.outCount === 0) {
      window.soundEngine.playKilling();
    } else {
      window.soundEngine.playTyping();
    }
  }

  newChatBtn.addEventListener('click', () => {
    chatMessages.innerHTML = `
      <div class="message ai">
        <div class="message-sender"><span>⚡ 끝말잇기 마스터 AI</span></div>
        <div class="message-bubble">
          <p>채팅이 초기화되었습니다. 궁금한 앞글자(예: <em>'기'</em>, <em>'마'</em>)나 단어를 다시 입력해보세요!</p>
        </div>
      </div>
    `;
    window.soundEngine.playCopy();
    showToast('새 대화가 시작되었습니다.');
  });

  // ==========================================================================
  // 🎮 7. 끄투코리아 스타일 AI 끝말잇기 배틀 (KKuTu Game Loop)
  // ==========================================================================
  
  // 끄투 실시간 원형 턴 타이머 루프
  function startTurnTimer(turnOwner = 'user') {
    stopTurnTimer();
    currentTurn = turnOwner;
    timerRemaining = TURN_LIMIT;
    updateTimerVisuals();

    if (turnOwner === 'user') {
      turnIndicator.className = 'kkutu-turn-banner user-turn';
      turnIndicator.innerHTML = '<span>당신의 턴!</span>';
      gameWordInput.disabled = false;
      gameWordInput.focus();
    } else {
      turnIndicator.className = 'kkutu-turn-banner ai-turn';
      turnIndicator.innerHTML = '<span>AI 생각 중...</span>';
      gameWordInput.disabled = true;
    }

    let lastSec = Math.ceil(timerRemaining);

    timerInterval = setInterval(() => {
      if (isGameOver) {
        stopTurnTimer();
        return;
      }

      timerRemaining = Math.max(0, timerRemaining - 0.1);
      updateTimerVisuals();

      const currentSec = Math.ceil(timerRemaining);
      if (currentSec !== lastSec) {
        lastSec = currentSec;
        if (timerRemaining <= 3.1 && timerRemaining > 0) {
          window.soundEngine.playTick(true);
        } else if (timerRemaining > 0) {
          window.soundEngine.playTick(false);
        }
      }

      if (timerRemaining <= 0.05) {
        stopTurnTimer();
        handleTimeout(currentTurn);
      }
    }, 100);
  }

  function stopTurnTimer() {
    if (timerInterval) {
      clearInterval(timerInterval);
      timerInterval = null;
    }
    timerProgressCircle.classList.remove('urgent');
    timerSecondsText.classList.remove('urgent');
  }

  function updateTimerVisuals() {
    const circumference = 264; // 2 * PI * 42
    const progress = Math.max(0, Math.min(1, timerRemaining / TURN_LIMIT));
    const offset = circumference * (1 - progress);
    timerProgressCircle.style.strokeDashoffset = offset;

    const displaySec = Math.ceil(timerRemaining);
    timerSecondsText.textContent = displaySec;

    if (timerRemaining <= 3.2) {
      timerProgressCircle.classList.add('urgent');
      timerSecondsText.classList.add('urgent');
    } else {
      timerProgressCircle.classList.remove('urgent');
      timerSecondsText.classList.remove('urgent');
    }
  }

  function handleTimeout(turnOwner) {
    if (isGameOver) return;
    isGameOver = true;
    window.soundEngine.playTimeout();

    if (turnOwner === 'user') {
      turnIndicator.className = 'kkutu-turn-banner ai-turn';
      turnIndicator.innerHTML = '<span>⏰ TIME OVER!</span>';
      targetCharDisplay.textContent = '💀 패배';
      dueumNoticeDisplay.textContent = '10초 제한시간이 초과되어 패배하였습니다!';
      showToast('⏰ 턴 제한시간 10초가 초과되었습니다! 패배!', 'error');
    } else {
      turnIndicator.className = 'kkutu-turn-banner user-turn';
      turnIndicator.innerHTML = '<span>🏆 승리!</span>';
      targetCharDisplay.textContent = '🏆 승리';
      dueumNoticeDisplay.textContent = 'AI가 제한시간 내에 응수하지 못했습니다!';
      showToast('🎉 AI의 타임오버로 승리하였습니다!', 'success');
      window.soundEngine.playVictory();
    }
    gameWordInput.disabled = true;
  }

  // 난이도 변경
  difficultyBtns.forEach(btn => {
    btn.addEventListener('click', () => {
      difficultyBtns.forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      currentDifficulty = btn.getAttribute('data-diff');
      
      const badgeTexts = {
        'safe': '트레이닝',
        'master': '마스터',
        'alpha': '알파고'
      };
      aiDifficultyBadge.textContent = badgeTexts[currentDifficulty] || '마스터';
      window.soundEngine.playCopy();
      showToast(`AI 난이도가 [${badgeTexts[currentDifficulty]}]로 설정되었습니다.`);
    });
  });

  resetGameBtn.addEventListener('click', () => {
    resetGame();
  });

  function resetGame() {
    stopTurnTimer();
    gameHistory = [];
    currentTargetChar = '';
    isGameOver = false;
    userScore = 0;
    aiScore = 0;
    comboCount = 0;

    userScoreDisplay.textContent = '0';
    aiScoreDisplay.textContent = '0';
    rallyCountBadge.textContent = '0 COMBO';
    comboBanner.style.transform = 'scale(1)';

    targetCharDisplay.textContent = '시작';
    prefixChar.textContent = '시작';
    dueumNoticeDisplay.textContent = '원하는 단어로 시작하세요 (2자 이상)';
    chainChipsFlow.innerHTML = '<span class="chain-empty-label">아직 시작되지 않았습니다.</span>';
    
    latestWordCard.className = 'latest-word-card empty';
    latestWordCard.innerHTML = '<div class="card-empty-text">첫 단어를 입력하여 끝말잇기 배틀을 시작하세요!</div>';
    
    outCountHintBadge.className = 'count-badge safe';
    outCountHintBadge.textContent = '🟢 자유 시작 턴';

    aiThinkingPulse.style.display = 'none';
    gameWordInput.value = '';
    gameWordInput.disabled = false;
    gameWordInput.focus();

    window.soundEngine.playCopy();
    showToast('끄투 배틀이 새로 리셋되었습니다.');
    startTurnTimer('user');
  }

  // 단어 입력 제출
  gameInputForm.addEventListener('submit', (e) => {
    e.preventDefault();
    if (isGameOver) {
      showToast('게임이 종료되었습니다. 새로고침 버튼을 눌러주세요.', 'error');
      return;
    }
    const word = gameWordInput.value.trim();
    if (!word) return;
    submitGameWord(word);
  });

  async function submitGameWord(word) {
    if (isGameOver) return;
    stopTurnTimer();
    window.soundEngine.playTyping();

    // 임시 AI 대기 UI 전환
    aiThinkingPulse.style.display = 'block';
    turnIndicator.className = 'kkutu-turn-banner ai-turn';
    turnIndicator.innerHTML = '<span>사전 검증 중...</span>';
    gameWordInput.disabled = true;

    try {
      const res = await fetch('/api/game/move', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          userWord: word,
          history: gameHistory,
          difficulty: currentDifficulty
        })
      });

      const data = await res.json();

      if (!data.success) {
        aiThinkingPulse.style.display = 'none';
        window.soundEngine.playError();
        showToast(data.message, 'error');
        startTurnTimer('user');
        return;
      }

      gameWordInput.value = '';
      if (gameHistory.length === 0) chainChipsFlow.innerHTML = '';

      // 1. 유저 단어 성공 반영
      comboCount++;
      const userGain = word.length * 60 + (comboCount * 30);
      userScore += userGain;
      userScoreDisplay.textContent = userScore;

      // 콤보 애니메이션
      rallyCountBadge.textContent = `${comboCount} COMBO`;
      comboBanner.style.transform = 'scale(1.25)';
      setTimeout(() => { comboBanner.style.transform = 'scale(1)'; }, 250);
      window.soundEngine.playCombo(comboCount);

      // 끄투 단어 카드 팝업
      updateLatestWordCard(data.userWord, 'user', data.userPartOfSpeech || '명사', data.userMeaning, userGain);
      appendWordChip(data.userWord, 'user', data.userPartOfSpeech || '명사');
      gameHistory.push({ word: data.userWord, sender: 'user' });

      // 유저 승리 판정
      if (data.gameOver && data.winner === 'user') {
        isGameOver = true;
        aiThinkingPulse.style.display = 'none';
        window.soundEngine.playVictory();
        targetCharDisplay.textContent = '🏆 승리!';
        dueumNoticeDisplay.textContent = data.message;
        turnIndicator.className = 'kkutu-turn-banner user-turn';
        turnIndicator.innerHTML = '<span>🎉 플레이어 최종 승리!</span>';
        showToast(data.message, 'success');
        return;
      }

      // AI 턴 타이머 시작 (AI 생각 연출)
      startTurnTimer('ai');

      setTimeout(() => {
        if (isGameOver) return;
        aiThinkingPulse.style.display = 'none';

        // 2. AI 단어 반영
        const aiGain = data.aiWord.length * 60 + (comboCount * 25);
        aiScore += aiGain;
        aiScoreDisplay.textContent = aiScore;

        updateLatestWordCard(data.aiWord, 'ai', data.aiPartOfSpeech || '명사', data.aiMeaning, aiGain);
        appendWordChip(data.aiWord, 'ai', data.aiPartOfSpeech || '명사');
        gameHistory.push({ word: data.aiWord, sender: 'ai' });

        currentTargetChar = data.aiEndChar;
        targetCharDisplay.textContent = currentTargetChar;
        prefixChar.textContent = currentTargetChar;

        fetchDueumNotice(currentTargetChar);
        updateOutCountHint(currentTargetChar);

        // AI 승리 판정 (치명타 한방)
        if (data.gameOver && data.winner === 'ai') {
          isGameOver = true;
          stopTurnTimer();
          window.soundEngine.playKilling();
          turnIndicator.className = 'kkutu-turn-banner ai-turn';
          turnIndicator.innerHTML = '<span>💀 AI 필승 한방!</span>';
          dueumNoticeDisplay.innerHTML = `<strong style="color: var(--neon-rose);">${data.strategyBrief}</strong><br>「${data.aiWord}」의 끝글자 '${currentTargetChar}'(으)로 시작하는 단어가 국어사전에 없습니다.`;
          showToast(`💀 AI가 한방 단어 「${data.aiWord}」을(를) 냈습니다! 패배하였습니다.`, 'error');
        } else {
          window.soundEngine.playTrap();
          showToast(`AI 응수: 「${data.aiWord}」 (${data.strategyBrief})`);
          startTurnTimer('user');
        }
      }, 500);

    } catch (err) {
      aiThinkingPulse.style.display = 'none';
      window.soundEngine.playError();
      showToast('게임 서버 응답 오류가 발생했습니다.', 'error');
      startTurnTimer('user');
    }
  }

  // 끄투 시그니처 단어 카드 팝업 업데이트 (사전 및 AI 100% 직결 연결)
  function updateLatestWordCard(word, sender, pos, meaning, pts) {
    latestWordCard.className = `latest-word-card ${sender}-move`;
    const senderText = sender === 'user' ? '플레이어' : '마스터 AI';
    const displayMeaning = meaning || '네이버 국어사전 공인 어휘';

    latestWordCard.setAttribute('title', `클릭 시 「${word}」 네이버 사전 정밀 분석실로 즉시 이동합니다`);
    latestWordCard.style.cursor = 'pointer';

    latestWordCard.innerHTML = `
      <div style="flex: 1; min-width: 0;">
        <div class="card-word-title-row">
          <span class="card-sender-pill ${sender}">${senderText}</span>
          <span class="card-main-word">${escapeHtml(word)}</span>
          <span class="card-pos-pill">${escapeHtml(pos)}</span>
          <span class="card-link-hint" style="font-size: 11px; color: var(--neon-cyan); margin-left: 8px; font-weight: 500;">🔍 클릭 시 사전 정밀 분석</span>
        </div>
        <div class="card-word-meaning" title="${escapeHtml(displayMeaning)}">
          ${escapeHtml(displayMeaning)}
        </div>
        <div class="card-inline-actions" style="margin-top: 8px; display: flex; gap: 8px; flex-wrap: wrap;">
          <button class="card-mini-btn" onclick="event.stopPropagation(); inspectWordInDict('${escapeHtml(word)}')">
            🔍 네이버 사전 분석
          </button>
          <button class="card-mini-btn" onclick="event.stopPropagation(); askAiAboutWord('${escapeHtml(word)}')">
            💬 AI 참모에게 전략 묻기
          </button>
          <button class="card-mini-btn" onclick="event.stopPropagation(); copyWordToClipboard('${escapeHtml(word)}')">
            📋 복사
          </button>
        </div>
      </div>
      <div class="card-pts-badge">+${pts} PTS</div>
    `;

    latestWordCard.onclick = () => {
      inspectWordInDict(word);
    };
  }

  function appendWordChip(word, sender, part = '명사') {
    const chip = document.createElement('div');
    chip.className = `word-chip ${sender}`;
    chip.setAttribute('title', `클릭 시 「${word}」 사전 분석실로 이동`);
    const senderIcon = sender === 'user' ? '👤' : '🤖';
    chip.innerHTML = `
      <span>${senderIcon} ${escapeHtml(word)}</span>
      <span class="word-chip-tag">${escapeHtml(part)}</span>
    `;
    chip.onclick = () => {
      inspectWordInDict(word);
    };
    chainChipsFlow.appendChild(chip);
    chainChipsFlow.scrollLeft = chainChipsFlow.scrollWidth;
  }

  async function fetchDueumNotice(char) {
    try {
      const res = await fetch(`/api/recommend?query=${encodeURIComponent(char)}`);
      const data = await res.json();
      if (data.variants && data.variants.length > 1) {
        dueumNoticeDisplay.textContent = `두음법칙 가능: '${data.variants.join("', '")}'`;
      } else {
        dueumNoticeDisplay.textContent = `'${char}'(으)로 시작하는 단어를 입력하세요.`;
      }
    } catch {
      dueumNoticeDisplay.textContent = `'${char}'(으)로 시작하는 단어를 입력하세요.`;
    }
  }

  async function updateOutCountHint(char) {
    try {
      const res = await fetch(`/api/recommend?query=${encodeURIComponent(char)}`);
      const data = await res.json();
      const count = data.candidateCount || 0;
      if (count === 0) {
        outCountHintBadge.className = 'count-badge danger';
        outCountHintBadge.textContent = '💀 한방 글자 (0개 남음)';
      } else if (count <= 3) {
        outCountHintBadge.className = 'count-badge warning';
        outCountHintBadge.textContent = `⚠️ 위험! 남은 단어: ${count}개`;
      } else {
        outCountHintBadge.className = 'count-badge safe';
        outCountHintBadge.textContent = `🟢 이어갈 수 있는 단어: ${count.toLocaleString()}개`;
      }
    } catch {
      outCountHintBadge.className = 'count-badge safe';
      outCountHintBadge.textContent = `🟢 단어 수: 탐색 완료`;
    }
  }

  // ==========================================================================
  // 📚 8. 네이버 정통 국어사전 52만 전수 분석실 & 실시간 자동완성 컨트롤러
  // ==========================================================================
  const inspectorClearBtn = document.getElementById('inspectorClearBtn');
  const dictAutocompleteDropdown = document.getElementById('dictAutocompleteDropdown');
  const autocompleteList = document.getElementById('autocompleteList');
  const quickDictChips = document.querySelectorAll('.quick-dict-chip');

  let autocompleteTimer = null;
  let activeAcIndex = -1;
  let currentAcItems = [];

  // 검색창 타이핑 시 실시간 국어사전 자동완성 드롭다운
  inspectorInput.addEventListener('input', () => {
    const val = inspectorInput.value.trim();
    if (val.length > 0) {
      if (inspectorClearBtn) inspectorClearBtn.style.display = 'flex';
    } else {
      if (inspectorClearBtn) inspectorClearBtn.style.display = 'none';
      closeAutocomplete();
      return;
    }

    clearTimeout(autocompleteTimer);
    autocompleteTimer = setTimeout(async () => {
      try {
        const res = await fetch(`/api/dict/search?word=${encodeURIComponent(val)}`);
        const data = await res.json();
        const matches = (data.matchedWords || []).slice(0, 8);
        renderAutocompleteList(matches, val);
      } catch (err) {
        // 자동완성 오류 무시
      }
    }, 120);
  });

  // 검색창 키보드 탐색 (ArrowDown, ArrowUp, Enter, Escape)
  inspectorInput.addEventListener('keydown', (e) => {
    if (!dictAutocompleteDropdown || dictAutocompleteDropdown.style.display === 'none') return;

    const items = autocompleteList.querySelectorAll('.ac-item');
    if (items.length === 0) return;

    if (e.key === 'ArrowDown') {
      e.preventDefault();
      activeAcIndex = (activeAcIndex + 1) % items.length;
      updateAcSelection(items);
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      activeAcIndex = (activeAcIndex - 1 + items.length) % items.length;
      updateAcSelection(items);
    } else if (e.key === 'Enter' && activeAcIndex >= 0) {
      e.preventDefault();
      const chosenWord = currentAcItems[activeAcIndex]?.word;
      if (chosenWord) {
        selectAutocompleteWord(chosenWord);
      }
    } else if (e.key === 'Escape') {
      closeAutocomplete();
    }
  });

  function updateAcSelection(items) {
    items.forEach((item, idx) => {
      if (idx === activeAcIndex) {
        item.classList.add('active');
        item.scrollIntoView({ block: 'nearest' });
      } else {
        item.classList.remove('active');
      }
    });
  }

  function renderAutocompleteList(matches, query) {
    currentAcItems = matches;
    activeAcIndex = -1;

    if (!matches || matches.length === 0) {
      closeAutocomplete();
      return;
    }

    autocompleteList.innerHTML = matches.map((m, idx) => {
      const isKilling = m.isKilling;
      const powerClass = isKilling ? 'killing' : (m.outCount <= 3 ? 'trapped' : 'safe');
      const powerText = isKilling ? '💥 한방' : (m.outCount <= 3 ? `⚔️ 외통수` : `안전`);

      return `
        <div class="ac-item" data-index="${idx}" onclick="selectAutocompleteWord('${escapeHtml(m.word)}')">
          <div class="ac-item-left">
            <span class="search-glass-icon" style="font-size: 14px; margin: 0;">📖</span>
            <span class="ac-word">${highlightMatchedChars(m.word, query)}</span>
            <span class="ac-pos">${escapeHtml(m.part || '명사')}</span>
          </div>
          <div class="ac-item-right">
            <span class="match-badge tier-${m.matchTier}">${escapeHtml(m.matchBadge || '일치')}</span>
            <span class="power-badge ${powerClass}">${powerText}</span>
          </div>
        </div>
      `;
    }).join('');

    dictAutocompleteDropdown.style.display = 'block';
  }

  window.selectAutocompleteWord = function(word) {
    inspectorInput.value = word;
    closeAutocomplete();
    inspectorForm.dispatchEvent(new Event('submit'));
  };

  function closeAutocomplete() {
    if (dictAutocompleteDropdown) {
      dictAutocompleteDropdown.style.display = 'none';
    }
    activeAcIndex = -1;
  }

  // 바깥 클릭 시 자동완성 닫기
  document.addEventListener('click', (e) => {
    if (dictAutocompleteDropdown && !dictAutocompleteDropdown.contains(e.target) && e.target !== inspectorInput) {
      closeAutocomplete();
    }
  });

  // 검색창 지우기 버튼
  if (inspectorClearBtn) {
    inspectorClearBtn.addEventListener('click', () => {
      inspectorInput.value = '';
      inspectorClearBtn.style.display = 'none';
      closeAutocomplete();
      inspectorInput.focus();
    });
  }

  // 인기 표제어 퀵 칩 클릭
  quickDictChips.forEach(chip => {
    chip.addEventListener('click', () => {
      const word = chip.getAttribute('data-word');
      if (word) {
        selectAutocompleteWord(word);
      }
    });
  });

  // 사전 검색 폼 제출
  inspectorForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    closeAutocomplete();

    const query = inspectorInput.value.trim();
    if (!query) return;

    window.soundEngine.playTyping();
    inspectorResultContainer.style.display = 'block';
    inspectorResultContainer.innerHTML = `
      <div style="text-align: center; padding: 50px 20px; color: #10B981;">
        <div style="font-size: 28px; margin-bottom: 12px; animation: spin 1s infinite linear;">📚</div>
        <div style="font-size: 16px; font-weight: 800;">네이버 국어사전 52만 전수 데이터베이스 공식 조회 중...</div>
        <div style="font-size: 13px; color: var(--text-muted); margin-top: 6px;">표준 표제어, 품사, 사전 뜻풀이 및 끝말잇기 실전 전술을 계산하고 있습니다.</div>
      </div>
    `;

    try {
      const dictRes = await fetch(`/api/dict/search?word=${encodeURIComponent(query)}`);
      const dictData = await dictRes.json();

      const lastChar = query[query.length - 1];
      const recoRes = await fetch(`/api/recommend?query=${encodeURIComponent(lastChar)}`);
      const recoData = await recoRes.json();

      renderInspectorResult(dictData, recoData, query);
    } catch (err) {
      window.soundEngine.playError();
      inspectorResultContainer.innerHTML = `
        <div style="color: var(--neon-rose); padding: 30px; text-align: center; background: rgba(244, 63, 94, 0.1); border-radius: var(--radius-md); border: 1px solid var(--neon-rose);">
          ❌ 사전 정보를 불러오는 데 실패했습니다. 다시 시도해주세요.
        </div>
      `;
    }
  });

  // ⭐ 검색어와 겹치는 글자 하이라이트 헬퍼
  function highlightMatchedChars(word, query) {
    if (!word || !query) return escapeHtml(word || '');
    const queryChars = new Set(query.replace(/[^가-힣]/g, '').split(''));
    let html = '';
    for (const ch of word) {
      if (queryChars.has(ch)) {
        html += `<span class="matched-char">${escapeHtml(ch)}</span>`;
      } else {
        html += escapeHtml(ch);
      }
    }
    return html;
  }

  // ⭐ 일치도 필터링 전역 헬퍼
  window.filterMatchedWords = function(filterType, btnElement) {
    const container = document.getElementById('dictEntriesTable');
    if (!container) return;

    const allBtns = document.querySelectorAll('.matched-filter-btn');
    allBtns.forEach(b => b.classList.remove('active'));
    if (btnElement) btnElement.classList.add('active');

    const items = container.querySelectorAll('.dict-entry-row');
    items.forEach(item => {
      const tier = parseInt(item.getAttribute('data-tier') || '0', 10);
      const isKilling = item.getAttribute('data-killing') === 'true';

      let show = true;
      if (filterType === 'prefix') {
        show = (tier <= 2);
      } else if (filterType === 'contains') {
        show = (tier === 3 || tier === 4);
      } else if (filterType === 'char') {
        show = (tier === 5);
      } else if (filterType === 'killing') {
        show = isKilling;
      }
      item.style.display = show ? 'flex' : 'none';
    });
  };

  // ⭐ 네이버 정통 국어사전식 일치 어휘 목록 HTML 빌더
  function buildMatchedWordsSectionHtml(matchedWords, query) {
    if (!matchedWords || matchedWords.length === 0) {
      return '';
    }

    const exactPrefixCount = matchedWords.filter(w => w.matchTier <= 2).length;
    const containsCount = matchedWords.filter(w => w.matchTier === 3 || w.matchTier === 4).length;
    const charMatchCount = matchedWords.filter(w => w.matchTier === 5).length;
    const killingCount = matchedWords.filter(w => w.isKilling).length;

    return `
      <div class="dict-entries-list-section">
        <div class="dict-entries-header">
          <div class="dict-entries-title">
            <span>📖</span>
            <span>국어사전 연관 및 일치 표제어 목록</span>
            <span class="matched-count-pill">${matchedWords.length}개</span>
          </div>
          <span style="font-size: 13px; color: var(--text-muted);">
            가장 일치하는 단어부터 한 글자라도 일치하는 공인 단어까지 정확도 순 정렬
          </span>
        </div>

        <!-- 필터 탭 -->
        <div class="matched-filter-tabs">
          <button class="matched-filter-btn active" data-filter="all" onclick="filterMatchedWords('all', this)">
            전체 (${matchedWords.length})
          </button>
          ${exactPrefixCount > 0 ? `
            <button class="matched-filter-btn" data-filter="prefix" onclick="filterMatchedWords('prefix', this)">
              📌 완전/시작 일치 (${exactPrefixCount})
            </button>
          ` : ''}
          ${containsCount > 0 ? `
            <button class="matched-filter-btn" data-filter="contains" onclick="filterMatchedWords('contains', this)">
              🔍 포함/끝 일치 (${containsCount})
            </button>
          ` : ''}
          ${charMatchCount > 0 ? `
            <button class="matched-filter-btn" data-filter="char" onclick="filterMatchedWords('char', this)">
              💡 글자 일치 (${charMatchCount})
            </button>
          ` : ''}
          ${killingCount > 0 ? `
            <button class="matched-filter-btn" data-filter="killing" onclick="filterMatchedWords('killing', this)">
              💥 한방 단어 (${killingCount})
            </button>
          ` : ''}
        </div>

        <!-- 사전식 행 리스트 -->
        <div class="dict-entries-table" id="dictEntriesTable">
          ${matchedWords.map((item, idx) => {
            const isExact = item.matchTier === 1;
            const isKilling = item.isKilling;
            const powerClass = isKilling ? 'killing' : (item.outCount <= 3 ? 'trapped' : 'safe');
            const powerText = isKilling ? '💥 한방' : (item.outCount <= 3 ? `⚔️ 외통수 (${item.outCount}개)` : `안전 (${item.outCount}개)`);
            const tierBadgeClass = `tier-${item.matchTier}`;

            return `
              <div class="dict-entry-row ${isExact ? 'is-exact' : ''}" 
                   data-tier="${item.matchTier}" 
                   data-killing="${isKilling ? 'true' : 'false'}"
                   data-match-type="${item.matchType}">
                <div class="dict-row-main">
                  <div class="dict-row-title-line">
                    <span style="font-size: 13px; font-weight: 800; color: #10B981;">${idx + 1}.</span>
                    <span class="dict-row-word">${highlightMatchedChars(item.word, query)}</span>
                    <span class="dict-pos-pill" style="font-size: 11px; padding: 1px 6px;">「${escapeHtml(item.part || '명사')}」</span>
                    <span class="match-badge ${tierBadgeClass}">${escapeHtml(item.matchBadge || '일치')}</span>
                    <span class="power-badge ${powerClass}">${powerText}</span>
                  </div>
                  <div class="dict-row-meaning">
                    끝글자 '${escapeHtml(item.endChar)}' ➔ 상대 반격 가능 어휘: ${item.outCount.toLocaleString()}개 (${escapeHtml(item.statusText)})
                  </div>
                </div>

                <div class="dict-row-actions">
                  <button class="matched-act-btn primary" onclick="selectAutocompleteWord('${escapeHtml(item.word)}')" title="사전 정밀 분석">
                    🔍 상세
                  </button>
                  <button class="matched-act-btn" onclick="useWordInBattle('${escapeHtml(item.word)}')" title="배틀 투입">
                    ⚔️ 배틀
                  </button>
                  <button class="matched-act-btn" onclick="copyWordToClipboard('${escapeHtml(item.word)}')" title="복사">
                    📋
                  </button>
                  <a href="https://ko.dict.naver.com/#/search?query=${encodeURIComponent(item.word)}" target="_blank" rel="noopener noreferrer" class="matched-act-btn" title="네이버 사전 새 창">
                    🔗
                  </a>
                </div>
              </div>
            `;
          }).join('')}
        </div>
      </div>
    `;
  }

  // ⭐ 네이버 정통 국어사전 검색 결과 뷰 렌더러
  function renderInspectorResult(dict, reco, query) {
    const isVerified = dict.isVerified;
    const r = dict.rebuttal || { totalCount: 0, samples: [] };
    const outCount = r.totalCount;
    const matchedCount = dict.matchedCount || (dict.matchedWords || []).length;
    const matchedHtml = buildMatchedWordsSectionHtml(dict.matchedWords || [], query);

    // 1) 네이버 사전 요약 안내 바
    const summaryBarHtml = `
      <div class="naver-dict-summary-bar">
        <div>
          <span>‘<strong><span class="dict-summary-highlight">${escapeHtml(query)}</span></strong>’에 대한 네이버 국어사전 검색 결과</span>
          <span style="margin-left: 8px; font-weight: 800; color: #10B981;">총 ${matchedCount}건</span>
        </div>
        <div style="font-size: 12px; color: var(--text-muted);">
          출처: 네이버 국어사전 (표준국어대사전 & 우리말샘) 공식 연동
        </div>
      </div>
    `;

    // 2) 사전 미등재 단어인 경우
    if (!isVerified) {
      const mainCardHtml = `
        <div class="dict-main-entry-card" style="border-color: rgba(244, 63, 94, 0.5); background: linear-gradient(135deg, rgba(244, 63, 94, 0.1) 0%, rgba(15, 23, 42, 0.95) 100%);">
          <div class="dict-entry-header">
            <div class="dict-entry-title-row">
              <span class="dict-entry-title">${escapeHtml(query)}</span>
              <span style="font-size: 15px; color: var(--neon-rose); font-weight: 800;">[사전 미등재 어휘]</span>
            </div>
            <div class="dict-entry-badges">
              <span class="dict-official-badge" style="background: rgba(244, 63, 94, 0.15); border-color: var(--neon-rose); color: var(--neon-rose);">
                ✖ 네이버 국어사전 미등재
              </span>
            </div>
          </div>

          <div style="padding: 16px; background: rgba(2, 6, 23, 0.6); border-radius: var(--radius-sm); border-left: 3px solid var(--neon-rose); font-size: 14px; color: #cbd5e1; line-height: 1.6;">
            <strong>「${escapeHtml(query)}」</strong>은(는) 네이버 국어사전(표준국어대사전 및 우리말샘)에 표제어나 뜻풀이가 등재되지 않은 단어입니다.<br>
            끝말잇기 실전 규칙상 사용할 수 없으며, 상대방이 냈을 경우 <strong>실격(패배)</strong> 처리됩니다. 아래의 연관 공인 어휘 목록을 참조하세요.
          </div>

          <div style="display: flex; gap: 10px; margin-top: 16px;">
            <a href="${dict.link}" target="_blank" rel="noopener noreferrer" class="action-btn" style="text-decoration: none; color: var(--text-muted); border-color: rgba(255, 255, 255, 0.2);">
              🔗 네이버 국어사전 공식 웹사이트에서 직접 검색 ↗
            </a>
          </div>
        </div>
      `;

      inspectorResultContainer.innerHTML = `
        <div class="naver-dict-view">
          ${summaryBarHtml}
          ${mainCardHtml}
          ${matchedHtml}
        </div>
      `;
      return;
    }

    // 3) 사전 공식 등재 단어인 경우 (네이버 정통 국어사전 뷰)
    let attackPowerText = '보통';
    let attackPowerClass = 'safe';
    let attackBadge = '🛡️ 4순위: 안전 방어';

    if (outCount === 0) {
      attackPowerText = '💥 즉시 승리 한방 (반격 단어 0개)';
      attackPowerClass = 'killing';
      attackBadge = '💥 1순위: 즉시 승리 한방 단어';
    } else if (outCount <= 3) {
      attackPowerText = `⚔️ 외통수 포위 (반격 단어 ${outCount}개)`;
      attackPowerClass = 'trapped';
      attackBadge = '⚔️ 2순위: 반격해도 한방 외통수';
    } else if (outCount <= 20) {
      attackPowerText = `치명타 압박 (${outCount}개)`;
      attackPowerClass = 'trapped';
      attackBadge = '🔥 3순위: 거의 한방급 치명타';
    } else {
      attackPowerText = `안전 랠리 (${outCount.toLocaleString()}개)`;
      attackPowerClass = 'safe';
      attackBadge = '🛡️ 4순위: 안전하게 쓸 수 있는 방어 단어';
    }

    const meaningsList = (dict.meanings && dict.meanings.length > 0)
      ? dict.meanings
      : ['국립국어원 표준국어대사전 및 우리말샘 공인 표제어입니다.'];

    const meaningsHtml = meaningsList.map((m, i) => `
      <div class="dict-meaning-item">
        <span class="dict-meaning-num">${i + 1}.</span>
        <div class="dict-meaning-content">${escapeHtml(m)}</div>
      </div>
    `).join('');

    const rebuttalSamplesHtml = (r.samples || []).length > 0
      ? `<div style="display: flex; flex-wrap: wrap; gap: 6px; margin-top: 6px;">
          ${r.samples.map(w => `<span class="rebuttal-chip" onclick="selectAutocompleteWord('${escapeHtml(w)}')" title="클릭 시 이 단어로 사전 분석">${escapeHtml(w)}</span>`).join('')}
         </div>`
      : `<div style="font-size: 13px; color: var(--neon-rose); font-weight: 800; margin-top: 6px;">
          ✔ 상대방이 이을 수 있는 단어가 국어사전에 단 1개도 없습니다! (100% 즉시 승리 한방)
         </div>`;

    const mainCardHtml = `
      <div class="dict-main-entry-card">
        <!-- 국어사전 표제어 헤더 -->
        <div class="dict-entry-header">
          <div class="dict-entry-title-row">
            <span class="dict-entry-title">${escapeHtml(query)}</span>
            <span class="dict-pos-pill">「${escapeHtml(dict.partOfSpeech || '명사')}」</span>
          </div>

          <div class="dict-entry-badges">
            <span class="dict-official-badge">
              <span>✔</span>
              <span>${escapeHtml(dict.source || '네이버 국어사전 공식 표제어')}</span>
            </span>
            <span class="tactics-pill ${attackPowerClass}">${attackBadge}</span>
          </div>
        </div>

        <!-- 정통 국어사전 번호 매겨진 뜻풀이 목록 -->
        <div class="dict-meanings-container">
          <div class="dict-meanings-header">
            <span>📖</span>
            <span>국어사전 공식 뜻풀이 (${meaningsList.length}개)</span>
          </div>
          ${meaningsHtml}
        </div>

        <!-- 끝말잇기 실전 전술 스트립 -->
        <div class="dict-tactics-strip">
          <div class="tactics-strip-header">
            <span class="tactics-title">
              <span>🎯</span>
              <span>끝말잇기 실전 전술 분석 (끝글자: '${escapeHtml(query[query.length - 1])}')</span>
            </span>
            <div class="tactics-stat-pills">
              <span class="tactics-pill ${attackPowerClass}">${attackPowerText}</span>
              <span style="font-size: 12px; color: var(--text-muted);">
                두음 변환: ${r.variants ? r.variants.map(escapeHtml).join(', ') : '해당 없음'}
              </span>
            </div>
          </div>
          <div>
            <span style="font-size: 12px; color: var(--text-muted); font-weight: 700;">상대방이 낼 수 있는 다음 단어:</span>
            ${rebuttalSamplesHtml}
          </div>
        </div>

        <!-- 액션 툴바 -->
        <div style="display: flex; flex-wrap: wrap; gap: 10px; margin-top: 18px;">
          <button class="action-btn" onclick="useWordInBattle('${escapeHtml(query)}')" style="background: linear-gradient(135deg, #03C75A 0%, #059669 100%); border-color: #10B981; color: #ffffff; font-weight: 800;">
            ⚔️ 이 단어로 배틀 시작
          </button>
          <button class="action-btn" onclick="askAiAboutWord('${escapeHtml(query)}')" style="background: rgba(99, 102, 241, 0.2); border-color: var(--neon-purple); color: #e0e7ff; font-weight: 700;">
            💬 AI에게 전략 묻기
          </button>
          <button class="action-btn" onclick="copyWordToClipboard('${escapeHtml(query)}')">
            📋 단어 복사
          </button>
          <a href="${dict.link}" target="_blank" rel="noopener noreferrer" class="action-btn" style="text-decoration: none; color: #34d399; border-color: #10B981;">
            🔗 네이버 국어사전 공식 웹페이지 열기 ↗
          </a>
        </div>
      </div>
    `;

    inspectorResultContainer.innerHTML = `
      <div class="naver-dict-view">
        ${summaryBarHtml}
        ${mainCardHtml}
        ${matchedHtml}
      </div>
    `;
  }

  // 9. 한방 단어 렉시콘 로드
  let lexiconLoaded = false;
  async function loadKillingLexicon() {
    if (lexiconLoaded) return;
    try {
      const res = await fetch('/api/killing-words');
      const data = await res.json();
      lexiconLoaded = true;

      lexiconGrid.innerHTML = '';
      for (const item of (data.items || [])) {
        const card = document.createElement('div');
        card.className = 'lexicon-card';

        const wordsHtml = item.samples.map(w => `
          <span class="sample-word-pill" onclick="event.stopPropagation(); inspectWordInDict('${w}')" title="클릭 시 「${w}」 사전 분석 및 배틀 사용">
            ${w}
          </span>
        `).join('');

        card.innerHTML = `
          <div class="lexicon-card-header">
            <span class="lexicon-char">${item.char}</span>
            <span class="lexicon-count">한방 단어 ${item.wordCount}개</span>
          </div>
          <div style="font-size: 12px; color: var(--text-muted); margin-bottom: 8px;">대표 필승 단어 (클릭하여 복사):</div>
          <div class="lexicon-words-sample">
            ${wordsHtml}
          </div>
        `;

        card.addEventListener('click', () => {
          switchTab('inspector');
          inspectorInput.value = item.char;
          inspectorForm.dispatchEvent(new Event('submit'));
        });

        lexiconGrid.appendChild(card);
      }
    } catch (err) {
      lexiconGrid.innerHTML = '<div style="color: var(--neon-rose);">렉시콘 데이터를 불러오지 못했습니다.</div>';
    }
  }

  // 10. 접속 링크 공유 버튼
  const shareLinkBtn = document.getElementById('shareLinkBtn');
  if (shareLinkBtn) {
    shareLinkBtn.addEventListener('click', async () => {
      try {
        const res = await fetch('/api/server-info');
        const data = await res.json();
        const publicUrl = data.publicTunnelUrl;
        const lanIp = data.localIps?.[0]?.address || '192.168.219.103';
        const lanUrl = `http://${lanIp}:${data.port || 3000}`;

        const bestShareUrl = publicUrl || lanUrl;
        await navigator.clipboard.writeText(bestShareUrl);
        window.soundEngine.playCopy();

        alert(`🎉 다른 사람이 접속할 수 있는 주소입니다:\n\n` +
              (publicUrl ? `🌐 [외부 인터넷 어디서나 접속 가능한 링크]:\n${publicUrl}\n(카톡이나 메신저로 친구에게 보내시면 바로 들어올 수 있습니다!)\n\n` : '') +
              `📱 [같은 와이파이 / 스마트폰 접속]:\n${lanUrl}\n\n` +
              `※ 접속 링크(${bestShareUrl})가 클립보드에 바로 복사되었습니다. 붙여넣기(Ctrl+V)해서 보내주세요!`);
        showToast('접속 링크가 복사되었습니다! 🎉');
      } catch (err) {
        const fallback = 'http://192.168.219.103:3000';
        await navigator.clipboard.writeText(fallback);
        alert(`📱 스마트폰 / 다른 사람 접속 주소:\n${fallback}\n\n클립보드에 복사되었습니다!`);
        showToast('접속 주소가 복사되었습니다.');
      }
    });
  }

  function escapeHtml(str) {
    if (!str) return '';
    return str
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#039;');
  }
});
