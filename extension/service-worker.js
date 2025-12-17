/*
  service-worker.js
  Receives messages from content script and proxies network requests to server.
*/
chrome.runtime.onInstalled.addListener(() => {
  console.log('Style Rewriter service worker installed.');
});

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (!message || message.action !== 'rewrite') return;
  const payload = message.payload || {};
  const SERVER_URL = 'http://localhost:3000/api/rewrite';

  (async () => {
    try {
      const resp = await fetch(SERVER_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });

      if (!resp.ok) {
        const text = await resp.text();
        sendResponse({ ok: false, status: resp.status, statusText: resp.statusText, body: text });
        return;
      }

      const j = await resp.json();
      sendResponse({ ok: true, data: j });
    } catch (err) {
      console.error('service-worker fetch error:', err);
      sendResponse({ ok: false, error: err.message });
    }
  })();

  // keep channel open for async response
  return true;
});
