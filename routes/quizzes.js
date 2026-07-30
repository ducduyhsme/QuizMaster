const express = require('express');
const { quizzes, questions, bulkInsertQuestions, ensureWrongQuizForUser } = require('../database');
const { generateQuestionsFromVocab, ensureVocabQuizUpToDate } = require('../services/vocabService');

const router = express.Router();

router.get('/', (req, res) => {
  try {
    const userQuizzes = quizzes.getAllForUser(req.user.userId);
    res.json(userQuizzes);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.get('/code/:code', (req, res) => {
  try {
    const quiz = quizzes.getByCode(req.params.code, req.user.userId);
    if (!quiz) return res.status(404).json({ error: 'Quiz không tồn tại hoặc ở chế độ Riêng tư' });
    let qs = questions.getByQuizId(quiz.id);
    qs = ensureVocabQuizUpToDate(quiz, qs);
    res.json({ ...quiz, questions: qs });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.get('/:id', (req, res) => {
  try {
    const quiz = quizzes.getById(parseInt(req.params.id));
    if (!quiz) return res.status(404).json({ error: 'Quiz not found' });
    
    if (quiz.visibility === 'private' && Number(quiz.user_id) !== Number(req.user.userId)) {
      return res.status(403).json({ error: 'Quiz này ở chế độ Riêng tư' });
    }

    let qs = questions.getByQuizId(quiz.id);
    qs = ensureVocabQuizUpToDate(quiz, qs);
    res.json({ ...quiz, questions: qs });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.post('/', (req, res) => {
  try {
    const { title, description, visibility = 'private' } = req.body;
    if (!title) return res.status(400).json({ error: 'Title is required' });
    const code = require('../database').generateUniqueCode();
    const quizId = quizzes.create(req.user.userId, code, title, description || '', 'question', null, null, visibility);
    const quiz = quizzes.getById(quizId);
    res.status(201).json(quiz);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.put('/:id', (req, res) => {
  try {
    const quizId = parseInt(req.params.id);
    const { title, description, visibility = 'private' } = req.body;
    const existing = quizzes.getById(quizId);
    if (!existing || Number(existing.user_id) !== Number(req.user.userId)) {
      return res.status(403).json({ error: 'Bạn không có quyền sửa Quiz này' });
    }

    quizzes.update(quizId, req.user.userId, title || existing.title, description ?? existing.description, existing.quiz_type, existing.vocab_lang, existing.meaning_lang, visibility);
    const updated = quizzes.getById(quizId);
    res.json(updated);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.delete('/:id', (req, res) => {
  try {
    const quizId = parseInt(req.params.id);
    const deleted = quizzes.delete(quizId, req.user.userId);
    if (!deleted) return res.status(403).json({ error: 'Không thể xóa Quiz này' });
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// --- Vocabulary Quiz Routes ---

router.post('/vocabulary', (req, res) => {
  try {
    const { title, description, vocab_lang, meaning_lang, words, visibility = 'private' } = req.body;
    if (!title || !words || !words.length) {
      return res.status(400).json({ error: 'Title and words are required' });
    }
    const code = require('../database').generateUniqueCode();
    const quizId = quizzes.create(req.user.userId, code, title, description || '', 'vocabulary', vocab_lang, meaning_lang, visibility);
    
    const generatedQuestions = generateQuestionsFromVocab(words);
    bulkInsertQuestions(quizId, generatedQuestions);
    
    const quiz = quizzes.getById(quizId);
    res.status(201).json(quiz);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.put('/:id/vocabulary', (req, res) => {
  try {
    const quizId = parseInt(req.params.id);
    const { title, description, vocab_lang, meaning_lang, words, visibility = 'private' } = req.body;
    const quiz = quizzes.getById(quizId);
    if (!quiz || Number(quiz.user_id) !== Number(req.user.userId)) {
      return res.status(403).json({ error: 'Bạn không có quyền sửa Quiz này' });
    }
    
    quizzes.update(quizId, req.user.userId, title || quiz.title, description ?? quiz.description, 'vocabulary', vocab_lang, meaning_lang, visibility);
    
    questions.deleteByQuizId(quizId);
    
    if (words && words.length > 0) {
      const generatedQuestions = generateQuestionsFromVocab(words);
      bulkInsertQuestions(quizId, generatedQuestions);
    }
    
    const updated = quizzes.getById(quizId);
    res.json(updated);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.post('/wrong-words/add', (req, res) => {
  try {
    const { word, meaning, ipa } = req.body;
    if (!word || !meaning) {
      return res.status(400).json({ error: 'Word and meaning are required' });
    }

    const cleanWord = String(word).trim();
    const cleanMeaning = String(meaning).trim();
    const cleanIpa = ipa ? String(ipa).trim() : '';

    if (!cleanWord || !cleanMeaning) {
      return res.status(400).json({ error: 'Word and meaning cannot be empty' });
    }

    ensureWrongQuizForUser(req.user.userId);
    const userQuizzes = quizzes.getAllForUser(req.user.userId);
    let wrongQuiz = userQuizzes.find(q => q.is_pinned === 1 || q.title === 'Các từ sai/hay quên');

    if (!wrongQuiz) {
      return res.status(500).json({ error: 'Could not find wrong words quiz' });
    }

    const qs = questions.getByQuizId(wrongQuiz.id);
    const wordMap = new Map();

    for (const q of qs) {
      let w = '', m = '', p = q.ipa || '';
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
          wordMap.set(key, { word: w, meaning: m, ipa: p });
        } else if (p && !wordMap.get(key).ipa) {
          wordMap.get(key).ipa = p;
        }
      }
    }

    const targetKey = cleanWord.toLowerCase() + ':::' + cleanMeaning.toLowerCase();
    let updated = false;

    if (!wordMap.has(targetKey)) {
      wordMap.set(targetKey, { word: cleanWord, meaning: cleanMeaning, ipa: cleanIpa });
      updated = true;
    } else if (cleanIpa && !wordMap.get(targetKey).ipa) {
      wordMap.get(targetKey).ipa = cleanIpa;
      updated = true;
    }

    if (updated) {
      const allWords = Array.from(wordMap.values());
      const newQuestions = generateQuestionsFromVocab(allWords);
      questions.deleteByQuizId(wrongQuiz.id);
      bulkInsertQuestions(wrongQuiz.id, newQuestions);
      return res.json({ success: true, added: true, wordCount: allWords.length });
    }

    return res.json({ success: true, added: false, wordCount: wordMap.size });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
