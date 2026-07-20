// ============================================
// Quiz Editor - Create & Edit Quizzes
// ============================================

const QuizEditor = (() => {
  let editingQuizId = null;
  let questionsList = [];
  let pendingUploads = {}; // { tempId: { image_path, audio_path } }

  function render(quizId = null) {
    editingQuizId = quizId;
    questionsList = [];
    pendingUploads = {};

    const main = document.getElementById('main-content');
    const isEdit = !!quizId;

    main.innerHTML = `
      <div class="page-header">
        <h1>${I18n.t(isEdit ? 'create.editTitle' : 'create.title')}</h1>
      </div>
      <div class="card" style="margin-bottom: 24px;">
        <div class="form-group">
          <label class="form-label">${I18n.t('create.quizTitle')}</label>
          <input type="text" class="form-input" id="quiz-title" placeholder="${I18n.t('create.quizTitlePlaceholder')}">
        </div>
        <div class="form-group">
          <label class="form-label">${I18n.t('create.description')}</label>
          <textarea class="form-textarea" id="quiz-description" placeholder="${I18n.t('create.descriptionPlaceholder')}" rows="2"></textarea>
        </div>
      </div>

      <div class="card">
        <div class="card-header">
          <h2 class="card-title">${I18n.t('create.questions')}</h2>
          <button class="btn btn-success" onclick="QuizEditor.addQuestion()">
            ＋ ${I18n.t('create.addQuestion')}
          </button>
        </div>
        <div id="questions-container" class="editor-question-list">
          <div class="empty-state" style="padding: 40px;">
            <span class="empty-icon" style="font-size: 40px;">📝</span>
            <p>${I18n.t('create.noQuestions')}</p>
          </div>
        </div>
      </div>

      <div style="display: flex; gap: 12px; justify-content: flex-end; margin-top: 24px;">
        <button class="btn btn-ghost btn-lg" onclick="App.navigate('dashboard')">${I18n.t('create.cancel')}</button>
        ${isEdit ? `<a href="/api/export/${quizId}" class="btn btn-ghost btn-lg" download>📤 ${I18n.t('export.downloadExcel')}</a>` : ''}
        <button class="btn btn-primary btn-lg" onclick="QuizEditor.save()">💾 ${I18n.t('create.save')}</button>
      </div>
    `;

    if (isEdit) {
      loadQuiz(quizId);
    }
  }

  async function loadQuiz(quizId) {
    try {
      const res = await fetch(`/api/quizzes/${quizId}`);
      if (!res.ok) throw new Error('Quiz not found');
      const quiz = await res.json();

      document.getElementById('quiz-title').value = quiz.title;
      document.getElementById('quiz-description').value = quiz.description || '';

      questionsList = quiz.questions.map(q => ({
        id: q.id,
        question_text: q.question_text,
        correct_answer: q.correct_answer,
        image_path: q.image_path,
        audio_path: q.audio_path,
      }));

      renderQuestionsList();
    } catch (err) {
      Components.showToast(I18n.t('common.error'), 'error');
      console.error(err);
    }
  }

  function addQuestion() {
    const tempId = `temp_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;
    questionsList.push({
      tempId,
      question_text: '',
      correct_answer: '',
      image_path: null,
      audio_path: null,
    });
    renderQuestionsList();
    // Focus on the last question input
    setTimeout(() => {
      const inputs = document.querySelectorAll('.q-text-input');
      if (inputs.length > 0) inputs[inputs.length - 1].focus();
    }, 100);
  }

  function removeQuestion(index) {
    questionsList.splice(index, 1);
    renderQuestionsList();
  }

  function renderQuestionsList() {
    const container = document.getElementById('questions-container');

    if (questionsList.length === 0) {
      container.innerHTML = `
        <div class="empty-state" style="padding: 40px;">
          <span class="empty-icon" style="font-size: 40px;">📝</span>
          <p>${I18n.t('create.noQuestions')}</p>
        </div>
      `;
      return;
    }

    container.innerHTML = questionsList.map((q, i) => {
      const idx = i;
      const mediaHTML = renderMediaSection(q, idx);

      return `
        <div class="editor-question-item" data-index="${idx}">
          <div class="editor-question-number">${i + 1}</div>
          <div class="editor-question-content" style="flex: 1;">
            <div class="form-group" style="margin-bottom: 12px;">
              <input type="text" class="form-input q-text-input" 
                     placeholder="${I18n.t('create.questionPlaceholder')}" 
                     value="${Components.escapeHtml(q.question_text)}">
            </div>
            <div class="form-group answers-group" style="margin-bottom: 12px;">
              ${(q.correct_answer || '').split('/').map((ans, aIdx) => `
                <div style="display: flex; gap: 8px; margin-bottom: 8px;">
                  <input type="text" class="form-input q-answer-input" 
                         placeholder="${I18n.t('create.answerPlaceholder')}" 
                         value="${Components.escapeHtml(ans)}">
                  ${aIdx > 0 ? `<button class="btn btn-sm btn-ghost" onclick="QuizEditor.removeAnswerOption(${idx}, ${aIdx})">✕</button>` : ''}
                </div>
              `).join('')}
              <button class="btn btn-sm btn-ghost" onclick="QuizEditor.addAnswerOption(${idx})" style="margin-top: 4px;">
                ${I18n.t('create.addAnswer')}
              </button>
            </div>
            ${mediaHTML}
          </div>
          <div class="editor-question-actions">
            <button class="btn btn-sm btn-danger" onclick="QuizEditor.removeQuestion(${idx})" title="${I18n.t('common.delete')}">🗑</button>
          </div>
        </div>
      `;
    }).join('');
  }

  function renderMediaSection(q, idx) {
    let imagePreview = '';
    let audioPreview = '';

    if (q.image_path) {
      imagePreview = `
        <div class="media-preview-item">
          🖼 ${q.image_path.split('/').pop()}
          <span class="remove-media" onclick="QuizEditor.removeMedia(${idx}, 'image')">✕</span>
        </div>
      `;
    }
    if (q.audio_path) {
      audioPreview = `
        <div class="media-preview-item">
          🔊 ${q.audio_path.split('/').pop()}
          <span class="remove-media" onclick="QuizEditor.removeMedia(${idx}, 'audio')">✕</span>
        </div>
      `;
    }

    return `
      <div style="display: flex; gap: 8px; flex-wrap: wrap; align-items: flex-start;">
        <label class="file-upload-btn">
          ${I18n.t('create.addImage')}
          <input type="file" accept="image/*" onchange="QuizEditor.uploadMedia(${idx}, 'image', this)">
        </label>
        <label class="file-upload-btn">
          ${I18n.t('create.addAudio')}
          <input type="file" accept="audio/*" onchange="QuizEditor.uploadMedia(${idx}, 'audio', this)">
        </label>
      </div>
      <div class="media-preview" style="margin-top: 6px;">
        ${imagePreview}${audioPreview}
      </div>
    `;
  }

  function updateQuestion(index, field, value) {
    if (questionsList[index]) {
      questionsList[index][field] = value;
    }
  }

  function addAnswerOption(index) {
    syncQuestionsFromDOM();
    if (questionsList[index]) {
      questionsList[index].correct_answer += '/';
      renderQuestionsList();
    }
  }

  function removeAnswerOption(qIndex, aIndex) {
    syncQuestionsFromDOM();
    if (questionsList[qIndex]) {
      const answers = (questionsList[qIndex].correct_answer || '').split('/');
      answers.splice(aIndex, 1);
      questionsList[qIndex].correct_answer = answers.join('/');
      renderQuestionsList();
    }
  }

  async function uploadMedia(index, type, input) {
    const file = input.files[0];
    if (!file) return;

    const formData = new FormData();
    formData.append(type, file);

    try {
      const res = await fetch(`/api/upload/${type}`, { method: 'POST', body: formData });
      if (!res.ok) throw new Error('Upload failed');
      const data = await res.json();

      if (type === 'image') {
        questionsList[index].image_path = data.path;
      } else {
        questionsList[index].audio_path = data.path;
      }

      renderQuestionsList();
      Components.showToast(`${type === 'image' ? '🖼' : '🔊'} Upload successful!`, 'success');
    } catch (err) {
      Components.showToast(`Upload failed: ${err.message}`, 'error');
    }
  }

  function removeMedia(index, type) {
    if (type === 'image') {
      questionsList[index].image_path = null;
    } else {
      questionsList[index].audio_path = null;
    }
    renderQuestionsList();
  }

  async function save() {
    const title = document.getElementById('quiz-title').value.trim();
    const description = document.getElementById('quiz-description').value.trim();

    if (!title) {
      Components.showToast(I18n.t('create.quizTitlePlaceholder'), 'warning');
      document.getElementById('quiz-title').focus();
      return;
    }

    // Validate questions - sync from DOM
    syncQuestionsFromDOM();

    // Filter out empty questions
    const validQuestions = questionsList.filter(q => q.question_text.trim() && q.correct_answer.trim());

    if (validQuestions.length === 0) {
      Components.showToast(I18n.t('create.noQuestions'), 'warning');
      return;
    }

    try {
      let quizId;

      if (editingQuizId) {
        // Update existing quiz
        await fetch(`/api/quizzes/${editingQuizId}`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ title, description })
        });
        quizId = editingQuizId;

        // Delete old questions and re-create (simplest approach)
        const existingRes = await fetch(`/api/quizzes/${quizId}`);
        const existingQuiz = await existingRes.json();

        // Delete removed questions
        for (const eq of existingQuiz.questions) {
          const stillExists = validQuestions.find(vq => vq.id === eq.id);
          if (!stillExists) {
            await fetch(`/api/questions/${eq.id}`, { method: 'DELETE' });
          }
        }

        // Update or create questions
        for (let i = 0; i < validQuestions.length; i++) {
          const q = validQuestions[i];
          if (q.id) {
            // Update existing
            await fetch(`/api/questions/${q.id}`, {
              method: 'PUT',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                question_text: q.question_text,
                correct_answer: q.correct_answer,
                image_path: q.image_path,
                audio_path: q.audio_path,
              })
            });
          } else {
            // Create new
            await fetch(`/api/quizzes/${quizId}/questions`, {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                question_text: q.question_text,
                correct_answer: q.correct_answer,
                image_path: q.image_path,
                audio_path: q.audio_path,
              })
            });
          }
        }
      } else {
        // Create new quiz
        const createRes = await fetch('/api/quizzes', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ title, description })
        });
        if (!createRes.ok) {
          const errData = await createRes.json();
          throw new Error(errData.error || 'Failed to create quiz');
        }
        const newQuiz = await createRes.json();
        quizId = newQuiz.id;

        if (!quizId) {
          throw new Error('Quiz created but no ID returned');
        }

        // Add questions
        for (const q of validQuestions) {
          await fetch(`/api/quizzes/${quizId}/questions`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              question_text: q.question_text,
              correct_answer: q.correct_answer,
              image_path: q.image_path,
              audio_path: q.audio_path,
            })
          });
        }
      }

      Components.showToast(I18n.t('create.saved'), 'success');
      App.navigate('dashboard');
    } catch (err) {
      Components.showToast(`${I18n.t('common.error')}: ${err.message}`, 'error');
      console.error(err);
    }
  }

  function syncQuestionsFromDOM() {
    const items = document.querySelectorAll('.editor-question-item');
    items.forEach((item, i) => {
      const qInput = item.querySelector('.q-text-input');
      const aInputs = item.querySelectorAll('.q-answer-input');
      
      if (questionsList[i]) {
        if (qInput) questionsList[i].question_text = qInput.value;
        if (aInputs.length > 0) {
          questionsList[i].correct_answer = Array.from(aInputs).map(inp => inp.value).join('/');
        }
      }
    });
  }

  return {
    render,
    addQuestion,
    removeQuestion,
    updateQuestion,
    addAnswerOption,
    removeAnswerOption,
    uploadMedia,
    removeMedia,
    save,
  };
})();
