/*
  Robust content script: watches for new compose windows and injects a small button
  near each compose toolbar. When clicked, it sends the compose text to the local server
  at http://localhost:3000/api/rewrite and replaces the text with the rewritten result.
*/

const BUTTON_CLASS = 'sr-rewrite-btn-v1';
const SERVER_URL = 'http://localhost:3000/api/rewrite';
const STYLE_PROFILE = {
  tone: 'friendly but concise',
  signature: 'Best, Alex'
};

// Create button element
function makeButton() {
  const btn = document.createElement('button');
  btn.className = BUTTON_CLASS;
  btn.innerText = 'Rewrite';
  btn.title = 'Rewrite with my style';
  btn.style.padding = '6px 10px';
  btn.style.borderRadius = '6px';
  btn.style.border = 'none';
  btn.style.cursor = 'pointer';
  btn.style.boxShadow = '0 1px 3px rgba(0,0,0,0.2)';
  btn.style.background = '#1a73e8';
  btn.style.color = 'white';
  btn.style.fontSize = '12px';
  btn.style.marginLeft = '8px';
  return btn;
}

// Given a compose root element, attach a rewrite button if not present
function attachButtonToCompose(composeRoot) {
  if (!composeRoot) return;
  // Prevent duplicates
  if (composeRoot.querySelector('.' + BUTTON_CLASS)) return;

  // Try to find a toolbar area inside the compose root to attach the button
  // Gmail has many variants; we try a few likely selectors.
  const toolbar =
    composeRoot.querySelector('[aria-label="Formatting options"]') ||
    composeRoot.querySelector('[aria-label="Formatting options toolbar"]') ||
    composeRoot.querySelector('[role="toolbar"]') ||
    composeRoot.querySelector('div[command="Formatting options"]');

  // If toolbar found, append the button; otherwise, append to compose header
  const btn = makeButton();

  if (toolbar) {
    toolbar.appendChild(btn);
  } else {
    // fallback: append to top of composeRoot
    composeRoot.insertBefore(btn, composeRoot.firstChild);
  }

  btn.addEventListener('click', async (e) => {
    // Find the compose textbox inside this composeRoot
    const textbox =
      composeRoot.querySelector('[role="textbox"]') ||
      composeRoot.querySelector('[aria-label="Message Body"]') ||
      composeRoot.querySelector('div[contenteditable="true"]');

    if (!textbox) {
      alert('Could not find compose textbox. Click inside the draft and try again.');
      return;
    }

    const originalText = textbox.innerText || textbox.textContent || '';
    if (!originalText.trim()) {
      alert('Compose box is empty — please type or paste the message first.');
      return;
    }

    // Feedback
    const prevText = btn.innerText;
    btn.innerText = 'Rewriting…';
    btn.disabled = true;

    try {
      const resp = await fetch(SERVER_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          original_text: originalText,
          style_profile: STYLE_PROFILE
        })
      });

      if (!resp.ok) {
        const txt = await resp.text();
        throw new Error('Server error: ' + txt);
      }

      const data = await resp.json();
      const rewritten = data.rewritten_text;
      if (rewritten && rewritten.trim()) {
        // Replace content in textbox. Use Clipboard API/execCommand fallback.
        // Try to preserve minimal formatting by inserting plain text.
        // Focus then replace selection
        textbox.focus();
        // Use Document API: select all and replace with plain text
        document.execCommand('selectAll', false, null);
        document.execCommand('insertText', false, rewritten);
      } else {
        alert('No rewritten text returned from server.');
      }
    } catch (err) {
      console.error('Rewrite error', err);
      alert('Error rewriting message: ' + err.message);
    } finally {
      btn.innerText = prevText;
      btn.disabled = false;
    }
  });
}

// Observe the DOM for compose windows
function observeForComposes() {
  const root = document.body;
  if (!root) return;

  const observer = new MutationObserver((mutations) => {
    for (const m of mutations) {
      for (const node of Array.from(m.addedNodes)) {
        if (!(node instanceof HTMLElement)) continue;

        // Gmail compose root often has attribute 'role="dialog"' or 'data-tooltip' etc.
        // We'll consider nodes that contain a [role="textbox"] child as possible compose windows.
        if (node.querySelector && node.querySelector('[role="textbox"], div[contenteditable="true"]')) {
          attachButtonToCompose(node);
        } else {
          // Also scan deeper for compose-like roots
          const possibleComposes = node.querySelectorAll
            ? node.querySelectorAll('[role="dialog"], [role="textbox"], div[contenteditable="true"]')
            : [];
          possibleComposes.forEach((el) => {
            const composeRoot = el.closest('[role="dialog"], .ads, .nH'); // best-effort
            if (composeRoot) attachButtonToCompose(composeRoot);
          });
        }
      }
      // Also attach buttons to existing compose roots (in case the DOM loaded earlier)
      const existing = document.querySelectorAll('[role="dialog"], [role="textbox"], div[contenteditable="true"]');
      existing.forEach((el) => {
        const composeRoot = el.closest('[role="dialog"], .nH, .aoI');
        if (composeRoot) attachButtonToCompose(composeRoot);
      });
    }
  });

  observer.observe(root, { childList: true, subtree: true });

  // Initial pass after load
  setTimeout(() => {
    const existing = document.querySelectorAll('[role="dialog"], [role="textbox"], div[contenteditable="true"]');
    existing.forEach((el) => {
      const composeRoot = el.closest('[role="dialog"], .nH, .aoI') || document.body;
      attachButtonToCompose(composeRoot);
    });
  }, 1500);
}

observeForComposes();
