const SessionsView = (() => {
  const containerId = 'main-content';
  const sessionDataStore = new Map();

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
    const mainType = I18n.t(`qtype.${qtype}`);
    const descType = I18n.t(`qtype.${qtype}_desc`);
    if (mainType && descType && mainType !== `qtype.${qtype}`) {
      return `${descType} (${mainType})`;
    }
    return QTYPE_NAMES[qtype] || qtype;
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
      const groups = await res.json();

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

        const sessionItemsHTML = g.sessions.map(s => {
          sessionDataStore.set(`${quizId}_${s.qtype}`, s.session_data);

          const qtypeName = getQtypeName(s.qtype);
          const current = s.current_index + 1;
          const total = s.total_questions || 1;
          const percent = Math.min(100, Math.round((current / total) * 100));
          const timeStr = new Date(s.updated_at).toLocaleString(I18n.getLang() === 'vi' ? 'vi-VN' : 'en-US');

          return `
            <div class="session-file-item card" style="margin-bottom: 12px; border-left: 4px solid var(--text-accent); padding: 16px;">
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
                  <button class="btn btn-ghost btn-sm" onclick="SessionsView.deleteSession(${s.session_id})" style="color: #ef4444;" title="${I18n.t('sessions.deleteTooltip')}">
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
                    ${I18n.t('sessions.totalInQuiz', { count: g.sessions.length })}
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
          <h1>🎮 ${I18n.t('sessions.title')}</h1>
          <p>${I18n.t('sessions.subtitle')}</p>
        </div>

        <div class="sessions-tree-container">
          ${groupsHTML}
        </div>
      `;

    } catch (err) {
      container.innerHTML = `
        <div class="page-header">
          <h1>🎮 ${I18n.t('sessions.title')}</h1>
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
      const sessionData = sessionDataStore.get(`${quizId}_${qtype}`);
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

  async function deleteSession(sessionId) {
    if (!confirm(I18n.t('sessions.deleteConfirm'))) return;
    try {
      const res = await fetch(`/api/sessions/${sessionId}`, { method: 'DELETE' });
      if (!res.ok) throw new Error(I18n.t('common.error'));
      Components.showToast(I18n.t('sessions.deleted'), 'success');
      render();
    } catch (err) {
      Components.showToast(err.message, 'error');
    }
  }

  return {
    render,
    toggleCollapse,
    resumeSession,
    deleteSession
  };
})();

window.SessionsView = SessionsView;
