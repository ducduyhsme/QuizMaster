const express = require('express');
const { quizzes } = require('../database');

const router = express.Router();

router.get('/quizzes', (req, res) => {
  try {
    const publicQuizzes = quizzes.getPublicQuizzes(req.query.q || '');
    res.json(publicQuizzes);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.post('/clone/:id', (req, res) => {
  try {
    const quizId = parseInt(req.params.id);
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
