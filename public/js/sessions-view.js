const SessionsView = (() => {
  const containerId = 'main-content';
  const sessionDataStore = new Map();

  function getCurrentUserObj() {
    return window.Utils ? Utils.getCurrentUserObj() : null;
  }

  function getCurrentUserId() {
    return window.Utils ? Utils.getCurrentUserId() : 1;
  }

  function getProgressKeyPrefix() {
    return window.Utils ? Utils.getProgressKeyPrefix() : `quizmaster-progress-u${getCurrentUserId()}-`;
  }

  const QTYPE_NAMES = {
    fill_word_meaning: 'Từ ➔ Nghĩa (Điền từ)',
    mcq_word_meaning: 'Từ ➔ Nghĩa (Trắc nghiệm)',
    fill_meaning_word: 'Nghĩa ➔ Từ (Điền từ)',
    mcq_meaning_word: 'Nghĩa ➔ Từ (Trắc nghiệm)',
    fill_listen_word: 'Nghe ➔ Gõ từ (Điền từ)',
    fill_listen_meaning: 'Nghe ➔ Chọn nghĩa (Điền từ)',
    mcq_listen_word: 'Nghe ➔ Chọn từ (Trắc nghiệm)',
    mcq_listen_meaning: 'Nghe ➔ Chọn nghĩa (Trắc nghiệm)',
    fill_ipa_word: 'Phiên âm IPA ➔ Từ',
    fill_ipa_meaning: 'Phiên âm IPA ➔ Nghĩa',
    mcq_ipa_word: 'Phiên âm IPA ➔ Chọn từ',
    mcq_ipa_meaning: 'Phiên âm IPA ➔ Chọn nghĩa',
    mcq_word_ipa: 'Từ ➔ Chọn phiên âm IPA'
  };

  function getQtypeName(qtype) {
    if (qtype === 'all') return I18n.t('qtype.all');
    const mainType = I18n.t(`qtype.${qtype}`);
    const descType = I18n.t(`qtype.${qtype}_desc`);
    if (mainType && descType && !mainType.startsWith('qtype.') && !descType.startsWith('qtype.')) {
      return `${descType} (${mainType})`;
    }
    return QTYPE_NAMES[qtype] || (mainType && !mainType.startsWith('qtype.') ? mainType : qtype);
  }

  function getCollapsedSet() {
    try {
      const stored = localStorage.getItem('quizmaster-collapsed-sessions');
      return new Set(stored ? JSON.parse(stored) : []);
    } catch (e) {
      return new Set();
    }
  }

  function saveCollapsedSet(setObj) {
    try {
      localStorage.setItem('quizmaster-collapsed-sessions', JSON.stringify(Array.from(setObj)));
    } catch (e) {}
  }

  function mergeLocalProgressGroups(serverGroups) {
    const groupsMap = new Map();
    (serverGroups || []).forEach(group => {
      groupsMap.set(Number(group.quiz_id), {
        ...group,
        sessions: [...(group.sessions || [])]
      });
    });

    const currentUserId = getCurrentUserId();
    const userPrefix = getProgressKeyPrefix();

    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i);
      if (!key) continue;

      const isUserKey = key.startsWith(userPrefix);
      const isLegacyKey = (currentUserId === 1) && !isUserKey && key.startsWith('quizmaster-progress-') && !key.startsWith('quizmaster-progress-u');

      if (!isUserKey && !isLegacyKey) continue;

      try {
        const parsed = JSON.parse(localStorage.getItem(key));
        if (!parsed || !parsed.quizId) continue;

        const quizId = Number(parsed.quizId);
        let qtype = parsed.selectedQuestionType || 'all';
        const keyPrefix = isUserKey ? (userPrefix + quizId) : ('quizmaster-progress-' + quizId);

        if (key === keyPrefix || key === keyPrefix + '_all') {
          qtype = 'all';
        } else if (key.startsWith(keyPrefix + '_')) {
          qtype = key.substring(keyPrefix.length + 1);
        }

        if (isLegacyKey) {
          const migratedKey = userPrefix + quizId + '_' + qtype;
          localStorage.setItem(migratedKey, JSON.stringify(parsed));
        }

        if (!groupsMap.has(quizId)) {
          groupsMap.set(quizId, {
            quiz_id: quizId,
            quiz_title: parsed.quizTitle || `Quiz #${quizId}`,
            quiz_code: '',
            quiz_type: parsed.quizType || 'vocabulary',
            sessions: []
          });
        }

        const group = groupsMap.get(quizId);
        const localIndex = parsed.currentIndex !== undefined ? parsed.currentIndex : (parsed.currentQuestionIndex || 0);
        const localUpdatedAt = parsed.updatedAt || Date.now();
        const existingIndex = group.sessions.findIndex(s => s.qtype === qtype);
        const existing = existingIndex >= 0 ? group.sessions[existingIndex] : null;
        const existingTime = existing ? (existing.updated_at ? new Date(existing.updated_at).getTime() : 0) : 0;

        const localSession = {
          session_id: existing ? existing.session_id : 0,
          qtype,
          updated_at: localUpdatedAt,
          current_index: localIndex,
          total_questions: parsed.queue ? parsed.queue.length : 1,
          session_data: parsed
        };

        if (!existing) {
          group.sessions.push(localSession);
        } else if (localUpdatedAt >= existingTime) {
          group.sessions[existingIndex] = localSession;
        }
      } catch (e) {}
    }

    return Array.from(groupsMap.values()).filter(g => g.sessions && g.sessions.length > 0);
  }

  async function render() {
    const container = document.getElementById(containerId);
    if (!container) return;

    sessionDataStore.clear();
    const collapsedSet = getCollapsedSet();

    container.innerHTML = `
      <div class="page-header">
        <h1>🎮 ${I18n.t('sessions.title')}</h1>
        <p>${I18n.t('sessions.subtitle')}</p>
      </div>
      <div class="flex justify-center items-center" style="padding: 40px;">
        <div class="spinner"></div>
      </div>
    `;

    try {
      const res = await fetch('/api/sessions/vocab');
      if (!res.ok) throw new Error(I18n.t('common.error'));
      const groups = mergeLocalProgressGroups(await res.json());

      if (!groups || groups.length === 0) {
        container.innerHTML = `
          <div class="page-header">
            <h1>🎮 ${I18n.t('sessions.title')}</h1>
            <p>${I18n.t('sessions.subtitle')}</p>
          </div>
          <div class="card text-center" style="padding: 48px 24px;">
            <div style="font-size: 48px; margin-bottom: 16px;">📂</div>
            <h3 style="font-size: 18px; font-weight: 700; color: var(--text-primary); margin-bottom: 8px;">
              ${I18n.t('sessions.emptyTitle')}
            </h3>
            <p style="font-size: 14px; color: var(--text-secondary); max-width: 400px; margin: 0 auto 24px;">
              ${I18n.t('sessions.emptyHint')}
            </p>
            <a href="#dashboard" class="btn btn-primary">${I18n.t('sessions.viewQuizzes')}</a>
          </div>
        `;
        return;
      }

      let groupsHTML = groups.map(g => {
        const quizTitle = Components.escapeHtml(g.quiz_title);
        const quizId = g.quiz_id;
        const isVocab = g.quiz_type === 'vocabulary';
        const isCollapsed = collapsedSet.has(quizId);

        const modeBadgeHTML = isVocab
          ? `<span class="badge" style="background: rgba(168, 85, 247, 0.15); color: #a855f7; border: 1px solid rgba(168, 85, 247, 0.3); padding: 3px 10px; border-radius: 12px; font-size: 12px; font-weight: 700; margin-left: 8px;">${I18n.t('sessions.modeVocab')}</span>`
          : `<span class="badge" style="background: rgba(34, 197, 94, 0.15); color: #22c55e; border: 1px solid rgba(34, 197, 94, 0.3); padding: 3px 10px; border-radius: 12px; font-size: 12px; font-weight: 700; margin-left: 8px;">${I18n.t('sessions.modeQuestion')}</span>`;

        // Collect all distinct session qtypes for this quiz from server & localStorage
        const sessionsMap = new Map();
        (g.sessions || []).forEach(s => {
          sessionsMap.set(s.qtype, { ...s });
        });

        const currentUserId = getCurrentUserId();
        const userPrefix = getProgressKeyPrefix();
        const prefix = userPrefix + quizId;
        const legacyPrefix = 'quizmaster-progress-' + quizId;

        for (let i = 0; i < localStorage.length; i++) {
          const key = localStorage.key(i);
          if (!key) continue;

          const isUserKey = key === prefix || key.startsWith(prefix + '_');
          const isLegacyKey = (currentUserId === 1) && (key === legacyPrefix || (key.startsWith(legacyPrefix + '_') && !key.startsWith('quizmaster-progress-u')));

          if (isUserKey || isLegacyKey) {
            try {
              const parsed = JSON.parse(localStorage.getItem(key));
              if (parsed && Number(parsed.quizId) === Number(quizId)) {
                let qtype = parsed.selectedQuestionType || 'all';
                const curPrefix = isUserKey ? prefix : legacyPrefix;
                if (key === curPrefix + '_all' || key === curPrefix) {
                  qtype = 'all';
                } else if (key.startsWith(curPrefix + '_')) {
                  qtype = key.substring(curPrefix.length + 1);
                }

                if (isLegacyKey) {
                  localStorage.setItem(prefix + '_' + qtype, JSON.stringify(parsed));
                }

                const localIndex = parsed.currentIndex !== undefined ? parsed.currentIndex : (parsed.currentQuestionIndex || 0);
                const localUpdatedAt = parsed.updatedAt || Date.now();

                const existing = sessionsMap.get(qtype);
                const existingTime = existing ? (existing.updated_at ? new Date(existing.updated_at).getTime() : 0) : 0;
                if (!existing || localUpdatedAt >= existingTime) {
                  sessionsMap.set(qtype, {
                    session_id: existing ? existing.session_id : 0,
                    qtype: qtype,
                    updated_at: localUpdatedAt,
                    current_index: localIndex,
                    total_questions: parsed.queue ? parsed.queue.length : 1,
                    session_data: parsed
                  });
                }
              }
            } catch (e) {}
          }
        }

        const allSessions = Array.from(sessionsMap.values());

        const sessionItemsHTML = allSessions.map(s => {
          let sData = s.session_data;
          let sCurrentIndex = s.current_index;
          let sUpdatedAt = typeof s.updated_at === 'number' ? s.updated_at : (s.updated_at ? new Date(s.updated_at).getTime() : Date.now());

          sessionDataStore.set(`${quizId}_${s.qtype}`, sData);

          const qtypeName = getQtypeName(s.qtype);
          const current = sData && sData.currentIndex !== undefined
            ? Math.max(0, sData.currentIndex)
            : ((sData && Array.isArray(sData.results)) ? sData.results.length : Math.max(0, sCurrentIndex));
          const total = (sData && sData.queue && sData.queue.length > 0) ? sData.queue.length : (s.total_questions || 1);
          const percent = Math.min(100, Math.round((current / total) * 100));
          const timeStr = new Date(sUpdatedAt).toLocaleString(I18n.getLang() === 'vi' ? 'vi-VN' : 'en-US');

          return `
            <div class="session-file-item card" id="session-item-${quizId}-${s.qtype}" style="margin-bottom: 12px; border-left: 4px solid var(--text-accent); padding: 16px;">
              <div style="display: flex; justify-content: space-between; align-items: center; flex-wrap: wrap; gap: 12px;">
                <div style="flex: 1; min-width: 200px;">
                  <div style="display: flex; align-items: center; gap: 8px; font-weight: 700; color: var(--text-primary); font-size: 15px;">
                    <span>📄</span>
                    <span>${Components.escapeHtml(qtypeName)}</span>
                  </div>
                  <div style="display: flex; align-items: center; gap: 16px; margin-top: 8px; font-size: 13px; color: var(--text-secondary);">
                    <span>${I18n.t('sessions.progress', { current, total, percent })}</span>
                    <span>${I18n.t('sessions.updated', { time: timeStr })}</span>
                  </div>
                  <div style="width: 100%; max-width: 300px; height: 6px; background: var(--border-color); border-radius: 3px; margin-top: 8px; overflow: hidden;">
                    <div style="width: ${percent}%; height: 100%; background: var(--text-accent); transition: width 0.3s;"></div>
                  </div>
                </div>

                <div style="display: flex; align-items: center; gap: 8px;">
                  <button class="btn btn-primary btn-sm" onclick="SessionsView.resumeSession(${quizId}, '${s.qtype}')">
                    ${I18n.t('sessions.resume')}
                  </button>
                  <button class="btn btn-ghost btn-sm" onclick="SessionsView.deleteSession(${s.session_id}, ${quizId}, '${s.qtype}')" style="color: #ef4444;" title="${I18n.t('sessions.deleteTooltip')}">
                    ${I18n.t('sessions.delete')}
                  </button>
                </div>
              </div>
            </div>
          `;
        }).join('');

        return `
          <div class="session-folder-card card" style="margin-bottom: 24px; padding: 20px;">
            <div class="session-folder-header" style="display: flex; align-items: center; justify-content: space-between; gap: 12px; padding-bottom: 12px; border-bottom: 1px solid var(--border-color); cursor: pointer;" onclick="SessionsView.toggleCollapse(${quizId})">
              <div style="display: flex; align-items: center; gap: 12px; flex: 1;">
                <span style="font-size: 28px;">📁</span>
                <div>
                  <div style="display: flex; align-items: center; flex-wrap: wrap; gap: 4px;">
                    <h3 style="font-size: 18px; font-weight: 800; color: var(--text-primary); margin: 0; display: inline-block;">
                      ${quizTitle}
                    </h3>
                    ${modeBadgeHTML}
                  </div>
                  <div style="font-size: 13px; color: var(--text-secondary); margin-top: 2px;">
                    ${I18n.t('sessions.totalInQuiz', { count: allSessions.length })}
                  </div>
                </div>
              </div>

              <button class="btn btn-ghost btn-sm" onclick="event.stopPropagation(); SessionsView.toggleCollapse(${quizId})" style="display: flex; align-items: center; gap: 6px; font-weight: 600; padding: 6px 14px; border-radius: 10px; background: rgba(255,255,255,0.05); border: 1px solid var(--border-color);">
                <span id="collapse-icon-${quizId}">${isCollapsed ? '►' : '▼'}</span>
                <span id="collapse-text-${quizId}">${isCollapsed ? I18n.t('sessions.expand') : I18n.t('sessions.collapse')}</span>
              </button>
            </div>

            <div class="session-files-list" id="session-list-${quizId}" style="margin-top: 16px; ${isCollapsed ? 'display: none;' : ''}">
              ${sessionItemsHTML}
            </div>
          </div>
        `;
      }).join('');

      container.innerHTML = `
        <div class="page-header">
          <h1>${I18n.t('sessions.title')}</h1>
          <p>${I18n.t('sessions.subtitle')}</p>
        </div>

        <div class="sessions-tree-container">
          ${groupsHTML}
        </div>
      `;

    } catch (err) {
      container.innerHTML = `
        <div class="page-header">
          <h1>${I18n.t('sessions.title')}</h1>
        </div>
        <div class="card text-center" style="padding: 32px; color: #ef4444;">
          ⚠️ ${Components.escapeHtml(err.message)}
        </div>
      `;
    }
  }

  function toggleCollapse(quizId) {
    const listEl = document.getElementById(`session-list-${quizId}`);
    const iconEl = document.getElementById(`collapse-icon-${quizId}`);
    const textEl = document.getElementById(`collapse-text-${quizId}`);
    if (!listEl) return;

    const collapsedSet = getCollapsedSet();
    const isCurrentlyCollapsed = listEl.style.display === 'none';

    if (isCurrentlyCollapsed) {
      listEl.style.display = 'block';
      if (iconEl) iconEl.textContent = '▼';
      if (textEl) textEl.textContent = I18n.t('sessions.collapse');
      collapsedSet.delete(quizId);
    } else {
      listEl.style.display = 'none';
      if (iconEl) iconEl.textContent = '►';
      if (textEl) textEl.textContent = I18n.t('sessions.expand');
      collapsedSet.add(quizId);
    }

    saveCollapsedSet(collapsedSet);
  }

  async function resumeSession(quizId, qtype) {
    try {
      let sessionData = sessionDataStore.get(`${quizId}_${qtype}`);

      // Also check localStorage for a fresher version (it updates instantly, unlike server DB)
      if (window.QuizPlayer && typeof QuizPlayer.getSavedProgress === 'function') {
        const localSaved = QuizPlayer.getSavedProgress(quizId, qtype);
        if (localSaved && (!sessionData || (localSaved.updatedAt || 0) > (sessionData.updatedAt || 0))) {
          sessionData = localSaved;
        }
      }

      if (window.QuizPlayer && typeof QuizPlayer.resumeQuiz === 'function') {
        QuizPlayer.resumeQuiz(quizId, qtype, sessionData);
      } else if (window.QuizPlayer && typeof QuizPlayer.startQuiz === 'function') {
        QuizPlayer.startQuiz(quizId, false, true);
      } else if (window.App && typeof App.navigate === 'function') {
        App.navigate('play', quizId);
      } else {
        Components.showToast(I18n.t('common.error'), 'error');
      }
    } catch (err) {
      Components.showToast(err.message, 'error');
    }
  }

  const pendingDeletions = new Map();
  let pendingIdCounter = 0;

  window.addEventListener('beforeunload', () => commitAllPendingDeletions());
  window.addEventListener('pagehide', () => commitAllPendingDeletions());

  function commitAllPendingDeletions() {
    pendingDeletions.forEach((entry, deleteId) => {
      commitDelete(deleteId);
    });
  }

  async function commitDelete(deleteId) {
    const entry = pendingDeletions.get(deleteId);
    if (!entry) return;

    if (entry.timerId) clearInterval(entry.timerId);
    if (entry.toastEl) entry.toastEl.remove();
    pendingDeletions.delete(deleteId);

    const { sessionId, quizId, qtype } = entry;
    try {
      if (quizId && qtype) {
        if (window.QuizPlayer && typeof QuizPlayer.clearSavedProgress === 'function') {
          await QuizPlayer.clearSavedProgress(quizId, qtype);
        } else {
          localStorage.removeItem(getProgressKeyPrefix() + quizId + '_' + qtype);
          if (qtype === 'all') {
            localStorage.removeItem(getProgressKeyPrefix() + quizId + '_all');
            localStorage.removeItem(getProgressKeyPrefix() + quizId);
          }
          await fetch(`/api/sessions/quiz/${quizId}/qtype/${qtype}`, { method: 'DELETE' }).catch(e => {});
        }
      } else if (sessionId && sessionId > 0) {
        const res = await fetch(`/api/sessions/${sessionId}`, { method: 'DELETE' });
        if (res.ok) {
          const data = await res.json();
          if (data.quizId && data.qtype && window.QuizPlayer && typeof QuizPlayer.clearSavedProgress === 'function') {
            await QuizPlayer.clearSavedProgress(data.quizId, data.qtype);
          }
        }
      }
    } catch (e) {
      console.error('Error committing deletion:', e);
    }
  }

  function undoDelete(deleteId) {
    const entry = pendingDeletions.get(deleteId);
    if (!entry) return;

    if (entry.timerId) clearInterval(entry.timerId);
    if (entry.toastEl) entry.toastEl.remove();
    pendingDeletions.delete(deleteId);

    const { quizId, qtype, qtypeName, sessionData } = entry;
    if (quizId && qtype && sessionData) {
      const key = getProgressKeyPrefix() + quizId + '_' + (qtype === 'all' ? 'all' : qtype);
      localStorage.setItem(key, JSON.stringify(sessionData));
      if (qtype === 'all') {
        localStorage.setItem(getProgressKeyPrefix() + quizId, JSON.stringify(sessionData));
      }
    }

    const restoredMsg = I18n.t('common.restored', { name: qtypeName }) || `Đã khôi phục ${qtypeName}`;
    Components.showToast('✅ ' + restoredMsg, 'success');
    render();
  }

  function deleteSession(sessionId, quizId = null, qtype = null) {
    pendingIdCounter++;
    const deleteId = `del_${Date.now()}_${pendingIdCounter}`;

    const qtypeName = getQtypeName(qtype);
    const deletedTitle = I18n.t('sessions.deletedItem', { name: qtypeName }) || (I18n.getLang() === 'en' ? `Deleted ${qtypeName}` : `Đã xóa ${qtypeName}`);

    let sessionData = sessionDataStore.get(`${quizId}_${qtype}`);
    if (!sessionData && window.QuizPlayer && typeof QuizPlayer.getSavedProgress === 'function') {
      sessionData = QuizPlayer.getSavedProgress(quizId, qtype);
    }

    // Hide target session item instantly from UI
    let targetEl = null;
    if (quizId && qtype) {
      targetEl = document.getElementById(`session-item-${quizId}-${qtype}`);
    } else if (sessionId) {
      targetEl = document.getElementById(`session-item-${sessionId}`);
    }
    if (targetEl) {
      targetEl.style.display = 'none';
    }

    let container = document.getElementById('toast-container');
    if (!container) {
      container = document.createElement('div');
      container.id = 'toast-container';
      container.className = 'toast-container';
      document.body.appendChild(container);
    }

    const undoText = I18n.t('common.undo') || 'Hoàn tác';
    const closeText = I18n.t('common.close') || 'Đóng';

    const toastEl = document.createElement('div');
    toastEl.className = 'toast undo-toast';
    toastEl.id = `undo-toast-${deleteId}`;
    toastEl.innerHTML = `
      <div class="undo-toast-header">
        <span class="toast-icon">🗑️</span>
        <span class="undo-toast-title">${Components.escapeHtml(deletedTitle)}</span>
        <button class="undo-toast-close" onclick="SessionsView.commitDelete('${deleteId}')" title="${Components.escapeHtml(closeText)}">✕</button>
      </div>
      <div class="undo-toast-progress-bar">
        <div class="undo-toast-progress-fill" id="undo-progress-${deleteId}" style="width: 100%;"></div>
      </div>
      <div class="undo-toast-footer">
        <button class="btn btn-sm undo-btn" onclick="SessionsView.undoDelete('${deleteId}')">
          ↩️ ${Components.escapeHtml(undoText)}
        </button>
      </div>
    `;

    container.appendChild(toastEl);

    // Smooth progress fill animation shrinking from 100% to 0% over exactly 10 seconds
    requestAnimationFrame(() => {
      setTimeout(() => {
        const fillEl = document.getElementById(`undo-progress-${deleteId}`);
        if (fillEl) fillEl.style.width = '0%';
      }, 50);
    });

    const timerId = setTimeout(() => {
      commitDelete(deleteId);
    }, 10000);

    pendingDeletions.set(deleteId, {
      quizId,
      qtype,
      sessionId,
      qtypeName,
      sessionData,
      timerId,
      toastEl
    });
  }

  return {
    render,
    toggleCollapse,
    resumeSession,
    deleteSession,
    undoDelete,
    commitDelete
  };
})();

window.SessionsView = SessionsView;
