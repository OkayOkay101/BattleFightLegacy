(function (root, factory) {
  if (typeof module === 'object' && module.exports) {
    module.exports = { createGameI18n: factory };
  } else {
    root.GameI18n = { createGameI18n: factory };
  }
})(typeof window !== 'undefined' ? window : globalThis, function createGameI18n(options) {
  options = options || {};
  const messages = options.messages || {};
  const storage = options.storage === undefined
    ? (typeof localStorage !== 'undefined' ? localStorage : null)
    : options.storage;
  const documentRef = options.document || (typeof document !== 'undefined' ? document : null);
  let current = 'en';
  try {
    const saved = storage && storage.getItem('battlefight.language');
    if (saved === 'en' || saved === 'th') current = saved;
  } catch (_) {}

  const listeners = new Set();
  function t(key, values) {
    const selected = messages[current] || {};
    const english = messages.en || {};
    const template = selected[key] == null ? (english[key] == null ? key : english[key]) : selected[key];
    const parameters = values || {};
    return String(template).replace(/\{([A-Za-z0-9_]+)\}/g, (_, name) => {
      return parameters[name] == null ? '' : String(parameters[name]);
    });
  }

  function apply(rootNode) {
    const target = rootNode || documentRef;
    if (!target || typeof target.querySelectorAll !== 'function') return;
    target.querySelectorAll('[data-i18n]').forEach(node => {
      node.textContent = t(node.getAttribute('data-i18n'));
    });
    target.querySelectorAll('[data-i18n-placeholder]').forEach(node => {
      node.setAttribute('placeholder', t(node.getAttribute('data-i18n-placeholder')));
    });
    target.querySelectorAll('[data-i18n-aria-label]').forEach(node => {
      node.setAttribute('aria-label', t(node.getAttribute('data-i18n-aria-label')));
    });
    target.querySelectorAll('[data-language-selector]').forEach(node => {
      node.value = current;
    });
  }

  return {
    language: () => current,
    t,
    setLanguage(language) {
      if (language !== 'en' && language !== 'th') return false;
      if (language === current) return true;
      current = language;
      try {
        if (storage) storage.setItem('battlefight.language', current);
      } catch (_) {}
      apply();
      listeners.forEach(listener => listener(current));
      return true;
    },
    apply,
    subscribe(listener) {
      if (typeof listener !== 'function') return () => {};
      listeners.add(listener);
      return () => listeners.delete(listener);
    }
  };
});
