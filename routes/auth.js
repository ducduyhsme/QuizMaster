const express = require('express');
const crypto = require('crypto');
const { users, userSessions } = require('../database');

const router = express.Router();

function createAuthRouter(activeSessions) {
  router.post('/register', (req, res) => {
    try {
      const { username, password } = req.body;
      if (!username || !password) {
        return res.status(400).json({ error: 'Username and password are required' });
      }
      const cleanUser = String(username).trim();
      if (cleanUser.length < 3) {
        return res.status(400).json({ error: 'Username must be at least 3 characters' });
      }
      if (password.length < 3) {
        return res.status(400).json({ error: 'Password must be at least 3 characters' });
      }

      const existing = users.findByUsername(cleanUser);
      if (existing) {
        return res.status(400).json({ error: 'Tên tài khoản đã tồn tại' });
      }

      const user = users.create(cleanUser, password);
      const token = crypto.randomBytes(24).toString('hex');
      const sessionObj = { userId: user.id, username: user.username };
      activeSessions.set(token, sessionObj);
      userSessions.save(token, user.id, user.username);

      res.status(201).json({ user: sessionObj, token });
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });

  router.post('/login', (req, res) => {
    try {
      const { username, password } = req.body;
      if (!username || !password) {
        return res.status(400).json({ error: 'Username and password are required' });
      }

      const user = users.findByUsername(String(username).trim());
      if (!user || !users.verifyPassword(user, password)) {
        return res.status(401).json({ error: 'Tài khoản hoặc mật khẩu không chính xác' });
      }

      const token = crypto.randomBytes(24).toString('hex');
      const sessionObj = { userId: user.id, username: user.username };
      activeSessions.set(token, sessionObj);
      userSessions.save(token, user.id, user.username);

      res.json({ user: sessionObj, token });
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });

  router.post('/logout', (req, res) => {
    const authHeader = req.headers.authorization;
    let token = null;
    if (authHeader && authHeader.startsWith('Bearer ')) {
      token = authHeader.substring(7);
    } else if (req.headers['x-session-token']) {
      token = req.headers['x-session-token'];
    }
    if (token) {
      activeSessions.delete(token);
      userSessions.delete(token);
    }
    res.json({ success: true });
  });

  router.get('/me', (req, res) => {
    res.json({ user: req.user });
  });

  router.post('/change-password', (req, res) => {
    try {
      const { oldPassword, newPassword } = req.body;
      if (!oldPassword || !newPassword) {
        return res.status(400).json({ error: 'Mật khẩu cũ và mật khẩu mới là bắt buộc' });
      }
      if (newPassword.length < 3) {
        return res.status(400).json({ error: 'Mật khẩu mới phải có ít nhất 3 ký tự' });
      }

      const dbUser = users.findById(req.user.userId);
      const fullUser = users.findByUsername(dbUser.username);

      if (!users.verifyPassword(fullUser, oldPassword)) {
        return res.status(400).json({ error: 'Mật khẩu cũ không chính xác' });
      }

      users.changePassword(req.user.userId, newPassword);
      res.json({ success: true, message: 'Đã đổi mật khẩu thành công' });
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });

  return router;
}

module.exports = createAuthRouter;
