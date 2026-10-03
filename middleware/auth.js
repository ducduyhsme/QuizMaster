// ============================================
// Auth Middleware
// ============================================

function requireAuth(req, res, next) {
  if (!req.user || !req.user.userId) {
    return res.status(401).json({ error: 'Yêu cầu đăng nhập để thực hiện thao tác này' });
  }
  next();
}

module.exports = {
  requireAuth
};
