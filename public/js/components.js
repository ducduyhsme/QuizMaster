// ============================================
// Components - Reusable UI Components
// ============================================

const Components = (() => {

  // Toast notification
  function showToast(message, type = 'info') {
    const container = document.getElementById('toast-container');
    if (!container) return;

    const icons = { success: '✅', error: '❌', info: 'ℹ️', warning: '⚠️' };
    const cleanMsg = typeof message === 'string'
      ? message.replace(/^[\u{1F300}-\u{1F9FF}\u{2600}-\u{26FF}\u{2700}-\u{27BF}✅❌ℹ️⚠️]\s*/u, '').trim()
      : String(message);

    // Prevent duplicate toast if an identical message is already active
    const existingToasts = container.querySelectorAll('.toast');
    for (const existing of existingToasts) {
      if (existing.dataset.msg === cleanMsg && existing.dataset.type === type) {
        return; // Ignore duplicate toast burst
      }
    }

    // Keep max 3 toasts visible at once
    if (existingToasts.length >= 3) {
      existingToasts[0].remove();
    }

    const toast = document.createElement('div');
    toast.className = `toast ${type}`;
    toast.dataset.msg = cleanMsg;
    toast.dataset.type = type;
    toast.innerHTML = `
      <span class="toast-icon">${icons[type] || icons.info}</span>
      <span>${cleanMsg}</span>
    `;
    container.appendChild(toast);
    setTimeout(() => toast.remove(), 3000);
  }

  // Modal
  function showModal(title, bodyHTML, footerHTML = '') {
    const overlay = document.getElementById('modal-overlay');
    const modal = document.getElementById('modal');
    document.getElementById('modal-title').textContent = title;
    document.getElementById('modal-body').innerHTML = bodyHTML;
    document.getElementById('modal-footer').innerHTML = footerHTML;
    overlay.classList.add('active');
    modal.classList.add('active');
  }

  function closeModal() {
    document.getElementById('modal-overlay').classList.remove('active');
    document.getElementById('modal').classList.remove('active');
  }

  // Confirm dialog
  function showConfirm(title, message, onConfirm) {
    const body = `<p style="color: var(--text-secondary); line-height: 1.6;">${message}</p>`;
    const footer = `
      <button class="btn btn-ghost" onclick="Components.closeModal()">${I18n.t('common.cancel')}</button>
      <button class="btn btn-danger" id="confirm-btn">${I18n.t('common.confirm')}</button>
    `;
    showModal(title, body, footer);
    document.getElementById('confirm-btn').addEventListener('click', () => {
      closeModal();
      onConfirm();
    });
  }

  // Render quiz table
  function renderQuizTable(quizzes, options = {}) {
    const { showPlay = true, showEdit = true, showDelete = true } = options;

    if (!quizzes || quizzes.length === 0) {
      return `
        <div class="empty-state">
          <span class="empty-icon">📋</span>
          <h3>${I18n.t('dashboard.empty')}</h3>
          <p>${I18n.t('dashboard.emptyHint')}</p>
          <button class="btn btn-primary btn-lg" onclick="App.createNewQuiz()">
            ＋ ${I18n.t('dashboard.createFirst')}
          </button>
        </div>
      `;
    }

    let rows = quizzes.map(q => {
      const date = new Date(q.created_at).toLocaleDateString(I18n.getLang() === 'vi' ? 'vi-VN' : 'en-US', {
        year: 'numeric', month: 'short', day: 'numeric'
      });

      const isPinned = q.is_pinned === 1 || q.code === 'WRONG0';
      const pinnedBadge = isPinned ? `<span style="background: rgba(239, 68, 68, 0.15); color: #ef4444; border: 1px solid rgba(239, 68, 68, 0.3); padding: 2px 8px; border-radius: 12px; font-size: 11px; font-weight: 600; margin-left: 4px;">📌 ${I18n.t('quiz.pinned')}</span>` : '';

      let actions = '';
      if (showPlay) actions += `<button class="btn btn-sm btn-primary" onclick="App.playQuiz(${q.id})" title="${I18n.t('common.play')}">▶</button>`;
      if (showEdit) actions += `<button class="btn btn-sm btn-ghost" onclick="App.editQuiz(${q.id}, '${q.quiz_type || 'question'}')" title="${I18n.t('common.edit')}">✏️</button>`;
      actions += `<a href="/api/export/${q.id}" class="btn btn-sm btn-ghost" title="${I18n.t('export.downloadExcel')}" download>📤</a>`;
      if (showDelete && !isPinned) actions += `<button class="btn btn-sm btn-danger" onclick="App.deleteQuiz(${q.id}, '${q.title.replace(/'/g, "\\'")}')" title="${I18n.t('common.delete')}">🗑</button>`;

      const showTypeBadge = options.showTypeBadge || false;
      const typeBadge = showTypeBadge ? (q.quiz_type === 'vocabulary' 
        ? `<span class="quiz-type-badge">${I18n.t('dashboard.typeVocab')}</span>` 
        : `<span class="quiz-type-badge">${I18n.t('dashboard.typeQuestion')}</span>`) : '';

      const visibility = q.visibility || 'private';
      let visibilityBadge = '';
      if (visibility === 'private') {
        visibilityBadge = `<span style="background: rgba(100, 116, 139, 0.15); color: var(--text-secondary); border: 1px solid var(--border-color); padding: 2px 8px; border-radius: 12px; font-size: 11px; font-weight: 600; margin-left: 4px;">${I18n.t('privacy.private')}</span>`;
      } else if (visibility === 'unlisted') {
        visibilityBadge = `<span style="background: rgba(59, 130, 246, 0.15); color: #3b82f6; border: 1px solid rgba(59, 130, 246, 0.3); padding: 2px 8px; border-radius: 12px; font-size: 11px; font-weight: 600; margin-left: 4px;">${I18n.t('privacy.unlisted')}</span>`;
      } else if (visibility === 'public') {
        visibilityBadge = `<span style="background: rgba(34, 197, 94, 0.15); color: #22c55e; border: 1px solid rgba(34, 197, 94, 0.3); padding: 2px 8px; border-radius: 12px; font-size: 11px; font-weight: 600; margin-left: 4px;">${I18n.t('privacy.public')}</span>`;
      }

      let codeCell = '';
      if (visibility === 'private') {
        codeCell = `<span class="code-badge muted" style="opacity: 0.6; cursor: not-allowed;" title="${I18n.t('code.privateTitle')}">•••••• 🔒</span>`;
      } else {
        codeCell = `<span class="code-badge" onclick="App.copyCode('${q.code}')" title="${I18n.t('code.clickToCopy')}">${q.code} 📋</span>`;
      }

      return `
        <tr ${isPinned ? 'style="background: rgba(239, 68, 68, 0.04);"' : ''}>
          <td><strong>${escapeHtml(q.title)}</strong> ${typeBadge} ${visibilityBadge} ${pinnedBadge}</td>
          <td>${codeCell}</td>
          <td>${q.question_count || 0}</td>
          <td>${date}</td>
          <td>
            <div class="actions-cell">${actions}</div>
          </td>
        </tr>
      `;
    }).join('');

    return `
      <div class="table-container">
        <table class="table" id="quiz-table">
          <thead>
            <tr>
              <th style="width: auto;">${I18n.t('table.title')}</th>
              <th style="width: 14%; min-width: 100px;">${I18n.t('table.code')}</th>
              <th style="width: 14%; min-width: 100px;">${I18n.t('table.questions')}</th>
              <th style="width: 18%; min-width: 120px;">${I18n.t('table.created')}</th>
              <th style="width: 18%; min-width: 150px;">${I18n.t('table.actions')}</th>
            </tr>
          </thead>
          <tbody>${rows}</tbody>
        </table>
      </div>
    `;
  }

  // Escape HTML
  function escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
  }

  // Format date
  function formatDate(dateStr) {
    return new Date(dateStr).toLocaleDateString(I18n.getLang() === 'vi' ? 'vi-VN' : 'en-US', {
      year: 'numeric', month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit'
    });
  }

  return {
    showToast,
    showModal,
    closeModal,
    showConfirm,
    renderQuizTable,
    escapeHtml,
    formatDate,
  };
})();
