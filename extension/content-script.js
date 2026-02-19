/* content-script.js
   Chat modal + reliable compose replacement logic (with logging & fallbacks).
*/
(function () {
  'use strict';

  const FLOAT_ID = 'sr-floating-rewrite';
  const MODAL_ID = 'sr-rewrite-modal';

  function log(...args) { try { console.log('[SR]', ...args); } catch (e) {} }

  function getComposeCandidates() {
    const selStr = [
      '[role="textbox"]',
      'div[contenteditable="true"]',
      '[aria-label="Message Body"]',
      'div[gh="mtb"] div[contenteditable="true"]'
    ].join(',');
    return Array.from(document.querySelectorAll(selStr));
  }

  function elementContainsCaret(el) {
    try {
      const sel = window.getSelection();
      if (!sel || sel.rangeCount === 0) return false;
      const anchor = sel.anchorNode;
      return anchor && el.contains(anchor);
    } catch (e) {
      return false;
    }
  }

  function findFocusedCompose() {
    const boxes = getComposeCandidates();
    if (!boxes || boxes.length === 0) return null;
    const active = document.activeElement;
    for (const b of boxes) {
      if (b === active || b.contains(active)) return b;
    }
    for (const b of boxes) {
      if (elementContainsCaret(b)) return b;
    }
    const labelled = boxes.find(b => b.getAttribute && b.getAttribute('aria-label') && b.getAttribute('aria-label').toLowerCase().includes('message'));
    if (labelled) return labelled;
    return boxes[boxes.length - 1] || null;
  }

  // Expose debug helper
  window.__SR_debug = window.__SR_debug || {};
  window.__SR_debug.findFocusedCompose = findFocusedCompose;

  // Floating UI
  function createFloatingUI() {
    if (document.getElementById(FLOAT_ID)) return;
    const container = document.createElement('div');
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

    const btn = document.createElement('button');
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

    container.appendChild(btn);
    document.body.appendChild(container);
    btn.addEventListener('click', onRewriteButtonClick);
  }

  // Modal builder (unchanged logic)
  function createModal() {
    if (document.getElementById(MODAL_ID)) return document.getElementById(MODAL_ID);

    const overlay = document.createElement('div');
    overlay.id = MODAL_ID;
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
      width: '640px',
      maxWidth: '95vw',
      maxHeight: '80vh',
      overflow: 'auto'
    });

    const header = document.createElement('div');
    header.style.display = 'flex';
    header.style.justifyContent = 'space-between';
    header.style.alignItems = 'center';
    header.style.marginBottom = '8px';

    const title = document.createElement('div');
    title.innerText = 'Rewrite (chat)';
    title.style.fontWeight = '600';
    header.appendChild(title);

    const closeBtn = document.createElement('button');
    closeBtn.innerText = 'Close';
    Object.assign(closeBtn.style, { border: 'none', background: '#eee', padding: '6px 10px', borderRadius: '6px', cursor: 'pointer' });
    closeBtn.onclick = () => overlay.remove();
    header.appendChild(closeBtn);
    overlay.appendChild(header);

    const controls = document.createElement('div');
    controls.style.display = 'flex';
    controls.style.gap = '8px';
    controls.style.marginBottom = '8px';

    const toneSelect = document.createElement('select');
    toneSelect.id = 'sr-tone-select';
    ['Friendly', 'Formal', 'Casual', 'Professional', 'Apologetic', 'Custom'].forEach(opt => {
      const o = document.createElement('option');
      o.value = opt.toLowerCase();
      o.innerText = opt;
      toneSelect.appendChild(o);
    });
    Object.assign(toneSelect.style, { padding: '6px', borderRadius: '6px' });

    const customInput = document.createElement('input');
    customInput.id = 'sr-custom-instruction';
    customInput.placeholder = 'Optional: e.g. "shorten, be more direct"';
    Object.assign(customInput.style, { flex: '1', padding: '6px', borderRadius: '6px', border: '1px solid #ddd' });

    controls.appendChild(toneSelect);
    controls.appendChild(customInput);
    overlay.appendChild(controls);

    const inputArea = document.createElement('textarea');
    inputArea.id = 'sr-original-text';
    Object.assign(inputArea.style, { width: '100%', height: '180px', padding: '8px', borderRadius: '6px', border: '1px solid #ddd', fontSize: '14px', marginBottom: '8px' });
    overlay.appendChild(inputArea);

    const genRow = document.createElement('div');
    genRow.style.display = 'flex';
    genRow.style.justifyContent = 'space-between';
    genRow.style.alignItems = 'center';

    const genBtn = document.createElement('button');
    genBtn.innerText = 'Generate';
    Object.assign(genBtn.style, { padding: '8px 12px', borderRadius: '8px', border: 'none', background: '#1a73e8', color: 'white', cursor: 'pointer' });

    const status = document.createElement('div');
    status.id = 'sr-status';
    status.style.fontSize = '13px';
    status.style.color = '#666';

    genRow.appendChild(status);
    genRow.appendChild(genBtn);
    overlay.appendChild(genRow);

    const resultArea = document.createElement('textarea');
    resultArea.id = 'sr-result-text';
    Object.assign(resultArea.style, { width: '100%', height: '160px', padding: '8px', borderRadius: '6px', border: '1px solid #ddd', fontSize: '14px', marginTop: '8px' });
    overlay.appendChild(resultArea);

    const acceptRow = document.createElement('div');
    acceptRow.style.display = 'flex';
    acceptRow.style.justifyContent = 'flex-end';
    acceptRow.style.gap = '8px';
    acceptRow.style.marginTop = '8px';

    const copyBtn = document.createElement('button');
    copyBtn.innerText = 'Copy';
    Object.assign(copyBtn.style, { padding: '8px 12px', borderRadius: '8px', border: 'none', background: '#ccc', cursor: 'pointer' });
    copyBtn.onclick = () => { try { navigator.clipboard.writeText(resultArea.value || '').then(()=> alert('Copied')); } catch (e) { alert('Copy failed'); } };

    const acceptBtn = document.createElement('button');
    acceptBtn.innerText = 'Accept -> Replace Draft';
    Object.assign(acceptBtn.style, { padding: '8px 12px', borderRadius: '8px', border: 'none', background: '#25a157', color: 'white', cursor: 'pointer' });

    acceptRow.appendChild(copyBtn);
    acceptRow.appendChild(acceptBtn);
    overlay.appendChild(acceptRow);

    // generate handler (sends to background)
    genBtn.addEventListener('click', () => {
      status.innerText = 'Generating…';
      genBtn.disabled = true;
      const orig = inputArea.value || '';
      const tone = toneSelect.value || 'friendly';
      const instructions = customInput.value || '';
      try {
        const payload = { original_text: orig, tone: tone, user_instructions: instructions };
        chrome.runtime.sendMessage({ action: 'rewrite', payload }, (resp) => {
          genBtn.disabled = false;
          if (!resp) { status.innerText = 'No response from background'; return; }
          if (!resp.ok) { status.innerText = 'Rewrite failed'; console.error(resp); return; }
          const rewritten = resp.data && resp.data.rewritten_text;
          resultArea.value = rewritten || '';
          status.innerText = 'Done';
          log('Received rewritten text, length:', (rewritten || '').length);
        });
      } catch (e) {
        status.innerText = 'Error';
        console.error(e);
        genBtn.disabled = false;
      }
    });

    // accept handler with robust replacement strategy
    acceptBtn.addEventListener('click', async () => {
      const out = resultArea.value || '';
      if (!out.trim()) return alert('No text to accept');

      // Find compose
      const compose = findFocusedCompose();
      log('Attempting to replace compose. compose found?', !!compose);

      // Strategy 1: Select compose root contents and insertText
      if (compose && compose.isContentEditable) {
        try {
          compose.focus();
          const sel = window.getSelection();
          sel.removeAllRanges();
          const range = document.createRange();
          range.selectNodeContents(compose);
          sel.addRange(range);

          // Try execCommand insertText (works in many contenteditable cases)
          const ok = document.execCommand('insertText', false, out);
          log('execCommand insertText result:', ok);
          // Check if replacement succeeded (compose contains the new text)
          const nowText = (compose.innerText || compose.textContent || '').trim();
          if (nowText && nowText.indexOf(out.slice(0,30)) !== -1) {
            log('Replacement succeeded via execCommand.');
            overlay.remove();
            return;
          } else {
            log('execCommand did not produce expected text, falling back.');
          }
        } catch (e) {
          log('execCommand error:', e && e.message);
        }
      }

      // Strategy 2: Set innerText (plain-text replace)
      if (compose) {
        try {
          if ('value' in compose) {
            compose.value = out;
            log('Replaced compose.value');
            overlay.remove();
            return;
          } else {
            // Some Gmail compose roots do better with innerText
            compose.innerText = out;
            log('Replaced compose.innerText');
            // verify
            const nowText2 = (compose.innerText || compose.textContent || '').trim();
            if (nowText2 && nowText2.indexOf(out.slice(0,30)) !== -1) {
              overlay.remove();
              return;
            } else {
              log('compose.innerText assignment did not reflect expected content.');
            }
          }
        } catch (e) {
          log('innerText assignment error:', e && e.message);
        }
      }

      // Strategy 3: Clipboard fallback
      try {
        await navigator.clipboard.writeText(out);
        alert('Rewritten text copied to clipboard. Please paste into your draft (Cmd+V).');
        overlay.remove();
        return;
      } catch (e) {
        log('clipboard fallback failed:', e && e.message);
      }

      alert('Could not automatically replace the draft. The rewritten text is shown in the modal; copy it manually.');
    });

    overlay._elements = { inputArea, resultArea, toneSelect, customInput, status };
    document.body.appendChild(overlay);
    return overlay;
  }

  function onRewriteButtonClick() {
    try {
      const modal = createModal();
      const elems = modal._elements;
      const compose = findFocusedCompose();
      let originalText = '';
      if (compose) originalText = compose.innerText || compose.textContent || '';
      elems.inputArea.value = originalText || '';
      elems.resultArea.value = '';
      elems.status.innerText = originalText ? 'Loaded from draft' : 'No draft found — paste text';
      modal.style.display = 'block';
    } catch (e) {
      console.error('onRewriteButtonClick error', e);
    }
  }

  try {
    createFloatingUI();
    const obs = new MutationObserver(() => { createFloatingUI(); });
    obs.observe(document.body, { childList: true, subtree: true });
    log('content script initialized');
  } catch (e) {
    console.error('content script init error', e);
  }

})();
