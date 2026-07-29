// ============================================
// Quiz Player - Gameplay & Results
// ============================================

const QuizPlayer = (() => {
  let currentQuiz = null;
  let questionsQueue = [];
  let currentIndex = 0;
  let results = [];
  let questionStates = [];
  let currentRetries = 0;
  let answered = false;
  let lastAnswerTime = 0;
  let settings = {};
  let usedAnswers = {};
  let allVocabQuestions = [];
  let selectedQuestionType = 'all';
  let currentPlayMode = localStorage.getItem('quizmaster-play-mode') || localStorage.getItem('quizmaster-dashboard-mode') || 'question';
  let cachedPlayQuizzes = null;
  let cachedTypeCounts = null;

  const PROGRESS_KEY_PREFIX = 'quizmaster-progress-';
  let saveProgressTimer = null;

  const deletedQtypesSet = new Set();

  function saveProgress() {
    if (!currentQuiz || !currentQuiz.id) return Promise.resolve();
    if (saveProgressTimer) clearTimeout(saveProgressTimer);

    const effectiveQtype = selectedQuestionType || 'all';
    const deleteKey = currentQuiz.id + '_' + effectiveQtype;
    if (deletedQtypesSet.has(deleteKey) || deletedQtypesSet.has(currentQuiz.id + '_all')) {
      return Promise.resolve();
    }

    try {
      // If question was just answered, save progress at next question index
      const indexToSave = answered ? Math.min(currentIndex + 1, questionsQueue.length) : currentIndex;

      const lightweightQueue = questionsQueue.map(q => ({
        id: q.id,
        question_text: q.question_text,
        correct_answer: q.correct_answer,
        question_type: q.question_type,
        ipa: q.ipa || '',
        _failedTries: q._failedTries || 0
      }));

      const lightweightResults = results.map(r => ({
        questionId: r.questionId || r.question?.id,
        questionText: r.questionText || r.question?.question_text,
        questionType: r.questionType || r.question?.question_type,
        queueIndex: r.queueIndex,
        userAnswer: r.userAnswer,
        isCorrect: r.isCorrect,
        retries: r.retries
      }));
      const lightweightStates = questionStates.map(s => ({ ...s }));

      const authToken = (window.Auth && Auth.getToken()) || localStorage.getItem('quizmaster-token') || null;
      const currentUser = (window.Auth && Auth.getUser()) || null;
      const currentUserId = currentUser ? currentUser.id : null;

      const progressData = {
        quizId: currentQuiz.id,
        quizTitle: currentQuiz.title || '',
        quizType: currentQuiz.quiz_type || '',
        currentIndex: indexToSave,
        currentQuestionIndex: indexToSave,
        questions: lightweightQueue,
        queue: lightweightQueue,
        selectedQuestionType: effectiveQtype,
        results: lightweightResults,
        questionStates: lightweightStates,
        usedAnswers,
        updatedAt: Date.now()
      };

      localStorage.setItem(PROGRESS_KEY_PREFIX + currentQuiz.id + '_' + effectiveQtype, JSON.stringify(progressData));
      if (effectiveQtype === 'all') {
        localStorage.setItem(PROGRESS_KEY_PREFIX + currentQuiz.id, JSON.stringify(progressData));
      }

      const payload = JSON.stringify({
        quizId: currentQuiz.id,
        qtype: effectiveQtype,
        sessionData: progressData,
        token: authToken,
        userId: currentUserId
      });

      // Use sendBeacon for guaranteed delivery during navigation
      if (navigator.sendBeacon) {
        try {
          navigator.sendBeacon('/api/sessions/save', new Blob([payload], { type: 'application/json' }));
        } catch (e) {}
      }

      const headers = { 'Content-Type': 'application/json' };
      if (authToken) {
        headers['Authorization'] = `Bearer ${authToken}`;
        headers['x-session-token'] = authToken;
      }

      const savePromise = fetch('/api/sessions/save', {
        method: 'POST',
        headers,
        body: payload,
        keepalive: true
      }).catch(e => {
        console.warn('Unable to save session to server:', e);
      });

      if (currentQuiz && currentQuiz.quiz_type === 'vocabulary') {
        saveVocabPerQtypeProgress(authToken, currentUserId, headers);
      }

      return savePromise;
    } catch (e) {
      console.warn('Unable to save progress', e);
      return Promise.resolve();
    }
  }

  function saveVocabPerQtypeProgress(authToken, currentUserId, headers) {
    if (!currentQuiz || currentQuiz.quiz_type !== 'vocabulary') return;
    const pool = (allVocabQuestions && allVocabQuestions.length > 0) ? allVocabQuestions : questionsQueue;
    if (!pool || pool.length === 0) return;
    const activeAnsweredQuestion = answered ? questionsQueue[currentIndex] : null;
    const activeAnsweredAlreadyInResults = activeAnsweredQuestion
      ? results.some(r => (r.questionId || r.question?.id) && String(r.questionId || r.question?.id) === String(activeAnsweredQuestion.id) && (r.questionType || r.question?.question_type) === activeAnsweredQuestion.question_type)
      : false;

    const qtypesPresent = new Set();
    pool.forEach(q => {
      if (q.question_type) qtypesPresent.add(q.question_type);
    });

    qtypesPresent.forEach(qtype => {
      if (deletedQtypesSet.has(currentQuiz.id + '_' + qtype)) return;
      const qtypeQuestions = pool.filter(q => q.question_type === qtype);
      if (qtypeQuestions.length === 0) return;

      const qtypeResults = results.filter(r => (r.questionType || r.question?.question_type) === qtype);
      const qtypeStates = questionStates.filter(s => s.questionType === qtype);
      const activeAnsweredForQtype = activeAnsweredQuestion && activeAnsweredQuestion.question_type === qtype && !activeAnsweredAlreadyInResults;
      if (qtypeResults.length === 0 && !activeAnsweredForQtype && qtypeStates.length === 0) return;

      const qtypeIndexToSave = Math.min(qtypeResults.length + (activeAnsweredForQtype ? 1 : 0), qtypeQuestions.length);

      const qtypeLightweightQueue = qtypeQuestions.map(q => ({
        id: q.id,
        question_text: q.question_text,
        correct_answer: q.correct_answer,
        question_type: q.question_type,
        ipa: q.ipa || '',
        _failedTries: q._failedTries || 0
      }));

      const qtypeProgressData = {
        quizId: currentQuiz.id,
        quizTitle: currentQuiz.title || '',
        quizType: currentQuiz.quiz_type || '',
        currentIndex: qtypeIndexToSave,
        currentQuestionIndex: qtypeIndexToSave,
        questions: qtypeLightweightQueue,
        queue: qtypeLightweightQueue,
        selectedQuestionType: qtype,
        results: qtypeResults.map(r => ({
          questionId: r.questionId || r.question?.id,
          questionText: r.questionText || r.question?.question_text,
          questionType: r.questionType || r.question?.question_type,
          queueIndex: r.queueIndex,
          userAnswer: r.userAnswer,
          isCorrect: r.isCorrect,
          retries: r.retries
        })),
        questionStates: qtypeStates.map(s => ({ ...s })),
        usedAnswers,
        updatedAt: Date.now()
      };

      localStorage.setItem(PROGRESS_KEY_PREFIX + currentQuiz.id + '_' + qtype, JSON.stringify(qtypeProgressData));

      const payload = JSON.stringify({
        quizId: currentQuiz.id,
        qtype: qtype,
        sessionData: qtypeProgressData,
        token: authToken,
        userId: currentUserId
      });

      if (navigator.sendBeacon) {
        try {
          navigator.sendBeacon('/api/sessions/save', new Blob([payload], { type: 'application/json' }));
        } catch (e) {}
      }

      fetch('/api/sessions/save', {
        method: 'POST',
        headers,
        body: payload,
        keepalive: true
      }).catch(e => {});
    });

    if (selectedQuestionType && selectedQuestionType !== 'all') {
      const allLightweightQueue = pool.map(q => ({
        id: q.id,
        question_text: q.question_text,
        correct_answer: q.correct_answer,
        question_type: q.question_type,
        ipa: q.ipa || '',
        _failedTries: q._failedTries || 0
      }));
      const allIndexToSave = Math.min(results.length + (activeAnsweredQuestion && !activeAnsweredAlreadyInResults ? 1 : 0), pool.length);
      const allProgressData = {
        quizId: currentQuiz.id,
        quizTitle: currentQuiz.title || '',
        quizType: currentQuiz.quiz_type || '',
        currentIndex: allIndexToSave,
        currentQuestionIndex: allIndexToSave,
        questions: allLightweightQueue,
        queue: allLightweightQueue,
        selectedQuestionType: 'all',
        results: results.map(r => ({
          questionId: r.questionId || r.question?.id,
          questionText: r.questionText || r.question?.question_text,
          questionType: r.questionType || r.question?.question_type,
          queueIndex: r.queueIndex,
          userAnswer: r.userAnswer,
          isCorrect: r.isCorrect,
          retries: r.retries
        })),
        questionStates: questionStates.map(s => ({ ...s })),
        usedAnswers,
        updatedAt: Date.now()
      };

      localStorage.setItem(PROGRESS_KEY_PREFIX + currentQuiz.id + '_all', JSON.stringify(allProgressData));
      localStorage.setItem(PROGRESS_KEY_PREFIX + currentQuiz.id, JSON.stringify(allProgressData));

      const payloadAll = JSON.stringify({
        quizId: currentQuiz.id,
        qtype: 'all',
        sessionData: allProgressData,
        token: authToken,
        userId: currentUserId
      });

      if (navigator.sendBeacon) {
        try {
          navigator.sendBeacon('/api/sessions/save', new Blob([payloadAll], { type: 'application/json' }));
        } catch (e) {}
      }

      fetch('/api/sessions/save', {
        method: 'POST',
        headers,
        body: payloadAll,
        keepalive: true
      }).catch(e => {});
    }
  }

  function getSavedProgress(quizId, targetQtype = null) {
    try {
      if (targetQtype && targetQtype !== 'all') {
        if (deletedQtypesSet.has(quizId + '_' + targetQtype)) return null;
        const qData = localStorage.getItem(PROGRESS_KEY_PREFIX + quizId + '_' + targetQtype);
        if (qData) {
          try {
            const parsed = JSON.parse(qData);
            if (parsed) return parsed;
          } catch (e) {}
        }
      }

      if (targetQtype === 'all') {
        if (deletedQtypesSet.has(quizId + '_all')) return null;
        const allData = localStorage.getItem(PROGRESS_KEY_PREFIX + quizId + '_all') || localStorage.getItem(PROGRESS_KEY_PREFIX + quizId);
        if (allData) {
          try {
            const parsed = JSON.parse(allData);
            if (parsed) return parsed;
          } catch (e) {}
        }
      }

      if (!targetQtype) {
        let best = null;
        const prefix = PROGRESS_KEY_PREFIX + quizId;
        for (let i = 0; i < localStorage.length; i++) {
          const key = localStorage.key(i);
          if (key && key.startsWith(prefix)) {
            const subType = key.substring(prefix.length + 1);
            if (subType && deletedQtypesSet.has(quizId + '_' + subType)) continue;
            try {
              const parsed = JSON.parse(localStorage.getItem(key));
              if (parsed && (!best || (parsed.updatedAt || 0) > (best.updatedAt || 0))) {
                best = parsed;
              }
            } catch (e) {}
          }
        }
        return best;
      }

      return null;
    } catch (e) {
      return null;
    }
  }

  // Attach global lifecycle event listeners so progress is saved when navigating away or closing window
  window.addEventListener('beforeunload', () => saveProgress());
  window.addEventListener('pagehide', () => saveProgress());
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'hidden') saveProgress();
  });
  window.addEventListener('hashchange', () => saveProgress());
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && !e.repeat && answered) {
      if (Date.now() - lastAnswerTime < 150) return;
      const submitBtn = document.getElementById('submit-btn');
      if (submitBtn && typeof submitBtn.onclick === 'function') {
        e.preventDefault();
        submitBtn.onclick();
      }
    }
  });

  function clearSavedProgress(quizId, targetQtype = null) {
    if (!quizId) return Promise.resolve();
    if (saveProgressTimer) clearTimeout(saveProgressTimer);

    const effectiveQtype = targetQtype || selectedQuestionType || 'all';
    const deleteKey = quizId + '_' + effectiveQtype;
    deletedQtypesSet.add(deleteKey);

    localStorage.removeItem(PROGRESS_KEY_PREFIX + quizId + '_' + effectiveQtype);

    if (effectiveQtype === 'all') {
      deletedQtypesSet.add(quizId + '_all');
      localStorage.removeItem(PROGRESS_KEY_PREFIX + quizId + '_all');
      localStorage.removeItem(PROGRESS_KEY_PREFIX + quizId);
    } else {
      // Clean up targetQtype results from 'all' session in localStorage if present
      ['quizmaster-progress-' + quizId + '_all', 'quizmaster-progress-' + quizId].forEach(allKey => {
        const rawAll = localStorage.getItem(allKey);
        if (rawAll) {
          try {
            const parsed = JSON.parse(rawAll);
            if (parsed && Array.isArray(parsed.results)) {
              const cleaned = parsed.results.filter(r => (r.questionType || r.question_type || r.question?.question_type) !== effectiveQtype);
              if (cleaned.length === 0) {
                localStorage.removeItem(allKey);
              } else {
                parsed.results = cleaned;
                parsed.currentIndex = Math.min(cleaned.length, parsed.currentIndex || 0);
                localStorage.setItem(allKey, JSON.stringify(parsed));
              }
            }
          } catch (e) {}
        }
      });
    }

    if (currentQuiz && Number(currentQuiz.id) === Number(quizId)) {
      if (effectiveQtype === 'all' || effectiveQtype === selectedQuestionType) {
        currentQuiz = null;
        questionsQueue = [];
        results = [];
        questionStates = [];
        usedAnswers = {};
      } else {
        results = results.filter(r => (r.questionType || r.question_type || r.question?.question_type) !== effectiveQtype);
        questionStates = questionStates.filter(s => s.questionType !== effectiveQtype);
      }
    }

    return fetch(`/api/sessions/quiz/${quizId}/qtype/${effectiveQtype}`, { method: 'DELETE' }).catch(e => {});
  }

  function renderSelectScreen() {
    const main = document.getElementById('main-content');
    main.innerHTML = `
      <div class="page-header">
        <h1>${I18n.t('play.title')}</h1>
        <p>${I18n.t('play.subtitle')}</p>
      </div>

      <div class="mode-toggle" style="margin-bottom: 24px;">
        <button class="mode-btn ${currentPlayMode === 'question' ? 'active' : ''}" id="play-mode-question-btn" onclick="QuizPlayer.setPlayMode('question')">
          📝 <span data-i18n="dashboard.modeQuestion">${I18n.t('dashboard.modeQuestion')}</span>
        </button>
        <button class="mode-btn ${currentPlayMode === 'vocabulary' ? 'active' : ''}" id="play-mode-vocab-btn" onclick="QuizPlayer.setPlayMode('vocabulary')">
          🔤 <span data-i18n="dashboard.modeVocab">${I18n.t('dashboard.modeVocab')}</span>
        </button>
      </div>

      <div id="play-quiz-list" class="loading-overlay"><div class="spinner"></div></div>
    `;
    loadQuizList();
  }

  function setPlayMode(mode) {
    currentPlayMode = mode;
    localStorage.setItem('quizmaster-play-mode', mode);
    localStorage.setItem('quizmaster-dashboard-mode', mode);

    const qBtn = document.getElementById('play-mode-question-btn');
    const vBtn = document.getElementById('play-mode-vocab-btn');
    if (qBtn) qBtn.className = `mode-btn ${mode === 'question' ? 'active' : ''}`;
    if (vBtn) vBtn.className = `mode-btn ${mode === 'vocabulary' ? 'active' : ''}`;

    renderFilteredPlayQuizList();
  }

  async function loadQuizList(forceFetch = false) {
    try {
      const container = document.getElementById('play-quiz-list');
      if (!cachedPlayQuizzes || forceFetch) {
        const res = await fetch('/api/quizzes');
        cachedPlayQuizzes = await res.json();
      }
      if (container) container.classList.remove('loading-overlay');
      renderFilteredPlayQuizList();
    } catch (err) {
      Components.showToast(I18n.t('common.error'), 'error');
    }
  }

  function attachWordMetadataToQuestions(questions) {
    if (!questions || questions.length === 0) return;
    const wordMap = new Map();
    questions.forEach(q => {
      let w = '', m = '', ipa = q.ipa || '';
      if (q.question_type === 'fill_word_meaning' || q.question_type === 'mcq_word_meaning') {
        w = (q.question_text || '').replace(/^🎧\s*/, '').split('|||')[0].trim();
        m = (q.correct_answer || '').trim();
      } else if (q.question_type === 'fill_meaning_word' || q.question_type === 'mcq_meaning_word') {
        w = (q.correct_answer || '').trim();
        m = (q.question_text || '').replace(/^🎧\s*/, '').split('|||')[0].trim();
      }
      if (w && m) {
        const key = w.toLowerCase() + ':::' + m.toLowerCase();
        if (!wordMap.has(key)) {
          wordMap.set(key, { word: w, meaning: m, ipa });
        } else if (ipa && !wordMap.get(key).ipa) {
          wordMap.get(key).ipa = ipa;
        }
      }
    });

    questions.forEach(q => {
      let w = '', m = '';
      if (q.question_type === 'fill_word_meaning' || q.question_type === 'mcq_word_meaning') {
        w = (q.question_text || '').replace(/^🎧\s*/, '').split('|||')[0].trim();
        m = (q.correct_answer || '').trim();
      } else if (q.question_type === 'fill_meaning_word' || q.question_type === 'mcq_meaning_word') {
        w = (q.correct_answer || '').trim();
        m = (q.question_text || '').replace(/^🎧\s*/, '').split('|||')[0].trim();
      }
      if (w && m) {
        const key = w.toLowerCase() + ':::' + m.toLowerCase();
        const meta = wordMap.get(key);
        if (meta) {
          q._word = meta.word;
          q._meaning = meta.meaning;
          q._ipa = meta.ipa || q.ipa || '';
        } else {
          q._word = w;
          q._meaning = m;
          q._ipa = q.ipa || '';
        }
      } else {
        q._word = q.question_text || '';
        q._meaning = q.correct_answer || '';
        q._ipa = q.ipa || '';
      }
    });
  }

  function addWrongWord(word, meaning, ipa) {
    if (!word || !meaning) return;
    if (currentQuiz && (currentQuiz.code === 'WRONG0' || currentQuiz.is_pinned === 1 || currentQuiz.title === 'Các từ sai/hay quên')) {
      return;
    }
    fetch('/api/quizzes/wrong-words/add', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ word, meaning, ipa })
    }).then(res => res.json()).then(() => {
      cachedPlayQuizzes = null;
    }).catch(err => {
      console.warn('Could not save wrong word:', err);
    });
  }

  function renderFilteredPlayQuizList() {
    const container = document.getElementById('play-quiz-list');
    if (!container || !cachedPlayQuizzes) return;

    const filtered = cachedPlayQuizzes.filter(q => (q.quiz_type || 'question') === currentPlayMode);

    if (filtered.length === 0) {
      container.innerHTML = `
        <div class="empty-state">
          <span class="empty-icon">🎮</span>
          <h3>${I18n.t('dashboard.empty')}</h3>
          <p>${I18n.t('dashboard.emptyHint')}</p>
        </div>
      `;
      return;
    }

    container.innerHTML = filtered.map(q => {
      const isPinned = q.is_pinned === 1 || q.code === 'WRONG0';
      const saved = getSavedProgress(q.id);
      const savedQueue = saved ? (saved.queue || saved.questionsQueue || []) : [];
      const hasSaved = saved && savedQueue.length > 0 && (saved.currentIndex || 0) < savedQueue.length;
      const savedBadge = hasSaved
        ? `<span class="resume-badge" style="display: inline-block; margin-top: 4px; background: rgba(245, 158, 11, 0.15); color: #fbbf24; border: 1px solid rgba(245, 158, 11, 0.3); padding: 2px 8px; border-radius: 12px; font-size: 12px; font-weight: 600;">💾 ${I18n.t('resume.badge', { current: Math.min((saved.currentIndex || 0) + 1, savedQueue.length), total: savedQueue.length })}</span>`
        : '';

      const pinnedStyle = isPinned ? 'border: 1px solid rgba(239, 68, 68, 0.4); background: rgba(239, 68, 68, 0.05);' : '';
      const pinnedBadge = isPinned ? `<span style="background: rgba(239, 68, 68, 0.15); color: #f87171; border: 1px solid rgba(239, 68, 68, 0.3); padding: 2px 8px; border-radius: 12px; font-size: 12px; font-weight: 700; margin-left: 6px;">📌 ${I18n.t('quiz.pinned')}</span>` : '';

      return `
        <div class="card play-quiz-card ${isPinned ? 'pinned-card' : ''}" style="${pinnedStyle}"
             onclick="QuizPlayer.startQuiz(${q.id})">
          <div class="play-quiz-card-info">
            <h3 class="play-quiz-card-title">
              ${Components.escapeHtml(q.title)} ${pinnedBadge}
            </h3>
            <div class="play-quiz-card-meta">
              <span class="text-muted" style="font-size: 13px;">
                ${q.question_count || 0} ${I18n.t('table.questions').toLowerCase()} · 
                <span class="code-badge" style="font-size: 12px;">${q.code}</span>
              </span>
              ${savedBadge ? `<div style="margin-top: 4px;">${savedBadge}</div>` : ''}
            </div>
          </div>
          <div class="play-quiz-card-actions" style="display: flex; gap: 8px; flex-wrap: wrap; justify-content: flex-end; align-items: center;">
            <button class="btn btn-ghost edit-quiz-btn" onclick="event.stopPropagation(); App.editQuiz(${q.id}, '${q.quiz_type || 'question'}')" title="${I18n.t('common.edit')}">
              ✏️ ${I18n.t('common.edit')}
            </button>
            <a href="/api/export/${q.id}" class="btn btn-ghost export-quiz-btn" onclick="event.stopPropagation();" download title="Xuất file Excel" style="text-decoration: none; display: inline-flex; align-items: center; gap: 4px;">
              📤 ${I18n.t('export.downloadExcel') || 'Xuất Excel'}
            </a>
            <button class="btn btn-primary start-quiz-btn" onclick="event.stopPropagation(); QuizPlayer.startQuiz(${q.id})">
              ${hasSaved ? '▶ ' + I18n.t('resume.continue') : '▶ ' + I18n.t('play.start')}
            </button>
          </div>
        </div>
      `;
    }).join('');
  }

  function showResumeModal(saved, quizId) {
    const savedQueue = saved.queue || saved.questions || saved.questionsQueue || [];
    const total = savedQueue.length;
    const currentNum = Math.min((saved.currentIndex || 0) + 1, total);
    const correctCount = (saved.results || []).filter(r => r.isCorrect).length;

    const body = `
      <div style="text-align: center; padding: 12px 0;">
        <div style="font-size: 44px; margin-bottom: 12px;">💾</div>
        <p style="font-size: 15px; color: var(--text-secondary); margin-bottom: 14px; line-height: 1.5;">
          ${I18n.t('resume.message', { current: currentNum, total })}
        </p>
        <div style="display: inline-flex; gap: 12px; background: var(--bg-glass); padding: 8px 16px; border-radius: var(--radius-sm); border: 1px solid var(--border-color); font-size: 13px; color: var(--text-muted);">
          <span>${I18n.t('results.correct')}: <strong style="color: #10b981;">${correctCount}</strong></span>
          <span>·</span>
          <span>${I18n.t('results.total')}: <strong>${total}</strong></span>
        </div>
      </div>
    `;

    const footer = `
      <button class="btn btn-ghost" onclick="QuizPlayer.startQuiz(${quizId}, true)">
        🔄 ${I18n.t('resume.startNew')}
      </button>
      <button class="btn btn-primary" onclick="QuizPlayer.resumeQuiz(${quizId})">
        ▶ ${I18n.t('resume.continue')}
      </button>
    `;

    Components.showModal(I18n.t('resume.title'), body, footer);
  }

  function buildFullVocabQuestions(quiz, settingsObj) {
    if (!quiz || !quiz.questions) return [];
    let raw = [...quiz.questions];
    if (settingsObj.swapQA) {
      raw = raw.map(q => ({
        ...q,
        question_text: q.correct_answer.split('/').join(' / '),
        correct_answer: q.question_text,
      }));
    }
    const fullList = [];
    const dedupeTypes = new Set(['mcq_word_ipa', 'mcq_ipa_word', 'fill_ipa_word', 'fill_word_ipa', 'mcq_listen_word', 'fill_listen_word']);
    const seenDedupeKeys = new Set();

    raw.forEach(q => {
      if (dedupeTypes.has(q.question_type)) {
        const cleanPrompt = (q.question_text || '').replace(/^🎧\s*/, '').split('|||')[0].trim().toLowerCase();
        const key = `${q.question_type}:${cleanPrompt}`;
        if (seenDedupeKeys.has(key)) return;
        seenDedupeKeys.add(key);
      }

      const isMcq = q.question_type && q.question_type.startsWith('mcq_');
      if (isMcq) {
        fullList.push({ ...q });
      } else {
        const ansCount = q.correct_answer.split('/').filter(a => a.trim()).length || 1;
        for (let i = 0; i < ansCount; i++) {
          fullList.push({ ...q });
        }
      }
    });
    return fullList;
  }

  let isResuming = false;

  async function resumeQuiz(quizId, targetQtype = null, rawSessionData = null) {
    if (isResuming) return;
    isResuming = true;
    try {
      Components.closeModal();

      let saved = rawSessionData;
      if (typeof saved === 'string') {
        try { saved = JSON.parse(saved); } catch (e) {}
      }

      if (!saved) {
        saved = getSavedProgress(quizId, targetQtype) || getSavedProgress(quizId);
      }

      if (!saved) {
        isResuming = false;
        startQuiz(quizId, false);
        return;
      }

      const effectiveQtype = targetQtype || saved.selectedQuestionType || 'all';

      try {
        if (effectiveQtype === 'all') {
          localStorage.setItem(PROGRESS_KEY_PREFIX + quizId, JSON.stringify(saved));
        }
        if (effectiveQtype) {
          localStorage.setItem(PROGRESS_KEY_PREFIX + quizId + '_' + effectiveQtype, JSON.stringify(saved));
        }
      } catch (e) {}

      const res = await fetch(`/api/quizzes/${quizId}`);
      if (!res.ok) throw new Error('Quiz not found');
      currentQuiz = await res.json();

      settings = {
        shuffleQuestions: localStorage.getItem('quizmaster-shuffle') === 'true',
        swapQA: localStorage.getItem('quizmaster-swap') === 'true',
        allowDuplicates: localStorage.getItem('quizmaster-allow-duplicates') === 'true',
        maxRetries: parseInt(localStorage.getItem('quizmaster-max-retries') || '-1', 10),
      };

      selectedQuestionType = effectiveQtype;
      results = (saved.results || []).map(r => ({
        ...r,
        question: r.question || {
          id: r.questionId || r.question?.id,
          question_text: r.questionText || r.question?.question_text,
          question_type: r.questionType || r.question?.question_type,
          correct_answer: r.userAnswer || ''
        }
      }));
      questionStates = Array.isArray(saved.questionStates) ? saved.questionStates : (saved.results || []).map(r => ({ key: String(r.questionId || r.question?.id) + '|' + (r.questionType || r.question?.question_type) + '|' + r.queueIndex, questionId: r.questionId || r.question?.id, questionType: r.questionType || r.question?.question_type, queueIndex: r.queueIndex, status: r.isCorrect ? 'correct' : 'incorrect' }));
      usedAnswers = saved.usedAnswers || {};

      if (currentQuiz.quiz_type === 'vocabulary') {
        allVocabQuestions = buildFullVocabQuestions(currentQuiz, settings);
        cachedTypeCounts = null;

        let targetPool = [...allVocabQuestions];
        if (effectiveQtype && effectiveQtype !== 'all') {
          targetPool = targetPool.filter(q => q.question_type === effectiveQtype);
        }
        if (targetPool.length === 0) {
          targetPool = [...allVocabQuestions];
        }

        const savedQueue = saved.queue || saved.questions || saved.questionsQueue || [];
        if (savedQueue.length > 0) {
          const poolMapById = new Map(targetPool.map(q => [String(q.id), q]));
          const poolMapByType = new Map();
          targetPool.forEach(q => {
            if (!poolMapByType.has(q.question_type)) poolMapByType.set(q.question_type, []);
            poolMapByType.get(q.question_type).push(q);
          });

          const restored = [];
          const usedIndices = new Set();

          savedQueue.forEach((item, idx) => {
            let matched = poolMapById.get(String(item.id));
            if (!matched && item.question_type) {
              const typeList = poolMapByType.get(item.question_type) || [];
              matched = typeList.find((_, i) => !usedIndices.has(item.question_type + '_' + i));
              if (matched) {
                const matchedIdx = typeList.indexOf(matched);
                usedIndices.add(item.question_type + '_' + matchedIdx);
              }
            }
            if (!matched && idx < targetPool.length) {
              matched = targetPool[idx];
            }

            if (matched) {
              restored.push({
                ...matched,
                _failedTries: item._failedTries || 0
              });
            } else if (item.question_text) {
              restored.push({ ...item });
            }
          });

          questionsQueue = restored.length > 0 ? restored : targetPool;
        } else {
          questionsQueue = targetPool;
        }
      } else {
        allVocabQuestions = [];
        cachedTypeCounts = null;
        let rawQuestions = [...currentQuiz.questions];
        if (settings.swapQA) {
          rawQuestions = rawQuestions.map(q => ({
            ...q,
            question_text: q.correct_answer.split('/').join(' / '),
            correct_answer: q.question_text,
          }));
        }

        const questionMap = new Map(rawQuestions.map(q => [String(q.id), q]));
        const savedQueue = saved.queue || saved.questions || saved.questionsQueue || [];

        if (savedQueue.length > 0) {
          questionsQueue = savedQueue.map(item => {
            const fullQ = questionMap.get(String(item.id)) || item;
            return {
              ...fullQ,
              _failedTries: item._failedTries || 0
            };
          }).filter(q => q && q.question_text);
        } else {
          questionsQueue = rawQuestions;
        }
      }

      if (!questionsQueue || questionsQueue.length === 0) {
        throw new Error('Không có câu hỏi nào để khôi phục');
      }

      const rawIndex = saved.currentIndex !== undefined ? saved.currentIndex : (saved.currentQuestionIndex || 0);
      
      if (rawIndex >= questionsQueue.length) {
        if (results.length >= questionsQueue.length) {
          currentIndex = questionsQueue.length;
        } else {
          currentIndex = Math.max(0, questionsQueue.length - 1);
        }
      } else {
        currentIndex = Math.max(0, rawIndex);
      }

      attachWordMetadataToQuestions(questionsQueue);
      if (allVocabQuestions && allVocabQuestions.length > 0) {
        attachWordMetadataToQuestions(allVocabQuestions);
      }

      if (window.location.hash !== `#play/${quizId}`) {
        if (history.replaceState) {
          history.replaceState(null, '', `#play/${quizId}`);
        } else {
          window.location.hash = `play/${quizId}`;
        }
      }

      Components.showToast('✅ ' + I18n.t('resume.savedNotice'), 'success');
      renderQuestion();
    } catch (err) {
      console.error('Error in resumeQuiz:', err);
      Components.showToast(I18n.t('common.error') + ': ' + err.message, 'error');
    } finally {
      isResuming = false;
    }
  }

  async function startQuiz(quizId, forceNew = false, autoResume = false) {
    if (isResuming) return;
    try {
      let saved = getSavedProgress(quizId);
      if (!saved && !forceNew) {
        try {
          const sRes = await fetch('/api/sessions');
          if (sRes.ok) {
            const userSessions = await sRes.json();
            const quizGroup = userSessions.find(g => Number(g.quiz_id) === Number(quizId));
            if (quizGroup && quizGroup.sessions && quizGroup.sessions.length > 0) {
              const latestS = quizGroup.sessions[0];
              if (latestS && latestS.session_data) {
                saved = latestS.session_data;
              }
            }
          }
        } catch (e) {}
      }

      const savedQueue = saved ? (saved.queue || saved.questionsQueue || []) : [];
      if (saved && !forceNew && savedQueue.length > 0 && (saved.currentIndex || 0) < savedQueue.length) {
        resumeQuiz(quizId, saved.selectedQuestionType || 'all', saved);
        return;
      }

      Components.closeModal();

      if (forceNew) {
        clearSavedProgress(quizId);
      }

      const res = await fetch(`/api/quizzes/${quizId}`);
      if (!res.ok) throw new Error('Quiz not found');
      currentQuiz = await res.json();

      if (!currentQuiz.questions || currentQuiz.questions.length === 0) {
        Components.showToast('This quiz has no questions.', 'warning');
        return;
      }

      // Load settings
      settings = {
        shuffleQuestions: localStorage.getItem('quizmaster-shuffle') === 'true',
        swapQA: localStorage.getItem('quizmaster-swap') === 'true',
        allowDuplicates: localStorage.getItem('quizmaster-allow-duplicates') === 'true',
        maxRetries: parseInt(localStorage.getItem('quizmaster-max-retries') || '-1', 10),
      };

      // Prepare questions
      let rawQueue = [...currentQuiz.questions];

      // Apply swap if enabled
      if (settings.swapQA) {
        rawQueue = rawQueue.map(q => ({
          ...q,
          question_text: q.correct_answer.split('/').join(' / '),
          correct_answer: q.question_text,
        }));
      }

      questionsQueue = [];
      rawQueue.forEach(q => {
        const isMcq = q.question_type && q.question_type.startsWith('mcq_');
        if (isMcq) {
          questionsQueue.push({ ...q });
        } else {
          const ansCount = q.correct_answer.split('/').filter(a => a.trim()).length || 1;
          for (let i = 0; i < ansCount; i++) {
            questionsQueue.push({ ...q });
          }
        }
      });

      // Shuffle if enabled
      if (settings.shuffleQuestions) {
        questionsQueue = shuffleArray(questionsQueue);
      }

      // For vocabulary quizzes, save the full list so we can filter by type
      if (currentQuiz.quiz_type === 'vocabulary') {
        allVocabQuestions = buildFullVocabQuestions(currentQuiz, settings);
        cachedTypeCounts = null;
        questionsQueue = [...allVocabQuestions];
        if (settings.shuffleQuestions) {
          questionsQueue = shuffleArray(questionsQueue);
        }
        // Apply type filter if one was selected
        if (selectedQuestionType !== 'all') {
          questionsQueue = questionsQueue.filter(q => q.question_type === selectedQuestionType);
        }
        attachWordMetadataToQuestions(allVocabQuestions);
      } else {
        allVocabQuestions = [];
        cachedTypeCounts = null;
        selectedQuestionType = 'all';
      }

      attachWordMetadataToQuestions(questionsQueue);

      currentIndex = 0;
      results = [];
      questionStates = [];
      usedAnswers = {};
      renderQuestion();
    } catch (err) {
      Components.showToast(I18n.t('common.error'), 'error');
      console.error(err);
    }
  }

  function shuffleArray(arr) {
    const shuffled = [...arr];
    for (let i = shuffled.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
    }
    return shuffled;
  }

  function getUsedAnswersKey(question) {
    if (!question) return '';
    if (!question.question_type) return question.id;
    const cleanPrompt = (question.question_text || '').replace(/^🎧\s*/, '').split('|||')[0].trim().toLowerCase();
    let target = 'ans';
    if (question.question_type.endsWith('_meaning')) target = 'meaning';
    else if (question.question_type.endsWith('_word')) target = 'word';
    else if (question.question_type.endsWith('_ipa')) target = 'ipa';
    return `${cleanPrompt}_${target}`;
  }

  function renderQuestion() {
    if (currentIndex >= questionsQueue.length) {
      renderResults();
      return;
    }

    const q = questionsQueue[currentIndex];
    currentRetries = q._failedTries || 0;
    answered = false;

    saveProgress();
    const total = questionsQueue.length;
    const progress = ((currentIndex) / total) * 100;

    const main = document.getElementById('main-content');

    // Parse question text and options
    let displayQuestionText = q.question_text;
    let options = [];
    const isMcq = q.question_type && q.question_type.startsWith('mcq_');
    const isListen = q.question_type && (q.question_type.startsWith('fill_listen_') || q.question_type.startsWith('mcq_listen_'));
    const answerKey = getUsedAnswersKey(q);
    const answeredChips = !isMcq ? (usedAnswers[answerKey] || []) : [];

    if (displayQuestionText.includes('|||')) {
      const parts = displayQuestionText.split('|||');
      displayQuestionText = parts[0];
      try { options = JSON.parse(parts[1]); } catch(e) {}
    }

    if (displayQuestionText.startsWith('🎧 ')) {
      displayQuestionText = displayQuestionText.substring(2).trim();
    }

    // Determine TTS language if it's vocab mode
    let langToSpeak = 'en';
    if (currentQuiz.quiz_type === 'vocabulary') {
      const isMeaningPrompt = q.question_type === 'fill_meaning_word' || q.question_type === 'mcq_meaning_word' || q.question_type === 'mcq_meaning_ipa';
      langToSpeak = isMeaningPrompt ? currentQuiz.meaning_lang : currentQuiz.vocab_lang;
    }

    // Build media HTML
    let mediaHTML = '';
    if (q.image_path || q.audio_path) {
      mediaHTML = '<div class="question-media">';
      if (q.image_path) {
        mediaHTML += `<img src="${q.image_path}" alt="Question image" loading="lazy">`;
      }
      if (q.audio_path) {
        mediaHTML += `<audio controls src="${q.audio_path}" onplay="App.applyAudioVolume(this)"></audio>`;
      }
      mediaHTML += '</div>';
    }

    let questionTextHTML = '';
    const isMeaningOrIpaPrompt = q.question_type === 'fill_meaning_word' || 
                                q.question_type === 'mcq_meaning_word' || 
                                q.question_type === 'mcq_meaning_ipa' || 
                                q.question_type === 'fill_ipa_word' || 
                                q.question_type === 'fill_ipa_meaning';

    if (isListen) {
      questionTextHTML = `
        <div style="text-align: center; margin-bottom: 24px;">
          <button class="btn btn-primary btn-lg" onclick="QuizPlayer.playTTS('${Components.escapeHtml(displayQuestionText).replace(/'/g, "\\'")}', '${langToSpeak}')">
            🔊 ${I18n.t('mcq.listenAgain')}
          </button>
        </div>
      `;
      // Auto-play TTS when question appears
      setTimeout(() => playTTS(displayQuestionText, langToSpeak), 300);
    } else {
      // Only show TTS button for vocab mode when it's NOT a meaning or IPA prompt
      let ttsBtn = '';
      if (currentQuiz.quiz_type === 'vocabulary' && !isMeaningOrIpaPrompt) {
        ttsBtn = `<button class="tts-btn" onclick="QuizPlayer.playTTS('${Components.escapeHtml(displayQuestionText).replace(/'/g, "\\'")}', '${langToSpeak}')">🔊</button>`;
      }
      questionTextHTML = `<div class="question-text">${Components.escapeHtml(displayQuestionText)} ${ttsBtn}</div>`;
    }

    // Build Answer HTML
    let answerInputHTML = '';
    const showDontRemember = currentQuiz.quiz_type === 'vocabulary';
    const dontRememberBtnHTML = showDontRemember ? `
      <button class="dont-remember-btn" id="dont-remember-btn" onclick="QuizPlayer.handleDontRemember()">
        ❓ ${I18n.t('play.dontRemember')}
      </button>
    ` : '';

    if (isMcq) {
      answerInputHTML = `
        <div class="mcq-options" id="mcq-options-container">
          ${options.map(opt => `
            <button class="mcq-option" onclick="QuizPlayer.submitMcqAnswer(this, '${Components.escapeHtml(opt).replace(/'/g, "\\'")}')">
              ${Components.escapeHtml(opt)}
            </button>
          `).join('')}
        </div>
        ${showDontRemember ? `
          <div style="display: flex; justify-content: flex-end; margin-top: 12px;">
            ${dontRememberBtnHTML}
          </div>
        ` : ''}
      `;
    } else {
      const placeholderText = (currentQuiz.quiz_type === 'vocabulary' && q.question_type)
        ? I18n.t('qtype.' + q.question_type + '_desc')
        : I18n.t('play.answerPlaceholder');

      answerInputHTML = `
        <div class="answer-input-group">
          <input type="text" class="answer-input" id="answer-input" 
                 placeholder="${placeholderText}"
                 autocomplete="off" spellcheck="false"
                 onkeydown="if(event.key==='Enter' && !event.repeat){ event.preventDefault(); event.stopPropagation(); QuizPlayer.submitAnswer(); }">
          <button class="answer-submit-btn" id="submit-btn" onclick="QuizPlayer.submitAnswer()">
            ${I18n.t('play.submit')}
          </button>
          ${dontRememberBtnHTML}
        </div>
      `;
    }

    // Build question type selector for vocabulary quizzes
    let questionTypeSelectorHTML = '';
    if (currentQuiz.quiz_type === 'vocabulary') {
      questionTypeSelectorHTML = buildQuestionTypeSelector();
    }

    if (currentQuiz.quiz_type === 'vocabulary') {
      const gridSidebarHTML = buildVocabGridHTML();
      main.innerHTML = `
        <div class="vocab-player-layout">
          <div class="vocab-player-main">
            <div class="quiz-progress">
              <div class="progress-bar-container">
                <div class="progress-bar" style="width: ${progress}%"></div>
              </div>
              <div class="progress-info">
                <span>${I18n.t('play.questionOf', { current: currentIndex + 1, total })}</span>
                <span class="retry-count" id="retry-display">
                  🔄 ${I18n.t('play.retries')}: <span id="retry-count">${currentRetries}</span>
                </span>
              </div>
            </div>

            ${q.question_type && !isMcq ? `
              <div class="vocab-hint-banner">
                <span class="vocab-hint-icon">🎯</span>
                <span class="vocab-hint-label">${I18n.t('play.typeHintLabel')}:</span>
                <span class="vocab-hint-text">${I18n.t('qtype.' + q.question_type + '_desc')}</span>
              </div>
            ` : ''}

            <div class="question-card" id="question-card" style="position: relative;">
              <div class="question-card-header-chips" style="position: absolute; top: 16px; right: 16px; display: flex; gap: 6px; flex-wrap: wrap; max-width: 60%; justify-content: flex-end; align-items: center;">
                ${(q._failedTries && q._failedTries > 0) ? `
                  <span class="retry-attempt-badge" style="background: rgba(239, 68, 68, 0.15); color: #f87171; border: 1px solid rgba(239, 68, 68, 0.3); padding: 2px 10px; border-radius: 12px; font-size: 12px; font-weight: 700; display: inline-flex; align-items: center; gap: 4px;">
                    🔄 ${I18n.t('play.retryAttempt', { count: q._failedTries })}
                  </span>
                ` : ''}
                ${answeredChips.map(ans => 
                  `<span style="background: rgba(16, 185, 129, 0.15); color: #10b981; border: 1px solid rgba(16, 185, 129, 0.3); padding: 2px 8px; border-radius: 12px; font-size: 12px; font-weight: 600;">✓ ${Components.escapeHtml(ans)}</span>`
                ).join('')}
              </div>
              <div class="question-number" style="display: flex; align-items: center; gap: 8px; flex-wrap: wrap;">
                <span>${I18n.t('play.questionOf', { current: currentIndex + 1, total })}</span>
                ${q.question_type && !isMcq ? `
                  <span class="vocab-qtype-badge">🎯 ${I18n.t('qtype.' + q.question_type + '_desc')}</span>
                ` : ''}
              </div>
              ${questionTextHTML}
              ${mediaHTML}
              ${answerInputHTML}
              <div class="answer-feedback" id="answer-feedback"></div>
              
              <div class="auto-advance-bar-container" id="auto-advance-container">
                <div class="auto-advance-bar" id="auto-advance-bar"></div>
              </div>
            </div>

            ${questionTypeSelectorHTML}
          </div>
          ${gridSidebarHTML}
        </div>
      `;
    } else {
      main.innerHTML = `
        <div class="quiz-player">
          <div class="quiz-progress">
            <div class="progress-bar-container">
              <div class="progress-bar" style="width: ${progress}%"></div>
            </div>
            <div class="progress-info">
              <span>${I18n.t('play.questionOf', { current: currentIndex + 1, total })}</span>
              <span class="retry-count" id="retry-display">
                🔄 ${I18n.t('play.retries')}: <span id="retry-count">${currentRetries}</span>
              </span>
            </div>
          </div>

          <div class="question-card" id="question-card" style="position: relative;">
            <div class="question-card-header-chips" style="position: absolute; top: 16px; right: 16px; display: flex; gap: 6px; flex-wrap: wrap; max-width: 60%; justify-content: flex-end; align-items: center;">
              ${(q._failedTries && q._failedTries > 0) ? `
                <span class="retry-attempt-badge" style="background: rgba(239, 68, 68, 0.15); color: #f87171; border: 1px solid rgba(239, 68, 68, 0.3); padding: 2px 10px; border-radius: 12px; font-size: 12px; font-weight: 700; display: inline-flex; align-items: center; gap: 4px;">
                  🔄 ${I18n.t('play.retryAttempt', { count: q._failedTries })}
                </span>
              ` : ''}
              ${answeredChips.map(ans => 
                `<span style="background: rgba(16, 185, 129, 0.15); color: #10b981; border: 1px solid rgba(16, 185, 129, 0.3); padding: 2px 8px; border-radius: 12px; font-size: 12px; font-weight: 600;">✓ ${Components.escapeHtml(ans)}</span>`
              ).join('')}
            </div>
            <div class="question-number" style="display: flex; align-items: center; gap: 8px; flex-wrap: wrap;">
              <span>${I18n.t('play.questionOf', { current: currentIndex + 1, total })}</span>
            </div>
            ${questionTextHTML}
            ${mediaHTML}
            ${answerInputHTML}
            <div class="answer-feedback" id="answer-feedback"></div>
            
            <div class="auto-advance-bar-container" id="auto-advance-container">
              <div class="auto-advance-bar" id="auto-advance-bar"></div>
            </div>
          </div>
        </div>
      `;
    }

    // Focus input if fill-in-the-blank
    if (!isMcq) {
      setTimeout(() => {
        document.getElementById('answer-input')?.focus();
      }, 100);
    }

    // Auto-scroll grid container instantly to track active question box without sliding animation
    if (currentQuiz && currentQuiz.quiz_type === 'vocabulary') {
      const currentBox = document.querySelector('.vocab-grid-box.current');
      const gridContainer = document.querySelector('.vocab-grid-container');
      if (currentBox && gridContainer) {
        const boxTop = currentBox.offsetTop;
        const boxBottom = boxTop + currentBox.offsetHeight;
        const containerTop = gridContainer.scrollTop;
        const containerBottom = containerTop + gridContainer.clientHeight;

        if (boxTop < containerTop) {
          gridContainer.scrollTop = Math.max(0, boxTop - 12);
        } else if (boxBottom > containerBottom) {
          gridContainer.scrollTop = boxBottom - gridContainer.clientHeight + 12;
        }
      }
    }
  }

  let activeAudioFallback = null;
  let audioContext = null;

  function getAudioContext() {
    if (!audioContext) {
      const AudioCtx = window.AudioContext || window.webkitAudioContext;
      if (AudioCtx) audioContext = new AudioCtx();
    }
    if (audioContext && audioContext.state === 'suspended') {
      audioContext.resume();
    }
    return audioContext;
  }

  function detectTextLanguage(text, fallbackLang = 'en') {
    if (!text) return fallbackLang || 'en';
    const str = String(text).trim();

    if (/[\u4e00-\u9fa5\u3400-\u4dbf]/.test(str)) {
      return 'zh';
    }
    if (/[\u3040-\u309f\u30a0-\u30ff]/.test(str)) {
      return 'ja';
    }
    if (/[\uac00-\ud7af\u1100-\u11ff]/.test(str)) {
      return 'ko';
    }
    if (/[\u0400-\u04ff]/.test(str)) {
      return 'ru';
    }

    return fallbackLang || 'en';
  }

  function playTTS(text, langCode = 'en') {
    if (!text) return;

    const savedVolume = localStorage.getItem('quizmaster-volume');
    const volumeSetting = savedVolume !== null ? parseFloat(savedVolume) : 0.5;
    const finalVolumeSetting = isNaN(volumeSetting) ? 0.5 : Math.max(0, Math.min(2.0, volumeSetting));

    if (finalVolumeSetting === 0) return;

    const cleanText = text.replace(/<[^>]*>/g, '').trim();
    if (!cleanText) return;

    if ('speechSynthesis' in window) {
      try {
        window.speechSynthesis.cancel();
      } catch(e) {}
    }

    if (activeAudioFallback) {
      try {
        activeAudioFallback.pause();
        activeAudioFallback.currentTime = 0;
      } catch(e) {}
      activeAudioFallback = null;
    }

    const effectiveLang = detectTextLanguage(cleanText, langCode);

    fallbackServerAudio(cleanText, effectiveLang, finalVolumeSetting);
  }

  function fallbackServerAudio(text, langCode, volumeSetting) {
    try {
      const langPrefix = (langCode || 'en').toLowerCase().split('-')[0].split('_')[0];
      const gLang = langPrefix === 'zh' ? 'zh-CN' : langPrefix;

      const audioUrl = `/api/tts?text=${encodeURIComponent(text)}&lang=${gLang}`;
      const audio = new Audio(audioUrl);
      audio.crossOrigin = 'anonymous';

      const gainMultiplier = volumeSetting;

      try {
        const ctx = getAudioContext();
        if (ctx) {
          const source = ctx.createMediaElementSource(audio);
          const gainNode = ctx.createGain();
          gainNode.gain.value = gainMultiplier;
          source.connect(gainNode);
          gainNode.connect(ctx.destination);
        } else {
          audio.volume = Math.min(1.0, gainMultiplier);
        }
      } catch (e) {
        audio.volume = Math.min(1.0, gainMultiplier);
      }

      activeAudioFallback = audio;
      audio.play().catch(e => console.warn('Server audio play error:', e));
    } catch (e) {
      console.warn('Fallback audio failed:', e);
    }
  }

  function getTypeCounts() {
    if (cachedTypeCounts) return cachedTypeCounts;
    const counts = {};
    for (let i = 0; i < allVocabQuestions.length; i++) {
      const t = allVocabQuestions[i].question_type || 'unknown';
      counts[t] = (counts[t] || 0) + 1;
    }
    cachedTypeCounts = counts;
    return counts;
  }

  // Build question type selector buttons for vocabulary quizzes
  function buildQuestionTypeSelector() {
    const typeCounts = getTypeCounts();

    // Define the order and icons for question types
    const typeDefinitions = [
      { key: 'mcq_word_meaning', icon: '⚡', colorClass: 'qtype-mcq' },
      { key: 'mcq_meaning_word', icon: '⚡', colorClass: 'qtype-mcq' },
      { key: 'mcq_word_ipa', icon: '⚡', colorClass: 'qtype-mcq' },
      { key: 'mcq_meaning_ipa', icon: '⚡', colorClass: 'qtype-mcq' },
      { key: 'mcq_ipa_word', icon: '⚡', colorClass: 'qtype-mcq' },
      { key: 'mcq_ipa_meaning', icon: '⚡', colorClass: 'qtype-mcq' },
      { key: 'mcq_listen_word', icon: '⚡', colorClass: 'qtype-mcq' },
      { key: 'mcq_listen_meaning', icon: '⚡', colorClass: 'qtype-mcq' },
      { key: 'fill_word_meaning', icon: '✏️', colorClass: 'qtype-fill' },
      { key: 'fill_meaning_word', icon: '✏️', colorClass: 'qtype-fill' },
      { key: 'fill_ipa_word', icon: '✏️', colorClass: 'qtype-fill' },
      { key: 'fill_ipa_meaning', icon: '✏️', colorClass: 'qtype-fill' },
      { key: 'fill_listen_word', icon: '✏️', colorClass: 'qtype-fill' },
      { key: 'fill_listen_meaning', icon: '✏️', colorClass: 'qtype-fill' },
    ];

    // Only show types that actually have questions
    const availableTypes = typeDefinitions.filter(td => typeCounts[td.key] > 0);
    if (availableTypes.length <= 1) return ''; // No point showing selector if only 1 type

    const allCount = allVocabQuestions.length;
    let buttons = `
      <button class="qtype-chip ${selectedQuestionType === 'all' ? 'active qtype-all' : ''}" 
              onclick="QuizPlayer.filterByQuestionType('all')">
        <span class="qtype-chip-icon">📚</span>
        <span class="qtype-chip-label">${I18n.t('qtype.all')}</span>
        <span class="qtype-chip-count">${allCount}</span>
      </button>
    `;

    availableTypes.forEach(td => {
      const count = typeCounts[td.key];
      const isActive = selectedQuestionType === td.key;
      buttons += `
        <button class="qtype-chip ${isActive ? 'active' : ''} ${td.colorClass}" 
                onclick="QuizPlayer.filterByQuestionType('${td.key}')">
          <span class="qtype-chip-icon">${td.icon}</span>
          <span class="qtype-chip-label">${I18n.t('qtype.' + td.key)}</span>
          <span class="qtype-chip-desc">${I18n.t('qtype.' + td.key + '_desc')}</span>
          <span class="qtype-chip-count">${count}</span>
        </button>
      `;
    });

    return `
      <div class="qtype-selector">
        ${buttons}
      </div>
    `;
  }

  function filterByQuestionType(type) {
    selectedQuestionType = type;
    // Re-filter from allVocabQuestions
    if (type === 'all') {
      questionsQueue = [...allVocabQuestions];
    } else {
      questionsQueue = allVocabQuestions.filter(q => q.question_type === type);
    }
    // Shuffle if enabled
    if (settings.shuffleQuestions) {
      questionsQueue = shuffleArray(questionsQueue);
    }
    // Check if saved progress exists for this qtype
    const saved = currentQuiz ? getSavedProgress(currentQuiz.id, type) : null;
    if (saved && saved.results && saved.results.length > 0) {
      results = (saved.results || []).map(r => ({
        ...r,
        question: r.question || {
          id: r.questionId || r.question?.id,
          question_text: r.questionText || r.question?.question_text,
          question_type: r.questionType || r.question?.question_type,
          correct_answer: r.userAnswer || ''
        }
      }));
      questionStates = Array.isArray(saved.questionStates) ? saved.questionStates : [];
      currentIndex = Math.min(saved.currentIndex !== undefined ? saved.currentIndex : (saved.currentQuestionIndex || 0), Math.max(0, questionsQueue.length - 1));
    } else {
      currentIndex = 0;
      results = [];
      questionStates = [];
    }
    usedAnswers = {};
    renderQuestion();
  }

  function jumpToQuestion(index) {
    if (index < 0 || index >= questionsQueue.length) return;
    if (index === currentIndex) return;
    saveProgress();
    currentIndex = index;
    renderQuestion();
  }

  function setQuestionState(question, queueIndex, status) {
    const key = String(question.id) + '|' + question.question_type + '|' + queueIndex;
    const existing = questionStates.findIndex(s => s.key === key);
    const state = { key, questionId: question.id, questionType: question.question_type, queueIndex, status };
    if (existing >= 0) questionStates[existing] = state;
    else questionStates.push(state);
  }

  function buildVocabGridHTML() {
    if (!currentQuiz || currentQuiz.quiz_type !== 'vocabulary') return '';

    const targetList = questionsQueue;
    if (!targetList || targetList.length === 0) return '';

    const totalN = targetList.length;
    let boxesHTML = '';

    targetList.forEach((q, idx) => {
      const isCurrent = idx === currentIndex;
      
      const state = questionStates.find(s =>
        (s.queueIndex === idx && s.questionType === q.question_type) ||
        (String(s.questionId) === String(q.id) && s.questionType === q.question_type)
      );
      const res = results.find(r =>
        (r.queueIndex !== undefined && r.queueIndex === idx) ||
        r.question === q ||
        (r.question && r.question === q) ||
        ((r.questionId || r.question?.id) && String(r.questionId || r.question?.id) === String(q.id) && (r.questionType || r.question?.question_type) === q.question_type && ((r.questionText || r.question?.question_text) === q.question_text || r.queueIndex === idx))
      );

      let statusClass = 'pending';
      let titleTooltip = `${I18n.t('play.questionOf', { current: idx + 1, total: totalN })}`;

      if (state) {
        statusClass = state.status;
        titleTooltip += `: ${state.status === 'correct' ? I18n.t('play.correct') : I18n.t('play.incorrect')}`;
      } else if (res) {
        statusClass = res.isCorrect ? 'correct' : 'incorrect';
        titleTooltip += `: ${res.isCorrect ? I18n.t('play.correct') : I18n.t('play.incorrect')}`;
      } else if (isCurrent) {
        statusClass = 'current';
        titleTooltip += ` (${I18n.t('play.current')})`;
      }

      if (isCurrent && res) {
        statusClass += ' current';
      }

      const wordLabel = (q._word || q.question_text || '').replace(/^🎧\s*/, '').split('|||')[0].trim();
      if (wordLabel) {
        titleTooltip += ` - ${Components.escapeHtml(wordLabel)}`;
      }

      boxesHTML += `
        <div class="vocab-grid-box ${statusClass}" 
             title="${titleTooltip}"
             onclick="QuizPlayer.jumpToQuestion(${idx})">
          ${idx + 1}
        </div>
      `;
    });

    const answeredCount = questionStates.filter(s => s.status === 'correct' || s.status === 'incorrect').length;

    return `
      <div class="vocab-grid-sidebar">
        <div class="vocab-grid-header">
          <span class="vocab-grid-title">📋 ${I18n.t('play.questionList')}</span>
          <span class="vocab-grid-stats">${answeredCount}/${totalN}</span>
        </div>
        <div class="vocab-grid-container">
          ${boxesHTML}
        </div>
        <div class="vocab-grid-legend">
          <div class="vocab-grid-legend-item">
            <div class="vocab-grid-legend-dot current"></div>
            <span>${I18n.t('play.current')}</span>
          </div>
          <div class="vocab-grid-legend-item">
            <div class="vocab-grid-legend-dot correct"></div>
            <span>${I18n.t('results.correct')}</span>
          </div>
          <div class="vocab-grid-legend-item">
            <div class="vocab-grid-legend-dot incorrect"></div>
            <span>${I18n.t('results.incorrect')}</span>
          </div>
        </div>
      </div>
    `;
  }

  function submitMcqAnswer(btnEl, userAnswer) {
    if (answered) return;
    // Visually mark the selected option immediately
    document.querySelectorAll('.mcq-option').forEach(el => el.classList.remove('selected'));
    btnEl.classList.add('selected');
    // Delegate to submitAnswer logic
    submitAnswer(userAnswer, btnEl);
  }

  function submitAnswer(overrideAnswer = null, btnEl = null) {
    if (answered) {
      if (Date.now() - lastAnswerTime < 150) return;
      const submitBtn = document.getElementById('submit-btn');
      if (submitBtn && typeof submitBtn.onclick === 'function') {
        submitBtn.onclick();
      }
      return;
    }

    let userAnswer = overrideAnswer;
    let input = document.getElementById('answer-input');
    
    if (userAnswer === null) {
      if (!input) return;
      userAnswer = input.value.trim();
    }

    if (!userAnswer) {
      if (input) input.focus();
      return;
    }

    const q = questionsQueue[currentIndex];
    const isMcq = q.question_type && q.question_type.startsWith('mcq_');
    const isCorrect = checkAnswer(userAnswer, q.correct_answer);
    
    const feedback = document.getElementById('answer-feedback');
    let submitBtn = document.getElementById('submit-btn');

    const normalize = (str) => str.trim().toLowerCase().normalize('NFC').replace(/\s+/g, ' ');
    const answerKey = getUsedAnswersKey(q);

    if (isCorrect) {
      const normalizedAnswer = normalize(userAnswer);
      const isDuplicate = !isMcq && !settings.allowDuplicates && (usedAnswers[answerKey] || []).some(a => normalize(a) === normalizedAnswer);

      if (isDuplicate) {
        if (input) {
          input.classList.remove('incorrect', 'correct');
          input.style.borderColor = '#f59e0b';
        }
        feedback.className = 'answer-feedback show';
        feedback.style.color = '#f59e0b';
        feedback.textContent = I18n.t('play.alreadyAnswered');
        return;
      }

      if (!usedAnswers[answerKey]) usedAnswers[answerKey] = [];
      usedAnswers[answerKey].push(userAnswer);

      // Correct!
      answered = true;
      lastAnswerTime = Date.now();

      results.push({
        question: q,
        questionId: q.id,
        questionText: q.question_text,
        questionType: q.question_type,
        queueIndex: currentIndex,
        userAnswer,
        isCorrect: true,
        retries: q._failedTries || 0,
      });
      setQuestionState(q, currentIndex, 'correct');

      saveProgress();

      if (input) {
        input.style.borderColor = '';
        input.classList.add('correct');
        input.classList.remove('incorrect');
      }
      
      if (btnEl) {
        btnEl.classList.add('correct');
      }

      feedback.className = 'answer-feedback show correct';
      feedback.style.color = '';
      feedback.textContent = I18n.t('play.correct');
      
      const proceedFunc = () => {
        currentIndex++;
        renderQuestion();
      };

      if (submitBtn) {
        submitBtn.textContent = currentIndex < questionsQueue.length - 1
          ? I18n.t('play.next') + ' →'
          : I18n.t('play.finish') + ' 🎉';
        submitBtn.onclick = proceedFunc;
      }

      // Auto-advance logic
      const autoDelay = parseInt(localStorage.getItem('quizmaster-auto-advance') || '1500', 10);
      if (autoDelay >= 0) {
        document.querySelectorAll('.mcq-option').forEach(el => el.disabled = true);
        if (autoDelay === 0) {
          requestAnimationFrame(() => {
            proceedFunc();
          });
        } else {
          const container = document.getElementById('auto-advance-container');
          const bar = document.getElementById('auto-advance-bar');
          if (container && bar) {
            container.style.display = 'block';
            setTimeout(() => {
              bar.style.transitionDuration = `${autoDelay}ms`;
              bar.style.width = '100%';
            }, 50);
          }
          setTimeout(proceedFunc, autoDelay);
        }
      }
    } else {
      // Incorrect
      const dontRememberBtn = document.getElementById('dont-remember-btn');
      if (dontRememberBtn) dontRememberBtn.style.display = 'none';

      if (q._word && q._meaning) {
        addWrongWord(q._word, q._meaning, q._ipa);
      }

      const currentFailures = q._failedTries || 0;
      let willRetry = false;
      
      if (settings.maxRetries === -1 || currentFailures < settings.maxRetries) {
        willRetry = true;
        const retryQ = { ...q, _failedTries: currentFailures + 1 };
        const insertIndex = currentIndex + 1 + 7;
        if (insertIndex >= questionsQueue.length) {
          questionsQueue.push(retryQ);
        } else {
          questionsQueue.splice(insertIndex, 0, retryQ);
        }
      } else {
        q._finalFailure = true;
      }

      currentRetries = currentFailures + 1;
      document.getElementById('retry-count').textContent = currentRetries;
      if (input) {
        input.style.borderColor = '';
        input.classList.add('incorrect');
        input.classList.remove('correct');
      }

      if (btnEl) {
        btnEl.classList.add('incorrect');
      }

      // Show correct answer
      feedback.style.color = '';
      const safeCorrectAnswer = String(q.correct_answer || '');
      const displayAnswer = safeCorrectAnswer.includes('/')
        ? safeCorrectAnswer.split('/').join(' / ')
        : safeCorrectAnswer;

      feedback.className = 'answer-feedback show incorrect';
      feedback.innerHTML = I18n.t('play.incorrect', { answer: `<strong>${Components.escapeHtml(displayAnswer)}</strong>` });

      // Highlight the correct button if it's MCQ
      if (isMcq) {
        document.querySelectorAll('.mcq-option').forEach(el => {
          el.disabled = true;
          if (checkAnswer(el.textContent.trim(), q.correct_answer)) {
            el.classList.add('correct');
          }
        });
      }

      // Allow next attempt after showing answer
      answered = true;
      lastAnswerTime = Date.now();
      
      if (!willRetry) {
        results.push({
          question: q,
          questionId: q.id,
          questionText: q.question_text,
          questionType: q.question_type,
          queueIndex: currentIndex,
          userAnswer,
          isCorrect: false,
          retries: currentRetries,
        });
        setQuestionState(q, currentIndex, 'incorrect');
      }

      saveProgress();

      const proceedFunc = () => {
        currentIndex++;
        renderQuestion();
      };

      if (submitBtn) {
        submitBtn.textContent = (currentIndex < questionsQueue.length - 1 || willRetry)
          ? I18n.t('play.next') + ' →'
          : I18n.t('play.finish') + ' 🎉';
        submitBtn.onclick = proceedFunc;
      } else {
        feedback.innerHTML += `<br><button class="btn btn-danger mt-2" onclick="document.getElementById('hidden-next-btn').click()">${(currentIndex < questionsQueue.length - 1 || willRetry) ? I18n.t('play.next') + ' →' : I18n.t('play.finish') + ' 🎉'}</button>`;
        const hiddenBtn = document.createElement('button');
        hiddenBtn.id = 'hidden-next-btn';
        hiddenBtn.style.display = 'none';
        hiddenBtn.onclick = proceedFunc;
        feedback.appendChild(hiddenBtn);
      }
    }
  }

  function handleDontRemember() {
    if (answered) return;
    answered = true;
    lastAnswerTime = Date.now();

    const dontRememberBtn = document.getElementById('dont-remember-btn');
    if (dontRememberBtn) dontRememberBtn.style.display = 'none';

    const q = questionsQueue[currentIndex];
    const isMcq = q.question_type && q.question_type.startsWith('mcq_');
    const feedback = document.getElementById('answer-feedback');
    let submitBtn = document.getElementById('submit-btn');
    let input = document.getElementById('answer-input');

    if (q._word && q._meaning) {
      addWrongWord(q._word, q._meaning, q._ipa);
    }

    const currentFailures = q._failedTries || 0;
    let willRetry = false;
    
    if (settings.maxRetries === -1 || currentFailures < settings.maxRetries) {
      willRetry = true;
      const retryQ = { ...q, _failedTries: currentFailures + 1 };
      const insertIndex = currentIndex + 1 + 7;
      if (insertIndex >= questionsQueue.length) {
        questionsQueue.push(retryQ);
      } else {
        questionsQueue.splice(insertIndex, 0, retryQ);
      }
    } else {
      q._finalFailure = true;
    }

    currentRetries = currentFailures + 1;
    const retryCountEl = document.getElementById('retry-count');
    if (retryCountEl) retryCountEl.textContent = currentRetries;

    if (input) {
      input.style.borderColor = '';
      input.classList.add('incorrect');
      input.classList.remove('correct');
    }

    // Show correct answer
    feedback.style.color = '';
    const safeCorrectAnswer = String(q.correct_answer || '');
    const displayAnswer = safeCorrectAnswer.includes('/')
      ? safeCorrectAnswer.split('/').join(' / ')
      : safeCorrectAnswer;

    feedback.className = 'answer-feedback show incorrect';
    feedback.innerHTML = I18n.t('play.dontRememberFeedback', { answer: `<strong>${Components.escapeHtml(displayAnswer)}</strong>` });

    if (isMcq) {
      document.querySelectorAll('.mcq-option').forEach(el => {
        el.disabled = true;
        if (checkAnswer(el.textContent.trim(), q.correct_answer)) {
          el.classList.add('correct');
        }
      });
    }

    if (!willRetry) {
      results.push({
        question: q,
        questionId: q.id,
        questionText: q.question_text,
        questionType: q.question_type,
        queueIndex: currentIndex,
        userAnswer: I18n.t('play.dontRememberLabel'),
        isCorrect: false,
        retries: currentRetries,
      });
    }

    saveProgress();

    const proceedFunc = () => {
      currentIndex++;
      renderQuestion();
    };

    if (submitBtn) {
      submitBtn.textContent = (currentIndex < questionsQueue.length - 1 || willRetry)
        ? I18n.t('play.next') + ' →'
        : I18n.t('play.finish') + ' 🎉';
      submitBtn.onclick = proceedFunc;
      submitBtn.style.display = 'inline-block';
    } else {
      feedback.innerHTML += `<br><button class="btn btn-primary mt-2" onclick="document.getElementById('hidden-next-btn').click()">${(currentIndex < questionsQueue.length - 1 || willRetry) ? I18n.t('play.next') + ' →' : I18n.t('play.finish') + ' 🎉'}</button>`;
      const hiddenBtn = document.createElement('button');
      hiddenBtn.id = 'hidden-next-btn';
      hiddenBtn.style.display = 'none';
      hiddenBtn.onclick = proceedFunc;
      feedback.appendChild(hiddenBtn);
    }
  }

  function checkAnswer(userAnswer, correctAnswer) {
    if (!correctAnswer) return false;
    const normalize = (str) => String(str || '').trim().toLowerCase()
      .normalize('NFC')
      .replace(/\s+/g, ' ');

    const userNorm = normalize(userAnswer);

    // Support multiple correct answers separated by /
    const acceptedAnswers = String(correctAnswer).split('/').map(a => normalize(a));

    return acceptedAnswers.some(a => a === userNorm);
  }

  function renderResults() {
    clearSavedProgress(currentQuiz ? currentQuiz.id : null);
    const quizTitle = currentQuiz ? currentQuiz.title : '';
    const quizId = currentQuiz ? currentQuiz.id : 0;
    const total = results.length;
    const correct = results.filter(r => r.isCorrect).length;
    const incorrect = total - correct;
    const accuracy = total > 0 ? Math.round((correct / total) * 100) : 0;

    // SVG ring
    const circumference = 2 * Math.PI * 65;
    const offset = circumference - (accuracy / 100) * circumference;

    // Determine ring color
    let ringColor;
    if (accuracy >= 80) ringColor = '#10b981';
    else if (accuracy >= 50) ringColor = '#f59e0b';
    else ringColor = '#ef4444';

    const main = document.getElementById('main-content');
    main.innerHTML = `
      <div class="results-container">
        <div class="page-header text-center" style="margin-bottom: 20px;">
          <h1>${I18n.t('results.title')}</h1>
          <p style="font-size: 16px; color: var(--text-secondary); margin-top: 4px;">${Components.escapeHtml(quizTitle)}</p>
        </div>

        <div class="score-ring-container">
          <div class="score-ring">
            <svg width="160" height="160" viewBox="0 0 160 160">
              <circle class="score-ring-bg" cx="80" cy="80" r="65"/>
              <circle class="score-ring-fill" cx="80" cy="80" r="65"
                      stroke="${ringColor}"
                      stroke-dasharray="${circumference}"
                      stroke-dashoffset="${circumference}"
                      id="score-ring-circle"/>
            </svg>
            <div class="score-ring-text">
              <span class="score-percentage" id="score-text">0%</span>
              <span class="score-label">${I18n.t('results.accuracy')}</span>
            </div>
          </div>
        </div>

        <div class="results-summary">
          <div class="stat-card">
            <div class="stat-value correct-color">${correct}</div>
            <div class="stat-label">${I18n.t('results.correct')}</div>
          </div>
          <div class="stat-card">
            <div class="stat-value incorrect-color">${incorrect}</div>
            <div class="stat-label">${I18n.t('results.incorrect')}</div>
          </div>
          <div class="stat-card">
            <div class="stat-value total-color">${total}</div>
            <div class="stat-label">${I18n.t('results.total')}</div>
          </div>
          <div class="stat-card">
            <div class="stat-value accuracy-color">${accuracy}%</div>
            <div class="stat-label">${I18n.t('results.accuracy')}</div>
          </div>
        </div>

        <div class="card">
          <div class="results-filter" id="results-filter">
            <button class="filter-btn active" onclick="QuizPlayer.filterResults('all')">${I18n.t('results.filterAll')} (${total})</button>
            <button class="filter-btn" onclick="QuizPlayer.filterResults('correct')">${I18n.t('results.filterCorrect')} (${correct})</button>
            <button class="filter-btn" onclick="QuizPlayer.filterResults('incorrect')">${I18n.t('results.filterIncorrect')} (${incorrect})</button>
          </div>
          <div id="results-list">
            ${renderResultItems('all')}
          </div>
        </div>

        <div class="fixed-bottom-bar">
          <div class="fixed-bottom-bar-inner" style="max-width: 800px; justify-content: center; gap: 16px;">
            <button class="btn btn-ghost btn-lg" style="flex: 1; max-width: 280px; font-weight: 600;" onclick="App.navigate('dashboard')">
              ← ${I18n.t('results.backToList')}
            </button>
            ${quizId ? `<button class="btn btn-primary btn-lg" style="flex: 1; max-width: 280px; font-weight: 700; border-radius: 12px;" onclick="QuizPlayer.startQuiz(${quizId})">
              🔄 ${I18n.t('results.playAgain')}
            </button>` : ''}
          </div>
        </div>
      </div>
    `;

    try { window.scrollTo({ top: 0, behavior: 'smooth' }); } catch(e) {}

    // Animate score ring
    setTimeout(() => {
      const circle = document.getElementById('score-ring-circle');
      if (circle) {
        circle.style.strokeDashoffset = offset;
      }
      // Animate percentage text
      animateCounter('score-text', 0, accuracy, 1000);
    }, 200);
  }

  function animateCounter(elementId, start, end, duration) {
    const el = document.getElementById(elementId);
    if (!el) return;
    const startTime = performance.now();
    function update(currentTime) {
      const elapsed = currentTime - startTime;
      const progress = Math.min(elapsed / duration, 1);
      const eased = 1 - Math.pow(1 - progress, 3); // easeOutCubic
      const current = Math.round(start + (end - start) * eased);
      el.textContent = current + '%';
      if (progress < 1) requestAnimationFrame(update);
    }
    requestAnimationFrame(update);
  }

  function renderResultItems(filter) {
    let filtered = results;
    if (filter === 'correct') filtered = results.filter(r => r.isCorrect);
    else if (filter === 'incorrect') filtered = results.filter(r => !r.isCorrect);

    if (filtered.length === 0) {
      return `<div class="text-center text-muted" style="padding: 24px;">—</div>`;
    }

    return filtered.map((r, i) => {
      const icon = r.isCorrect ? '✅' : '❌';
      
      // Clean up display question text (remove ||| options and 🎧 prefix)
      let displayQText = r.question.question_text || '';
      if (displayQText.includes('|||')) {
        displayQText = displayQText.split('|||')[0];
      }
      if (displayQText.startsWith('🎧 ')) {
        displayQText = displayQText.substring(2).trim();
      }

      const displayAnswer = r.question.correct_answer.includes('/')
        ? r.question.correct_answer.split('/').join(' / ')
        : r.question.correct_answer;

      let answerDetail;
      if (r.isCorrect) {
        answerDetail = `
          <span>${I18n.t('results.yourAnswer')}: <strong class="text-success">${Components.escapeHtml(r.userAnswer)}</strong></span>
          <br>
          <span>${I18n.t('results.correctAnswer')}: <span class="correct-answer-label">${Components.escapeHtml(displayAnswer)}</span></span>
        `;
      } else {
        answerDetail = `
          <span>${I18n.t('results.yourAnswer')}: <span class="user-answer-wrong">${Components.escapeHtml(r.userAnswer || I18n.t('results.noAnswer'))}</span></span>
          <br>
          <span>${I18n.t('results.correctAnswer')}: <span class="correct-answer-label">${Components.escapeHtml(displayAnswer)}</span></span>
        `;
      }

      const retriesText = r.retries > 0
        ? `<div class="result-retries">🔄 ${r.retries} ${I18n.t('results.retries')}</div>`
        : '';

      return `
        <div class="result-item">
          <span class="result-icon">${icon}</span>
          <div class="result-content">
            <div class="result-question">${Components.escapeHtml(displayQText)}</div>
            <div class="result-answer">${answerDetail}</div>
            ${retriesText}
          </div>
        </div>
      `;
    }).join('');
  }

  function filterResults(filter) {
    // Update filter buttons
    document.querySelectorAll('#results-filter .filter-btn').forEach(btn => {
      btn.classList.remove('active');
    });
    event.target.classList.add('active');

    // Re-render results
    document.getElementById('results-list').innerHTML = renderResultItems(filter);
  }

  return {
    renderSelectScreen,
    setPlayMode,
    startQuiz,
    resumeQuiz,
    saveProgress,
    getSavedProgress,
    clearSavedProgress,
    submitAnswer,
    submitMcqAnswer,
    playTTS,
    filterResults,
    filterByQuestionType,
    handleDontRemember,
    jumpToQuestion,
  };
})();

window.QuizPlayer = QuizPlayer;
