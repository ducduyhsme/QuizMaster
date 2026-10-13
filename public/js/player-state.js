// ============================================
// Player State - Game State & Progress Manager
// ============================================

const PlayerState = (() => {
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
  let isGridCollapsedOnMobile = true;
  let vocabInputMode = localStorage.getItem('quizmaster-vocab-input-mode') || 'input';
  let flashcardFlipped = false;
  let currentOptions = [];
  let currentPromptText = '';
  let currentPromptLang = 'en';
  let saveProgressTimer = null;
  const deletedQtypesSet = new Set();

  function clearInMemoryState() {
    currentQuiz = null;
    questionsQueue = [];
    results = [];
    questionStates = [];
    usedAnswers = {};
    selectedQuestionType = 'all';
    flashcardFlipped = false;
    currentOptions = [];
    currentPromptText = '';
    currentPromptLang = 'en';
    deletedQtypesSet.clear();
  }

  function getProgressKeyPrefix() {
    return window.Utils ? Utils.getProgressKeyPrefix() : 'quizmaster-progress-u1-';
  }

  function saveProgress() {
    if (!currentQuiz || !currentQuiz.id) return Promise.resolve();
    if (saveProgressTimer) clearTimeout(saveProgressTimer);

    const effectiveQtype = selectedQuestionType || 'all';
    const deleteKey = currentQuiz.id + '_' + effectiveQtype;
    if (deletedQtypesSet.has(deleteKey) || deletedQtypesSet.has(currentQuiz.id + '_all')) {
      return Promise.resolve();
    }

    try {
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

      localStorage.setItem(getProgressKeyPrefix() + currentQuiz.id + '_' + effectiveQtype, JSON.stringify(progressData));
      if (effectiveQtype === 'all') {
        localStorage.setItem(getProgressKeyPrefix() + currentQuiz.id, JSON.stringify(progressData));
      }

      const payload = JSON.stringify({
        quizId: currentQuiz.id,
        qtype: effectiveQtype,
        sessionData: progressData,
        token: authToken,
        userId: currentUserId
      });

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

      localStorage.setItem(getProgressKeyPrefix() + currentQuiz.id + '_' + qtype, JSON.stringify(qtypeProgressData));

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

      localStorage.setItem(getProgressKeyPrefix() + currentQuiz.id + '_all', JSON.stringify(allProgressData));
      localStorage.setItem(getProgressKeyPrefix() + currentQuiz.id, JSON.stringify(allProgressData));

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
      const currentUserId = window.Utils ? Utils.getCurrentUserId() : 1;

      if (targetQtype && targetQtype !== 'all') {
        if (deletedQtypesSet.has(quizId + '_' + targetQtype)) return null;
        let qData = localStorage.getItem(getProgressKeyPrefix() + quizId + '_' + targetQtype);
        if (!qData && currentUserId === 1) {
          qData = localStorage.getItem('quizmaster-progress-' + quizId + '_' + targetQtype);
          if (qData) {
            localStorage.setItem(getProgressKeyPrefix() + quizId + '_' + targetQtype, qData);
          }
        }
        if (qData) {
          try {
            const parsed = JSON.parse(qData);
            if (parsed) return parsed;
          } catch (e) {}
        }
      }

      if (targetQtype === 'all') {
        if (deletedQtypesSet.has(quizId + '_all')) return null;
        let allData = localStorage.getItem(getProgressKeyPrefix() + quizId + '_all') || localStorage.getItem(getProgressKeyPrefix() + quizId);
        if (!allData && currentUserId === 1) {
          allData = localStorage.getItem('quizmaster-progress-' + quizId + '_all') || localStorage.getItem('quizmaster-progress-' + quizId);
          if (allData) {
            localStorage.setItem(getProgressKeyPrefix() + quizId + '_all', allData);
          }
        }
        if (allData) {
          try {
            const parsed = JSON.parse(allData);
            if (parsed) return parsed;
          } catch (e) {}
        }
      }

      if (!targetQtype) {
        let best = null;
        const prefix = getProgressKeyPrefix() + quizId;
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

  function resetQuizProgressState(quizId) {
    if (quizId) {
      for (const key of deletedQtypesSet) {
        if (key.startsWith(quizId + '_')) {
          deletedQtypesSet.delete(key);
        }
      }
    }
  }

  function clearSavedProgress(quizId, targetQtype = null, clearInMemory = false) {
    if (!quizId) return Promise.resolve();
    if (saveProgressTimer) clearTimeout(saveProgressTimer);

    const effectiveQtype = targetQtype || selectedQuestionType || 'all';
    const deleteKey = quizId + '_' + effectiveQtype;
    deletedQtypesSet.add(deleteKey);

    localStorage.removeItem(getProgressKeyPrefix() + quizId + '_' + effectiveQtype);

    if (effectiveQtype === 'all') {
      deletedQtypesSet.add(quizId + '_all');
      localStorage.removeItem(getProgressKeyPrefix() + quizId + '_all');
      localStorage.removeItem(getProgressKeyPrefix() + quizId);
    } else {
      [getProgressKeyPrefix() + quizId + '_all', getProgressKeyPrefix() + quizId].forEach(allKey => {
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

    if (clearInMemory && currentQuiz && Number(currentQuiz.id) === Number(quizId)) {
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

  function shuffleArray(arr) {
    const shuffled = [...arr];
    for (let i = shuffled.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
    }
    return shuffled;
  }

  function checkAnswer(userAnswer, correctAnswer) {
    if (!correctAnswer) return false;
    const normalize = (str) => Utils ? Utils.normalizeText(str) : String(str || '').trim().toLowerCase().normalize('NFC').replace(/\s+/g, ' ');

    const userNorm = normalize(userAnswer);
    const acceptedAnswers = String(correctAnswer).split('/').map(a => normalize(a));

    return acceptedAnswers.some(a => a === userNorm);
  }

  function setQuestionState(question, queueIndex, status) {
    const key = String(question.id) + '|' + question.question_type + '|' + queueIndex;
    const existing = questionStates.findIndex(s => s.key === key);
    const state = { key, questionId: question.id, questionType: question.question_type, queueIndex, status };
    if (existing >= 0) questionStates[existing] = state;
    else questionStates.push(state);
  }

  function getUsedAnswersKey(question) {
    if (!question) return '';
    const cleanPrompt = (question.question_text || '').replace(/^🎧\s*/, '').split('|||')[0].trim().toLowerCase();
    const qType = question.question_type || 'default';
    if (question.id) {
      return `${question.id}_${qType}_${cleanPrompt}`;
    }
    return `${qType}_${cleanPrompt}`;
  }

  function attachWordMetadataToQuestions(questions) {
    if (!questions || questions.length === 0) return;

    const wordToMeanings = new Map();
    const wordToIpas = new Map();
    const meaningToWords = new Map();
    const meaningToIpas = new Map();
    const ipaToWords = new Map();
    const ipaToMeanings = new Map();

    const split = (str) => String(str || '').split('/').map(s => s.trim()).filter(Boolean);

    questions.forEach(q => {
      const qtype = q.question_type || '';
      const ipas = split(q.ipa);
      let words = [];
      let meanings = [];

      if (qtype === 'fill_word_meaning' || qtype === 'mcq_word_meaning') {
        words = split((q.question_text || '').replace(/^🎧\s*/, '').split('|||')[0]);
        meanings = split(q.correct_answer);
      } else if (qtype === 'fill_meaning_word' || qtype === 'mcq_meaning_word') {
        words = split(q.correct_answer);
        meanings = split((q.question_text || '').replace(/^🎧\s*/, '').split('|||')[0]);
      } else if (qtype === 'fill_listen_meaning' || qtype === 'mcq_listen_meaning') {
        words = split((q.question_text || '').replace(/^🎧\s*/, '').split('|||')[0]);
        meanings = split(q.correct_answer);
      } else if (qtype === 'fill_listen_word' || qtype === 'mcq_listen_word') {
        words = split(q.correct_answer);
      } else if (qtype === 'fill_word_ipa' || qtype === 'mcq_word_ipa') {
        words = split((q.question_text || '').replace(/^🎧\s*/, '').split('|||')[0]);
        split(q.correct_answer).forEach(p => ipas.push(p));
      } else if (qtype === 'fill_meaning_ipa' || qtype === 'mcq_meaning_ipa') {
        meanings = split((q.question_text || '').replace(/^🎧\s*/, '').split('|||')[0]);
        split(q.correct_answer).forEach(p => ipas.push(p));
      } else if (qtype === 'fill_ipa_word' || qtype === 'mcq_ipa_word') {
        words = split(q.correct_answer);
        split((q.question_text || '').replace(/^🎧\s*/, '').split('|||')[0]).forEach(p => ipas.push(p));
      } else if (qtype === 'fill_ipa_meaning' || qtype === 'mcq_ipa_meaning') {
        meanings = split(q.correct_answer);
        split((q.question_text || '').replace(/^🎧\s*/, '').split('|||')[0]).forEach(p => ipas.push(p));
      }

      words.forEach(w => {
        const lw = w.toLowerCase();
        if (!wordToMeanings.has(lw)) wordToMeanings.set(lw, new Set());
        if (!wordToIpas.has(lw)) wordToIpas.set(lw, new Set());
        meanings.forEach(m => wordToMeanings.get(lw).add(m));
        ipas.forEach(p => wordToIpas.get(lw).add(p));
      });

      meanings.forEach(m => {
        const lm = m.toLowerCase();
        if (!meaningToWords.has(lm)) meaningToWords.set(lm, new Set());
        if (!meaningToIpas.has(lm)) meaningToIpas.set(lm, new Set());
        words.forEach(w => meaningToWords.get(lm).add(w));
        ipas.forEach(p => meaningToIpas.get(lm).add(p));
      });

      ipas.forEach(p => {
        const lp = p.toLowerCase();
        if (!ipaToWords.has(lp)) ipaToWords.set(lp, new Set());
        if (!ipaToMeanings.has(lp)) ipaToMeanings.set(lp, new Set());
        words.forEach(w => ipaToWords.get(lp).add(w));
        meanings.forEach(m => ipaToMeanings.get(lp).add(m));
      });
    });

    questions.forEach(q => {
      const qtype = q.question_type || '';
      const cleanPrompt = (q.question_text || '').replace(/^🎧\s*/, '').split('|||')[0].trim();
      const cleanAns = (q.correct_answer || '').trim();

      const resolvedWords = new Set();
      const resolvedMeanings = new Set();
      const resolvedIpas = new Set();

      if (q.ipa) {
        split(q.ipa).forEach(p => resolvedIpas.add(p));
      }

      if (qtype.includes('word_meaning') || qtype.includes('listen_meaning')) {
        split(cleanPrompt).forEach(w => resolvedWords.add(w));
        split(cleanAns).forEach(m => resolvedMeanings.add(m));
      } else if (qtype.includes('meaning_word')) {
        split(cleanPrompt).forEach(m => resolvedMeanings.add(m));
        split(cleanAns).forEach(w => resolvedWords.add(w));
      } else if (qtype.includes('listen_word')) {
        split(cleanPrompt).forEach(w => resolvedWords.add(w));
        split(cleanAns).forEach(w => resolvedWords.add(w));
      } else if (qtype.includes('word_ipa')) {
        split(cleanPrompt).forEach(w => resolvedWords.add(w));
        split(cleanAns).forEach(p => resolvedIpas.add(p));
      } else if (qtype.includes('meaning_ipa')) {
        split(cleanPrompt).forEach(m => resolvedMeanings.add(m));
        split(cleanAns).forEach(p => resolvedIpas.add(p));
      } else if (qtype.includes('ipa_word')) {
        split(cleanAns).forEach(w => resolvedWords.add(w));
        split(cleanPrompt).forEach(p => resolvedIpas.add(p));
      } else if (qtype.includes('ipa_meaning')) {
        split(cleanAns).forEach(m => resolvedMeanings.add(m));
        split(cleanPrompt).forEach(p => resolvedIpas.add(p));
      } else {
        if (cleanPrompt) resolvedWords.add(cleanPrompt);
        if (cleanAns) resolvedMeanings.add(cleanAns);
      }

      // Expand using maps
      Array.from(resolvedWords).forEach(w => {
        const lw = w.toLowerCase();
        (wordToMeanings.get(lw) || []).forEach(m => resolvedMeanings.add(m));
        (wordToIpas.get(lw) || []).forEach(p => resolvedIpas.add(p));
      });
      Array.from(resolvedMeanings).forEach(m => {
        const lm = m.toLowerCase();
        (meaningToWords.get(lm) || []).forEach(w => resolvedWords.add(w));
        (meaningToIpas.get(lm) || []).forEach(p => resolvedIpas.add(p));
      });
      Array.from(resolvedIpas).forEach(p => {
        const lp = p.toLowerCase();
        (ipaToWords.get(lp) || []).forEach(w => resolvedWords.add(w));
        (ipaToMeanings.get(lp) || []).forEach(m => resolvedMeanings.add(m));
      });

      q._word = Array.from(resolvedWords).join(' / ') || cleanPrompt;
      q._meaning = Array.from(resolvedMeanings).join(' / ') || cleanAns;
      q._ipa = Array.from(resolvedIpas).join(' / ') || q.ipa || '';
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

  // Lifecycle listeners
  window.addEventListener('beforeunload', () => saveProgress());
  window.addEventListener('pagehide', () => saveProgress());
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'hidden') saveProgress();
  });
  window.addEventListener('hashchange', () => saveProgress());

  return {
    get currentQuiz() { return currentQuiz; },
    set currentQuiz(v) { currentQuiz = v; },
    get questionsQueue() { return questionsQueue; },
    set questionsQueue(v) { questionsQueue = v; },
    get currentIndex() { return currentIndex; },
    set currentIndex(v) { currentIndex = v; },
    get results() { return results; },
    set results(v) { results = v; },
    get questionStates() { return questionStates; },
    set questionStates(v) { questionStates = v; },
    get currentRetries() { return currentRetries; },
    set currentRetries(v) { currentRetries = v; },
    get answered() { return answered; },
    set answered(v) { answered = v; },
    get lastAnswerTime() { return lastAnswerTime; },
    set lastAnswerTime(v) { lastAnswerTime = v; },
    get settings() { return settings; },
    set settings(v) { settings = v; },
    get usedAnswers() { return usedAnswers; },
    set usedAnswers(v) { usedAnswers = v; },
    get allVocabQuestions() { return allVocabQuestions; },
    set allVocabQuestions(v) { allVocabQuestions = v; },
    get selectedQuestionType() { return selectedQuestionType; },
    set selectedQuestionType(v) { selectedQuestionType = v; },
    get currentPlayMode() { return currentPlayMode; },
    set currentPlayMode(v) { currentPlayMode = v; },
    get cachedPlayQuizzes() { return cachedPlayQuizzes; },
    set cachedPlayQuizzes(v) { cachedPlayQuizzes = v; },
    get isGridCollapsedOnMobile() { return isGridCollapsedOnMobile; },
    set isGridCollapsedOnMobile(v) { isGridCollapsedOnMobile = v; },
    get vocabInputMode() { return vocabInputMode; },
    set vocabInputMode(v) { 
      vocabInputMode = v; 
      try { localStorage.setItem('quizmaster-vocab-input-mode', v); } catch(e){}
    },
    get flashcardFlipped() { return flashcardFlipped; },
    set flashcardFlipped(v) { flashcardFlipped = !!v; },
    get currentOptions() { return currentOptions; },
    set currentOptions(v) { currentOptions = v || []; },
    get currentPromptText() { return currentPromptText; },
    set currentPromptText(v) { currentPromptText = v || ''; },
    get currentPromptLang() { return currentPromptLang; },
    set currentPromptLang(v) { currentPromptLang = v || 'en'; },
    
    clearInMemoryState,
    saveProgress,
    saveVocabPerQtypeProgress,
    getSavedProgress,
    clearSavedProgress,
    resetQuizProgressState,
    shuffleArray,
    checkAnswer,
    setQuestionState,
    getUsedAnswersKey,
    attachWordMetadataToQuestions,
    addWrongWord
  };
})();

window.PlayerState = PlayerState;
