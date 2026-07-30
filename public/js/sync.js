// ============================================
// SyncManager - Real-Time Event Sync Controller
// ============================================

const SyncManager = (() => {
  let eventSource = null;

  function getAuthToken() {
    if (window.Auth && typeof window.Auth.getToken === 'function') {
      return window.Auth.getToken();
    }
    return localStorage.getItem('quizmaster-token') || null;
  }

  function getCurrentUserId() {
    return window.Utils ? Utils.getCurrentUserId() : 1;
  }

  function getProgressKeyPrefix() {
    return window.Utils ? Utils.getProgressKeyPrefix() : `quizmaster-progress-u${getCurrentUserId()}-`;
  }

  function init() {
    disconnect();
    const token = getAuthToken();
    if (!token && (!window.Auth || !window.Auth.isLoggedIn())) {
      return;
    }

    const url = token ? `/api/sync/events?token=${encodeURIComponent(token)}` : '/api/sync/events';
    
    try {
      eventSource = new EventSource(url);

      eventSource.onmessage = (event) => {
        if (!event.data) return;
        try {
          const data = JSON.parse(event.data);
          handleServerEvent(data);
        } catch (e) {
          console.warn('[SyncManager] Error parsing SSE payload:', e);
        }
      };

      eventSource.onerror = () => {
        // EventSource automatically retries connection
      };
    } catch (e) {
      console.warn('[SyncManager] EventSource init error:', e);
    }
  }

  function disconnect() {
    if (eventSource) {
      try {
        eventSource.close();
      } catch (e) {}
      eventSource = null;
    }
  }

  function handleServerEvent(event) {
    if (!event || !event.type) return;

    switch (event.type) {
      case 'SETTINGS_UPDATED':
        onSettingsUpdated(event.settings);
        break;
      case 'SESSION_SAVED':
        onSessionSaved(event.quizId, event.qtype, event.sessionData);
        break;
      case 'SESSION_DELETED':
        onSessionDeleted(event.quizId, event.qtype);
        break;
    }
  }

  function onSettingsUpdated(newSettings) {
    if (!newSettings || typeof newSettings !== 'object') return;

    // Update local storage
    if (newSettings.shuffle !== undefined) localStorage.setItem('quizmaster-shuffle', newSettings.shuffle);
    if (newSettings.swap !== undefined) localStorage.setItem('quizmaster-swap', newSettings.swap);
    if (newSettings.allowDuplicates !== undefined) localStorage.setItem('quizmaster-allow-duplicates', newSettings.allowDuplicates);
    if (newSettings.maxRetries !== undefined) localStorage.setItem('quizmaster-max-retries', newSettings.maxRetries);
    if (newSettings.autoAdvance !== undefined) localStorage.setItem('quizmaster-auto-advance', newSettings.autoAdvance);
    if (newSettings.theme !== undefined) {
      localStorage.setItem('quizmaster-theme', newSettings.theme);
      document.documentElement.setAttribute('data-theme', newSettings.theme);
      document.body.setAttribute('data-theme', newSettings.theme);
    }
    if (newSettings.chineseFont !== undefined) {
      localStorage.setItem('quizmaster-chinese-font', newSettings.chineseFont);
      document.documentElement.setAttribute('data-chinese-font', newSettings.chineseFont);
      document.body.setAttribute('data-chinese-font', newSettings.chineseFont);
    }
    if (newSettings.lang !== undefined) {
      localStorage.setItem('quizmaster-lang', newSettings.lang);
      if (window.I18n && typeof I18n.setLang === 'function') {
        I18n.setLang(newSettings.lang);
      }
    }
    if (newSettings.volume !== undefined) {
      localStorage.setItem('quizmaster-volume', newSettings.volume);
    }

    // Re-render settings view if user is currently looking at settings
    const currentHash = window.location.hash.slice(1) || '';
    if (currentHash === 'settings' && window.App && typeof App.renderSettings === 'function') {
      App.renderSettings();
    }
  }

  function onSessionSaved(quizId, qtype, sessionData) {
    if (!quizId || !sessionData) return;
    const effectiveQtype = qtype || 'all';
    const userPrefix = getProgressKeyPrefix();
    const storageKey = userPrefix + quizId + '_' + effectiveQtype;
    
    // Save to localStorage
    try {
      localStorage.setItem(storageKey, typeof sessionData === 'string' ? sessionData : JSON.stringify(sessionData));
      if (effectiveQtype === 'all') {
        localStorage.setItem(userPrefix + quizId, typeof sessionData === 'string' ? sessionData : JSON.stringify(sessionData));
      }
    } catch (e) {}

    // If viewing sessions, refresh view
    const currentHash = window.location.hash.slice(1) || '';
    if (currentHash === 'sessions' && window.SessionsView && typeof SessionsView.render === 'function') {
      SessionsView.render();
    }
  }

  function onSessionDeleted(quizId, qtype) {
    if (!quizId) return;
    const userPrefix = getProgressKeyPrefix();
    const effectiveQtype = qtype || 'all';

    if (effectiveQtype === 'all') {
      localStorage.removeItem(userPrefix + quizId);
      localStorage.removeItem(userPrefix + quizId + '_all');
      for (let i = localStorage.length - 1; i >= 0; i--) {
        const k = localStorage.key(i);
        if (k && k.startsWith(userPrefix + quizId)) {
          localStorage.removeItem(k);
        }
      }
    } else {
      localStorage.removeItem(userPrefix + quizId + '_' + effectiveQtype);
    }

    // If currently on sessions view, refresh view
    const currentHash = window.location.hash.slice(1) || '';
    if (currentHash === 'sessions' && window.SessionsView && typeof SessionsView.render === 'function') {
      SessionsView.render();
    }
  }

  return {
    init,
    disconnect
  };
})();

window.SyncManager = SyncManager;
