// ============================================
// Utils - Common Shared Helpers
// ============================================

const Utils = (() => {
  function getCurrentUserObj() {
    if (typeof Auth !== 'undefined' && typeof Auth.getUser === 'function') {
      const u = Auth.getUser();
      if (u) return u;
    }
    if (window.Auth && typeof window.Auth.getUser === 'function') {
      const u = window.Auth.getUser();
      if (u) return u;
    }
    try {
      const stored = localStorage.getItem('quizmaster-user');
      if (stored) return JSON.parse(stored);
    } catch (e) {}
    return null;
  }

  function getCurrentUserId() {
    const user = getCurrentUserObj();
    return (user && (user.id || user.userId)) ? Number(user.id || user.userId) : 1;
  }

  function getProgressKeyPrefix() {
    const uid = getCurrentUserId();
    return `quizmaster-progress-u${uid}-`;
  }

  function normalizeText(str) {
    return String(str || '')
      .trim()
      .toLowerCase()
      .normalize('NFC')
      .replace(/\s+/g, ' ');
  }

  return {
    getCurrentUserObj,
    getCurrentUserId,
    getProgressKeyPrefix,
    normalizeText
  };
})();

window.Utils = Utils;
