const SessionsView = (() => {
  const containerId = 'main-content';

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

  async function render() {
    const container = document.getElementById(containerId);
    if (!container) return;

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

        const sessionItemsHTML = g.sessions.map(s => {
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
            <div class="session-folder-header" style="display: flex; align-items: center; gap: 12px; margin-bottom: 16px; padding-bottom: 12px; border-bottom: 1px solid var(--border-color);">
              <span style="font-size: 28px;">📁</span>
              <div style="flex: 1;">
                <h3 style="font-size: 18px; font-weight: 800; color: var(--text-primary); margin: 0;">
                  ${quizTitle}
                </h3>
                <span style="font-size: 13px; color: var(--text-secondary);">
                  ${I18n.t('sessions.totalInQuiz', { count: g.sessions.length })}
                </span>
              </div>
            </div>

            <div class="session-files-list">
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

  async function resumeSession(quizId, qtype) {
    try {
      // Use App.navigate to go to play route, which triggers startQuiz and shows resume modal
      if (window.App && typeof App.navigate === 'function') {
        App.navigate('play', quizId);
      } else if (window.QuizPlayer && typeof QuizPlayer.startQuiz === 'function') {
        QuizPlayer.startQuiz(quizId);
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
    resumeSession,
    deleteSession
  };
})();

window.SessionsView = SessionsView;
