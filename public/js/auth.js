const Auth = (() => {
  let currentUser = null;
  let token = localStorage.getItem('quizmaster-token') || null;

  try {
    const storedUser = localStorage.getItem('quizmaster-user');
    if (storedUser) currentUser = JSON.parse(storedUser);
  } catch (e) {}

  function clearAuthModals() {
    document.querySelectorAll('#auth-modal, .modal-backdrop').forEach(el => el.remove());
  }

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
    clearAuthModals();
    if (userObj && tokenStr) {
      localStorage.setItem('quizmaster-user', JSON.stringify(userObj));
      localStorage.setItem('quizmaster-token', tokenStr);
    } else {
      localStorage.removeItem('quizmaster-user');
      localStorage.removeItem('quizmaster-token');
    }
    updateNavUser();
  }

  // Intercept fetch safely to attach auth header
  const originalFetch = window.fetch;
  window.fetch = async function (resource, config) {
    const opts = config ? { ...config } : {};
    opts.headers = opts.headers ? { ...opts.headers } : {};

    if (token) {
      opts.headers['Authorization'] = `Bearer ${token}`;
      opts.headers['x-session-token'] = token;
    }

    try {
      const response = await originalFetch(resource, opts);
      if (response.status === 401 && token) {
        setSession(null, null);
        renderLoginScreen('login');
      }
      return response;
    } catch (err) {
      console.warn('Fetch request error:', err);
      throw err;
    }
  };

  async function checkAuth() {
    if (!token) {
      renderLoginScreen('login');
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
    renderLoginScreen('login');
    return false;
  }

  function updateNavUser() {
    const userContainer = document.getElementById('nav-user-container');
    if (!userContainer) return;

    if (isLoggedIn()) {
      userContainer.innerHTML = `
        <div style="display: flex; align-items: center; gap: 10px;">
          <span style="font-size: 14px; font-weight: 600; color: var(--text-accent);">👤 ${Components.escapeHtml(currentUser.username)}</span>
          <button class="btn btn-ghost btn-sm" onclick="Auth.logout()" style="padding: 4px 10px; font-size: 13px; cursor: pointer;">${I18n.t('auth.logout')}</button>
        </div>
      `;
    } else {
      userContainer.innerHTML = `
        <button class="btn btn-primary btn-sm" onclick="Auth.renderLoginScreen('login')" style="cursor: pointer;">${I18n.t('auth.loginNav')}</button>
      `;
    }
  }

  function renderLoginScreen(mode = 'login') {
    clearAuthModals();
    const main = document.getElementById('main-content');
    if (!main) return;

    const isLogin = mode === 'login';

    main.innerHTML = `
      <div style="display: flex; justify-content: center; align-items: center; min-height: 70vh; padding: 20px;">
        <div class="card" style="max-width: 440px; width: 100%; padding: 36px 32px; border-radius: 20px; box-shadow: 0 10px 30px rgba(0, 0, 0, 0.2);">
          <div style="text-align: center; margin-bottom: 24px;">
            <div style="font-size: 48px; margin-bottom: 12px;">⚡</div>
            <h1 style="font-size: 26px; font-weight: 800; color: var(--text-primary); margin-bottom: 8px;">
              ${isLogin ? I18n.t('auth.loginTitle') : I18n.t('auth.registerTitle')}
            </h1>
            <p style="font-size: 14px; color: var(--text-secondary);">
              ${isLogin ? I18n.t('auth.loginSubtitle') : I18n.t('auth.registerSubtitle')}
            </p>
          </div>

          <form id="auth-main-form" onsubmit="Auth.handleAuthSubmit(event, '${mode}')">
            <div class="form-group" style="margin-bottom: 18px;">
              <label class="form-label" style="font-weight: 600;">${I18n.t('auth.username')}</label>
              <input type="text" id="auth-username" class="form-input" placeholder="${I18n.t('auth.usernamePlaceholder')}" required autofocus autocomplete="username" style="padding: 12px 16px;">
            </div>

            <div class="form-group" style="margin-bottom: 24px;">
              <label class="form-label" style="font-weight: 600;">${I18n.t('auth.password')}</label>
              <input type="password" id="auth-password" class="form-input" placeholder="${I18n.t('auth.passwordPlaceholder')}" required autocomplete="${isLogin ? 'current-password' : 'new-password'}" style="padding: 12px 16px;">
            </div>

            ${!isLogin ? `
            <div class="form-group" style="margin-bottom: 24px;">
              <label class="form-label" style="font-weight: 600;">${I18n.t('auth.confirmPassword')}</label>
              <input type="password" id="auth-confirm-password" class="form-input" placeholder="${I18n.t('auth.confirmPasswordPlaceholder')}" required autocomplete="new-password" style="padding: 12px 16px;">
            </div>
            ` : ''}

            <button type="submit" class="btn btn-primary btn-lg" style="width: 100%; padding: 14px; font-size: 16px; font-weight: 700; border-radius: 12px; margin-bottom: 20px; cursor: pointer;">
              ${isLogin ? I18n.t('auth.loginBtn') : I18n.t('auth.registerBtn')}
            </button>
          </form>

          <div style="text-align: center; font-size: 14px; color: var(--text-secondary);">
            ${isLogin ? I18n.t('auth.noAccount') : I18n.t('auth.hasAccount')}
            <a href="javascript:void(0)" onclick="Auth.renderLoginScreen('${isLogin ? 'register' : 'login'}')" style="color: var(--text-accent); font-weight: 700; margin-left: 6px; text-decoration: underline; cursor: pointer;">
              ${isLogin ? I18n.t('auth.registerLink') : I18n.t('auth.loginLink')}
            </a>
          </div>

          <div style="text-align: center; margin-top: 24px; padding-top: 16px; border-top: 1px solid var(--border-color); font-size: 13px; color: var(--text-muted);">
            ${I18n.t('auth.defaultNotice')}
          </div>
        </div>
      </div>
    `;
  }

  async function quickAdminLogin() {
    try {
      const res = await originalFetch('/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username: 'admin', password: 'admin' })
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Đăng nhập Admin thất bại');
      setSession(data.user, data.token);
      Components.showToast(I18n.t('auth.adminSuccess'), 'success');
      window.location.hash = '#dashboard';
      if (window.App && typeof App.handleRoute === 'function') {
        App.handleRoute();
      } else {
        window.location.reload();
      }
    } catch (err) {
      Components.showToast(err.message, 'error');
    }
  }

  async function handleAuthSubmit(event, mode) {
    event.preventDefault();
    const usernameInput = document.getElementById('auth-username');
    const passwordInput = document.getElementById('auth-password');
    if (!usernameInput || !passwordInput) return;

    const username = usernameInput.value.trim();
    const password = passwordInput.value.trim();

    if (!username || !password) {
      Components.showToast(I18n.t('auth.fillRequired'), 'warning');
      return;
    }

    // Validate confirm password on register
    if (mode === 'register') {
      const confirmInput = document.getElementById('auth-confirm-password');
      const confirmPassword = confirmInput ? confirmInput.value.trim() : '';
      if (password !== confirmPassword) {
        Components.showToast(I18n.t('auth.passwordMismatch'), 'warning');
        if (confirmInput) confirmInput.focus();
        return;
      }
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
      Components.showToast(mode === 'login' ? I18n.t('auth.loginSuccess') : I18n.t('auth.registerSuccess'), 'success');

      window.location.hash = '#dashboard';
      if (window.App && typeof App.renderDashboard === 'function') {
        App.renderDashboard();
      } else {
        window.location.reload();
      }
    } catch (err) {
      Components.showToast(err.message, 'error');
    }
  }

  async function logout() {
    try {
      await fetch('/api/auth/logout', { method: 'POST' });
    } catch (e) {}
    setSession(null, null);
    Components.showToast(I18n.t('auth.loggedOut'), 'info');
    renderLoginScreen('login');
  }

  return {
    getToken,
    getUser,
    isLoggedIn,
    setSession,
    checkAuth,
    updateNavUser,
    renderLoginScreen,
    quickAdminLogin,
    handleAuthSubmit,
    logout
  };
})();
