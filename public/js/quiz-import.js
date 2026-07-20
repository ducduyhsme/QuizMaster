// ============================================
// Quiz Import - Excel Import Module
// ============================================

const QuizImport = (() => {
  let currentMode = 'question';

  const languages = [
    { code: 'en', name: 'Anh' },
    { code: 'zh', name: 'Trung' },
    { code: 'vi', name: 'Việt' },
    { code: 'ko', name: 'Hàn' },
    { code: 'ru', name: 'Nga' },
    { code: 'fr', name: 'Pháp' },
    { code: 'ja', name: 'Nhật' }
  ];

  function render() {
    const main = document.getElementById('main-content');
    main.innerHTML = `
      <div class="page-header">
        <h1>${I18n.t('import.title')}</h1>
        <p>${I18n.t('import.subtitle')}</p>
      </div>

      <div class="mode-toggle">
        <button class="mode-btn ${currentMode === 'question' ? 'active' : ''}" id="import-mode-question" onclick="QuizImport.setMode('question')">
          📝 <span data-i18n="import.modeQuestion">${I18n.t('import.modeQuestion')}</span>
        </button>
        <button class="mode-btn ${currentMode === 'vocabulary' ? 'active' : ''}" id="import-mode-vocab" onclick="QuizImport.setMode('vocabulary')">
          🔤 <span data-i18n="import.modeVocab">${I18n.t('import.modeVocab')}</span>
        </button>
      </div>

      <div class="card">
        <div class="import-drop-zone" id="drop-zone">
          <span class="drop-icon">📄</span>
          <p class="drop-text">${I18n.t('import.dropText')}</p>
          <p class="drop-hint">${I18n.t('import.dropHint')}</p>
          <p class="drop-hint" style="margin-top: 12px; font-style: italic;" id="import-format-hint">
            💡 ${currentMode === 'vocabulary' ? I18n.t('import.vocabFormatHint') : I18n.t('import.formatHint')}
          </p>
          <input type="file" id="excel-file-input" accept=".xlsx,.xls,.csv" onchange="QuizImport.handleFile(this)">
        </div>
        
        <div class="text-center" style="margin-top: 16px;" id="template-btn-container">
          <a href="/api/export/template/${currentMode}" class="btn btn-ghost btn-sm" id="download-template-btn">
            📥 ${currentMode === 'vocabulary' ? I18n.t('import.downloadTemplateVocab') : I18n.t('import.downloadTemplateQuestion')}
          </a>
        </div>

        <div id="import-preview" class="hidden">
          <div style="margin-top: 24px; padding-top: 24px; border-top: 1px solid var(--border-color);">
            <div class="form-group">
              <label class="form-label">${I18n.t('import.quizName')}</label>
              <input type="text" class="form-input" id="import-quiz-name" placeholder="${I18n.t('import.quizNamePlaceholder')}">
            </div>

            <div id="import-vocab-langs" class="${currentMode === 'vocabulary' ? '' : 'hidden'}" style="display: flex; gap: 16px; margin-bottom: 20px;">
              <div style="flex: 1;">
                <label class="form-label" data-i18n="vocab.vocabLang">Ngôn ngữ Từ vựng</label>
                <select id="import-vocab-lang" class="form-select">
                  ${languages.map(l => `<option value="${l.code}" ${l.code === 'en' ? 'selected' : ''}>${l.name}</option>`).join('')}
                </select>
              </div>
              <div style="flex: 1;">
                <label class="form-label" data-i18n="vocab.meaningLang">Ngôn ngữ cột Nghĩa</label>
                <select id="import-meaning-lang" class="form-select">
                  ${languages.map(l => `<option value="${l.code}" ${l.code === 'vi' ? 'selected' : ''}>${l.name}</option>`).join('')}
                </select>
              </div>
            </div>

            <div style="display: flex; align-items: center; justify-content: space-between; margin-bottom: 16px;">
              <h3 style="font-size: 16px; font-weight: 600;">
                ${I18n.t('import.preview')} — <span id="preview-count" class="text-accent">0</span> ${I18n.t('import.previewCount')}
              </h3>
            </div>

            <div class="preview-table-container">
              <table class="table" id="preview-table">
                <thead id="preview-thead">
                  <!-- Header changes based on mode -->
                </thead>
                <tbody id="preview-tbody"></tbody>
              </table>
            </div>

            <div style="display: flex; gap: 12px; justify-content: flex-end; margin-top: 20px;">
              <button class="btn btn-ghost" onclick="QuizImport.reset()">${I18n.t('create.cancel')}</button>
              <button class="btn btn-primary btn-lg" onclick="QuizImport.confirmImport()">
                📥 ${I18n.t('import.confirm')}
              </button>
            </div>
          </div>
        </div>
      </div>
    `;

    // Set up drag & drop
    const dropZone = document.getElementById('drop-zone');
    dropZone.addEventListener('dragover', (e) => {
      e.preventDefault();
      dropZone.classList.add('dragover');
    });
    dropZone.addEventListener('dragleave', () => {
      dropZone.classList.remove('dragover');
    });
    dropZone.addEventListener('drop', (e) => {
      e.preventDefault();
      dropZone.classList.remove('dragover');
      const file = e.dataTransfer.files[0];
      if (file) handleFileUpload(file);
    });
  }

  function setMode(mode) {
    currentMode = mode;
    reset();
    render();
  }

  function handleFile(input) {
    const file = input.files[0];
    if (file) handleFileUpload(file);
  }

  async function handleFileUpload(file) {
    const formData = new FormData();
    formData.append('excel', file);
    formData.append('mode', currentMode);

    try {
      const res = await fetch('/api/import/preview', { method: 'POST', body: formData });
      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error || 'Preview failed');
      }

      const data = await res.json();
      previewData = data;

      // Set quiz name from filename
      const nameInput = document.getElementById('import-quiz-name');
      nameInput.value = data.filename.replace(/\.(xlsx|xls|csv)$/i, '');

      // Render preview
      document.getElementById('preview-count').textContent = data.total;
      const thead = document.getElementById('preview-thead');
      const tbody = document.getElementById('preview-tbody');

      if (currentMode === 'vocabulary') {
        thead.innerHTML = `
          <tr>
            <th>#</th>
            <th>${I18n.t('vocab.colWord')}</th>
            <th>${I18n.t('vocab.colMeaning')}</th>
            <th>${I18n.t('vocab.colIpa')}</th>
          </tr>
        `;
        tbody.innerHTML = data.preview.map((q, i) => `
          <tr>
            <td>${i + 1}</td>
            <td>${Components.escapeHtml(q.word || '')}</td>
            <td>${Components.escapeHtml(q.meaning || '')}</td>
            <td>${Components.escapeHtml(q.ipa || '')}</td>
          </tr>
        `).join('');
      } else {
        thead.innerHTML = `
          <tr>
            <th>#</th>
            <th>${I18n.t('create.questionText')}</th>
            <th>${I18n.t('create.correctAnswer')}</th>
          </tr>
        `;
        tbody.innerHTML = data.preview.map((q, i) => `
          <tr>
            <td>${i + 1}</td>
            <td>${Components.escapeHtml(q.question_text || '')}</td>
            <td>${Components.escapeHtml(q.correct_answer || '')}</td>
          </tr>
        `).join('');
      }

      document.getElementById('import-preview').classList.remove('hidden');
      document.getElementById('drop-zone').classList.add('hidden');
      document.getElementById('template-btn-container').classList.add('hidden');
    } catch (err) {
      Components.showToast(`${I18n.t('common.error')}: ${err.message}`, 'error');
    }
  }

  async function confirmImport() {
    const title = document.getElementById('import-quiz-name').value.trim();
    if (!title) {
      Components.showToast(I18n.t('import.quizNamePlaceholder'), 'warning');
      return;
    }

    if (!previewData || previewData.preview.length === 0) {
      Components.showToast(I18n.t('common.error'), 'error');
      return;
    }

    try {
      if (currentMode === 'vocabulary') {
        const payload = {
          title,
          description: '',
          vocab_lang: document.getElementById('import-vocab-lang').value,
          meaning_lang: document.getElementById('import-meaning-lang').value,
          words: previewData.preview.map(v => ({ word: v.word, meaning: v.meaning, ipa: v.ipa }))
        };
        const createRes = await fetch('/api/quizzes/vocabulary', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload)
        });
        if (!createRes.ok) throw new Error('Failed to create vocabulary quiz');
      } else {
        const createRes = await fetch('/api/quizzes', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ title, description: '' })
        });
        const quiz = await createRes.json();

        // Add all questions
        for (const q of previewData.preview) {
          await fetch(`/api/quizzes/${quiz.id}/questions`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              question_text: q.question_text,
              correct_answer: q.correct_answer,
            })
          });
        }
      }

      Components.showToast(
        I18n.t('import.success', { count: previewData.preview.length }),
        'success'
      );
      App.navigate('dashboard');
    } catch (err) {
      Components.showToast(`${I18n.t('common.error')}: ${err.message}`, 'error');
    }
  }

  function reset() {
    previewData = null;
    document.getElementById('import-preview')?.classList.add('hidden');
    document.getElementById('drop-zone')?.classList.remove('hidden');
    document.getElementById('template-btn-container')?.classList.remove('hidden');
    const fileInput = document.getElementById('excel-file-input');
    if (fileInput) fileInput.value = '';
  }

  return {
    render,
    setMode,
    handleFile,
    confirmImport,
    reset,
  };
})();
