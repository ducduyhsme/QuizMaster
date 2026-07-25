const Auth = (() => {
  let currentUser = null;
  let token = localStorage.getItem('quizmaster-token') || null;

  try {
    const storedUser = localStorage.getItem('quizmaster-user');
    if (storedUser) currentUser = JSON.parse(storedUser);
  } catch (e) {}

  function getToken() {
    return token;
  }

  function getUser() {
    return currentUser;
  }

  function isLoggedIn() {
    return !!token && !!currentUser;
  }

  function setSession(userObj, tokenStr) {
    currentUser = userObj;
    token = tokenStr;
    if (userObj && tokenStr) {
      localStorage.setItem('quizmaster-user', JSON.stringify(userObj));
      localStorage.setItem('quizmaster-token', tokenStr);
    } else {
      localStorage.removeItem('quizmaster-user');
      localStorage.removeItem('quizmaster-token');
    }
    updateNavUser();
  }

  // Intercept fetch to attach auth header
  const originalFetch = window.fetch;
  window.fetch = async function (resource, config = {}) {
    config.headers = config.headers || {};
    if (token) {
      if (config.headers instanceof Headers) {
        config.headers.append('Authorization', `Bearer ${token}`);
      } else {
        config.headers['Authorization'] = `Bearer ${token}`;
      }
    }
    const response = await originalFetch(resource, config);
    if (response.status === 401 && token) {
      // Session expired
      setSession(null, null);
      showAuthModal('login', 'Phiên đăng nhập đã hết hạn. Vui lòng đăng nhập lại.');
    }
    return response;
  };

  async function checkAuth() {
    if (!token) {
      showAuthModal('login');
      return false;
    }
    try {
      const res = await fetch('/api/auth/me');
      if (res.ok) {
        const data = await res.json();
        if (data.user) {
          currentUser = data.user;
          localStorage.setItem('quizmaster-user', JSON.stringify(currentUser));
          updateNavUser();
          return true;
        }
      }
    } catch (e) {}
    setSession(null, null);
    showAuthModal('login');
    return false;
  }

  function updateNavUser() {
    const userContainer = document.getElementById('nav-user-container');
    if (!userContainer) return;

    if (isLoggedIn()) {
      userContainer.innerHTML = `
        <div style="display: flex; align-items: center; gap: 10px;">
          <span style="font-size: 14px; font-weight: 600; color: var(--text-accent);">👤 ${Components.escapeHtml(currentUser.username)}</span>
          <button class="btn btn-ghost btn-sm" onclick="Auth.logout()" style="padding: 4px 10px; font-size: 13px;">🚪 Đăng xuất</button>
        </div>
      `;
    } else {
      userContainer.innerHTML = `
        <button class="btn btn-primary btn-sm" onclick="Auth.showAuthModal('login')">🔑 Đăng nhập / Đăng ký</button>
      `;
    }
  }

  function showAuthModal(mode = 'login', msg = '') {
    const modalId = 'auth-modal';
    let modal = document.getElementById(modalId);
    if (modal) modal.remove();

    const isLogin = mode === 'login';

    const html = `
      <div class="modal-backdrop" id="${modalId}">
        <div class="modal-content" style="max-width: 400px; padding: 28px; border-radius: 16px;">
          <div style="text-align: center; margin-bottom: 20px;">
            <h2 style="font-size: 22px; font-weight: 800; color: var(--text-primary); margin-bottom: 6px;">
              ${isLogin ? '🔑 Đăng nhập QuizMaster' : '📝 Đăng ký tài khoản'}
            </h2>
            <p style="font-size: 13px; color: var(--text-secondary);">
              ${isLogin ? 'Nhập tài khoản để quản lý quiz và phiên chơi dở' : 'Tạo tài khoản mới để bắt đầu học tập'}
            </p>
            ${msg ? `<div style="margin-top: 10px; padding: 8px 12px; background: rgba(239, 68, 68, 0.15); color: #ef4444; border-radius: 8px; font-size: 13px;">${msg}</div>` : ''}
          </div>

          <form id="auth-form" onsubmit="Auth.handleAuthSubmit(event, '${mode}')">
            <div class="form-group" style="margin-bottom: 16px;">
              <label class="form-label" style="font-weight: 600;">Tên tài khoản</label>
              <input type="text" id="auth-username" class="form-input" placeholder="Tên tài khoản..." required autofocus autocomplete="username">
            </div>

            <div class="form-group" style="margin-bottom: 24px;">
              <label class="form-label" style="font-weight: 600;">Mật khẩu</label>
              <input type="password" id="auth-password" class="form-input" placeholder="Mật khẩu..." required autocomplete="${isLogin ? 'current-password' : 'new-password'}">
            </div>

            <button type="submit" class="btn btn-primary" style="width: 100%; padding: 12px; font-size: 15px; font-weight: 700; margin-bottom: 16px;">
              ${isLogin ? 'Đăng nhập' : 'Tạo tài khoản'}
            </button>
          </form>

          <div style="text-align: center; font-size: 13px; color: var(--text-secondary);">
            ${isLogin ? 'Chưa có tài khoản?' : 'Đã có tài khoản?'}
            <a href="javascript:void(0)" onclick="Auth.showAuthModal('${isLogin ? 'register' : 'login'}')" style="color: var(--text-accent); font-weight: 700; margin-left: 4px; text-decoration: underline;">
              ${isLogin ? 'Đăng ký ngay' : 'Đăng nhập'}
            </a>
          </div>

          <div style="text-align: center; margin-top: 16px; font-size: 12px; color: var(--text-muted);">
            💡 Admin mặc định: <b>admin</b> / <b>admin</b>
          </div>
        </div>
      </div>
    `;

    document.body.insertAdjacentHTML('beforeend', html);
  }

  async function handleAuthSubmit(event, mode) {
    event.preventDefault();
    const usernameInput = document.getElementById('auth-username');
    const passwordInput = document.getElementById('auth-password');
    if (!usernameInput || !passwordInput) return;

    const username = usernameInput.value.trim();
    const password = passwordInput.value.trim();

    if (!username || !password) {
      Components.showToast('Vui lòng điền đầy đủ tên tài khoản và mật khẩu', 'warning');
      return;
    }

    const endpoint = mode === 'login' ? '/api/auth/login' : '/api/auth/register';

    try {
      const res = await originalFetch(endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username, password })
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || 'Xác thực thất bại');
      }

      setSession(data.user, data.token);
      document.getElementById('auth-modal')?.remove();
      Components.showToast(mode === 'login' ? 'Đăng nhập thành công!' : 'Đăng ký tài khoản thành công!', 'success');

      if (window.location.hash === '' || window.location.hash === '#dashboard' || window.location.hash === '#login') {
        window.location.hash = '#dashboard';
      }
      window.location.reload();
    } catch (err) {
      Components.showToast(err.message, 'error');
    }
  }

  async function logout() {
    try {
      await fetch('/api/auth/logout', { method: 'POST' });
    } catch (e) {}
    setSession(null, null);
    Components.showToast('Đã đăng xuất', 'info');
    showAuthModal('login');
  }

  return {
    getToken,
    getUser,
    isLoggedIn,
    setSession,
    checkAuth,
    updateNavUser,
    showAuthModal,
    handleAuthSubmit,
    logout
  };
})();
