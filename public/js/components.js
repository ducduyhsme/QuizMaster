// ============================================
// Components - Reusable UI Components
// ============================================

const Components = (() => {

  // Toast notification
  function showToast(message, type = 'info') {
    const container = document.getElementById('toast-container');
    const icons = { success: '✅', error: '❌', info: 'ℹ️', warning: '⚠️' };
    const toast = document.createElement('div');
    toast.className = `toast ${type}`;
    toast.innerHTML = `
      <span class="toast-icon">${icons[type] || icons.info}</span>
      <span>${message}</span>
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

      let actions = '';
      if (showPlay) actions += `<button class="btn btn-sm btn-primary" onclick="App.playQuiz(${q.id})" title="${I18n.t('common.play')}">▶</button>`;
      if (showEdit) actions += `<button class="btn btn-sm btn-ghost" onclick="App.editQuiz(${q.id}, '${q.quiz_type || 'question'}')" title="${I18n.t('common.edit')}">✏️</button>`;
      actions += `<a href="/api/export/${q.id}" class="btn btn-sm btn-ghost" title="${I18n.t('export.downloadExcel')}" download>📤</a>`;
      if (showDelete) actions += `<button class="btn btn-sm btn-danger" onclick="App.deleteQuiz(${q.id}, '${q.title.replace(/'/g, "\\'")}')" title="${I18n.t('common.delete')}">🗑</button>`;

      const typeBadge = q.quiz_type === 'vocabulary' 
        ? `<span class="quiz-type-badge">${I18n.t('dashboard.typeVocab')}</span>` 
        : `<span class="quiz-type-badge">${I18n.t('dashboard.typeQuestion')}</span>`;

      return `
        <tr>
          <td><strong>${escapeHtml(q.title)}</strong> ${typeBadge}</td>
          <td>
            <span class="code-badge" onclick="App.copyCode('${q.code}')" title="Click to copy">
              ${q.code} 📋
            </span>
          </td>
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
              <th>${I18n.t('table.title')}</th>
              <th>${I18n.t('table.code')}</th>
              <th>${I18n.t('table.questions')}</th>
              <th>${I18n.t('table.created')}</th>
              <th>${I18n.t('table.actions')}</th>
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
