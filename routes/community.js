const express = require('express');
const { quizzes } = require('../database');
const { requireAuth } = require('../middleware/auth');

const router = express.Router();

router.get('/quizzes', (req, res) => {
  try {
    const publicQuizzes = quizzes.getPublicQuizzes(req.query.q || '');
    res.json(publicQuizzes);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.post('/clone/:id', requireAuth, (req, res) => {
  try {
    const quizId = parseInt(req.params.id);
    const quiz = quizzes.getById(quizId);
    if (!quiz) {
      return res.status(404).json({ error: 'Quiz không tồn tại để sao chép' });
    }
    if (quiz.visibility !== 'public' && Number(quiz.user_id) !== Number(req.user.userId)) {
      return res.status(403).json({ error: 'Chỉ có thể sao chép các Quiz ở chế độ Công khai' });
    }

    const newQuizId = quizzes.cloneToUser(quizId, req.user.userId);
    if (!newQuizId) {
      return res.status(404).json({ error: 'Quiz không tồn tại để sao chép' });
    }
    res.json({ success: true, newQuizId, message: 'Đã tải Quiz về bộ sưu tập cá nhân' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
