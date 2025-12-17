/*
  content-script.js (clean version)
  - Injects a fixed floating Rewrite button bottom-right.
  - Sends messages to the extension service worker to call the backend.
  - Avoids template-literal HTML blocks to reduce shell quoting issues.
*/

(function () {
  'use strict';

  var FLOAT_ID = 'sr-floating-rewrite';
  var STYLE_PROFILE = { tone: 'friendly but concise', signature: 'Best, Alex' };

  function createFloatingUI() {
    if (document.getElementById(FLOAT_ID)) return;
    var container = document.createElement('div');
    container.id = FLOAT_ID;
    Object.assign(container.style, {
      position: 'fixed',
      right: '18px',
      bottom: '18px',
      zIndex: 2147483647,
      display: 'flex',
      flexDirection: 'column',
      gap: '8px',
      alignItems: 'flex-end',
      fontFamily: 'Arial, sans-serif'
    });

    var btn = document.createElement('button');
    btn.innerText = 'Rewrite';
    btn.title = 'Rewrite message with my style';
    Object.assign(btn.style, {
      padding: '10px 14px',
      borderRadius: '10px',
      border: 'none',
      background: '#1a73e8',
      color: 'white',
      fontSize: '14px',
      cursor: 'pointer',
      boxShadow: '0 4px 10px rgba(0,0,0,0.2)'
    });

    var mini = document.createElement('button');
    mini.innerText = 'Edit';
    mini.title = 'Open inline editor';
    Object.assign(mini.style, {
      padding: '6px 10px',
      borderRadius: '8px',
      border: 'none',
      background: '#25a157',
      color: 'white',
      fontSize: '12px',
      cursor: 'pointer',
      boxShadow: '0 2px 6px rgba(0,0,0,0.15)'
    });

    container.appendChild(btn);
    container.appendChild(mini);
    document.body.appendChild(container);

    btn.addEventListener('click', onRewriteClick);
    mini.addEventListener('click', openInlineEditor);
  }

  function findFocusedCompose() {
    var boxes = Array.prototype.slice.call(document.querySelectorAll('[role=\"textbox\"], div[contenteditable=\"true\"], [aria-label=\"Message Body\"]'));
    for (var i = 0; i < boxes.length; i++) {
      var b = boxes[i];
      if (b === document.activeElement) return b;
      try {
        var sel = window.getSelection();
        if (sel && sel.rangeCount > 0 && b.contains(sel.anchorNode)) return b;
      } catch (e) {
        // ignore selection-related errors
      }
    }
    return boxes.length ? boxes[0] : null;
  }

  function openInlineEditor() {
    if (document.getElementById('sr-inline-editor')) return;
    var overlay = document.createElement('div');
    overlay.id = 'sr-inline-editor';
    Object.assign(overlay.style, {
      position: 'fixed',
      left: '50%',
      top: '50%',
      transform: 'translate(-50%, -50%)',
      zIndex: 2147483650,
      background: 'white',
      borderRadius: '8px',
      padding: '12px',
      boxShadow: '0 8px 24px rgba(0,0,0,0.3)',
      width: '520px'
    });

    // Build inner HTML without using backticks
    var header = document.createElement('div');
    header.style.display = 'flex';
    header.style.justifyContent = 'space-between';
    header.style.alignItems = 'center';
    header.style.marginBottom = '8px';

    var title = document.createElement('strong');
    title.innerText = 'Inline Editor';
    var closeBtn = document.createElement('button');
    closeBtn.innerText = 'Close';
    Object.assign(closeBtn.style, { border: 'none', background: '#eee', padding: '6px', borderRadius: '6px', cursor: 'pointer' });
    header.appendChild(title);
    header.appendChild(closeBtn);

    var textarea = document.createElement('textarea');
    textarea.id = 'sr-inline-text';
    Object.assign(textarea.style, { width: '100%', height: '160px', padding: '8px', borderRadius: '6px', border: '1px solid #ddd', fontSize: '14px' });

    var footer = document.createElement('div');
    footer.style.display = 'flex';
    footer.style.justifyContent = 'flex-end';
    footer.style.marginTop = '8px';

    var rewriteBtn = document.createElement('button');
    rewriteBtn.innerText = 'Rewrite';
    Object.assign(rewriteBtn.style, { padding: '8px 12px', borderRadius: '8px', border: 'none', background: '#1a73e8', color: 'white', cursor: 'pointer' });

    footer.appendChild(rewriteBtn);

    overlay.appendChild(header);
    overlay.appendChild(textarea);
    overlay.appendChild(footer);
    document.body.appendChild(overlay);

    closeBtn.onclick = function () { overlay.remove(); };
    rewriteBtn.onclick = function () {
      var txt = textarea.value || '';
      if (!txt.trim()) return alert('Paste some text first');
      callRewriteAPI(txt).then(function (rewritten) {
        if (rewritten) textarea.value = rewritten;
      });
    };
  }

  function onRewriteClick() {
    var compose = findFocusedCompose();
    if (!compose) {
      openInlineEditor();
      return;
    }
    var original = compose.innerText || compose.textContent || '';
    if (!original.trim()) {
      alert('Compose box empty — click inside your draft and try again.');
      return;
    }

    try {
      var message = { action: 'rewrite', payload: { original_text: original, style_profile: STYLE_PROFILE } };
      chrome.runtime.sendMessage(message, function (response) {
        if (!response) { alert('No response from extension background. See extension service worker logs.'); return; }
        if (!response.ok) { alert('Rewrite failed: ' + (response.error || response.body || 'unknown')); return; }
        var rewritten = response.data && response.data.rewritten_text;
        if (rewritten) {
          compose.focus();
          document.execCommand('selectAll', false, null);
          document.execCommand('insertText', false, rewritten);
        } else {
          alert('No rewritten text returned.');
        }
      });
    } catch (err) {
      console.error('rewrite message error', err);
      alert('Error requesting rewrite: ' + err.message);
    }
  }

  function callRewriteAPI(text) {
    return new Promise(function (resolve) {
      var message = { action: 'rewrite', payload: { original_text: text, style_profile: STYLE_PROFILE } };
      chrome.runtime.sendMessage(message, function (response) {
        if (!response || !response.ok) return resolve(null);
        resolve(response.data && response.data.rewritten_text);
      });
    });
  }

  // initialize
  try {
    createFloatingUI();
    // expose debug helpers
    window.__SR_debug = { findFocusedCompose: findFocusedCompose, callRewriteAPI: callRewriteAPI };
    console.log('[SR] content script loaded — floating UI injected if page allowed it.');
  } catch (e) {
    console.error('[SR] content script init error', e);
  }
})();
