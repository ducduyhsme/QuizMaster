const express = require('express');
const { sessions } = require('../database');

function createSessionsRouter(broadcastToUser) {
  const router = express.Router();

  router.get('/vocab', (req, res) => {
    try {
      const groups = sessions.getByUserGroupedByQuiz(req.user.userId);
      res.json(groups);
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });

  router.get('/', (req, res) => {
    try {
      const list = sessions.getByUserGroupedByQuiz(req.user.userId);
      res.json(list);
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });

  router.post('/save', (req, res) => {
    try {
      const { quizId, qtype = 'all', sessionData } = req.body;
      if (!quizId || !sessionData) {
        return res.status(400).json({ error: 'quizId and sessionData are required' });
      }
      sessions.save(req.user.userId, parseInt(quizId), qtype, sessionData);

      broadcastToUser(req.user.userId, {
        type: 'SESSION_SAVED',
        quizId: parseInt(quizId),
        qtype,
        sessionData,
        updatedAt: Date.now()
      }, res);

      res.json({ success: true });
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });

  router.delete('/:id', (req, res) => {
    try {
      const deleted = sessions.deleteById(parseInt(req.params.id), req.user.userId);
      if (deleted) {
        broadcastToUser(req.user.userId, {
          type: 'SESSION_DELETED',
          quizId: deleted.quiz_id,
          qtype: deleted.qtype,
          sessionId: parseInt(req.params.id),
          updatedAt: Date.now()
        }, res);
      }
      res.json({
        success: true,
        quizId: deleted ? deleted.quiz_id : null,
        qtype: deleted ? deleted.qtype : null
      });
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });

  router.delete('/quiz/:quizId/qtype/:qtype', (req, res) => {
    try {
      const quizId = parseInt(req.params.quizId);
      const qtype = req.params.qtype;
      sessions.delete(req.user.userId, quizId, qtype);

      broadcastToUser(req.user.userId, {
        type: 'SESSION_DELETED',
        quizId,
        qtype,
        updatedAt: Date.now()
      }, res);

      res.json({ success: true, quizId, qtype });
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });

  return router;
}

module.exports = createSessionsRouter;
