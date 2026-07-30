const express = require('express');
const { quizzes, questions } = require('../database');

function createQuestionsRouter(uploadImage) {
  const router = express.Router();

  router.post('/quizzes/:id/questions', uploadImage.single('image'), (req, res) => {
    try {
      const quizId = parseInt(req.params.id);
      const quiz = quizzes.getById(quizId);
      if (!quiz || Number(quiz.user_id) !== Number(req.user.userId)) {
        return res.status(403).json({ error: 'Bạn không có quyền chỉnh sửa' });
      }

      const { question_text, correct_answer } = req.body;
      if (!question_text || !correct_answer) {
        return res.status(400).json({ error: 'Question text and correct answer are required' });
      }

      const imagePath = req.file ? `/uploads/images/${req.file.filename}` : null;
      const maxOrder = questions.getMaxOrder(quizId);
      const qId = questions.create(quizId, question_text, correct_answer, imagePath, null, maxOrder + 1);

      const question = questions.getById(qId);
      res.status(201).json(question);
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });

  router.put('/questions/:id', uploadImage.single('image'), (req, res) => {
    try {
      const qId = parseInt(req.params.id);
      const existing = questions.getById(qId);
      if (!existing) return res.status(404).json({ error: 'Question not found' });

      const quiz = quizzes.getById(existing.quiz_id);
      if (!quiz || Number(quiz.user_id) !== Number(req.user.userId)) {
        return res.status(403).json({ error: 'Bạn không có quyền chỉnh sửa' });
      }

      const { question_text, correct_answer } = req.body;
      let imagePath = existing.image_path;
      if (req.file) {
        imagePath = `/uploads/images/${req.file.filename}`;
      }

      questions.update(qId, question_text || existing.question_text, correct_answer || existing.correct_answer, imagePath, existing.audio_path);
      const updated = questions.getById(qId);
      res.json(updated);
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });

  router.delete('/questions/:id', (req, res) => {
    try {
      const qId = parseInt(req.params.id);
      const existing = questions.getById(qId);
      if (!existing) return res.status(404).json({ error: 'Question not found' });

      const quiz = quizzes.getById(existing.quiz_id);
      if (!quiz || Number(quiz.user_id) !== Number(req.user.userId)) {
        return res.status(403).json({ error: 'Bạn không có quyền xóa' });
      }

      questions.delete(qId);
      res.json({ success: true });
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });

  return router;
}

module.exports = createQuestionsRouter;
