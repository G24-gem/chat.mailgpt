/* ============================== MailGPT Frontend App ============================== */
const App = (() => {
  // State
  let currentSessionId = null;
  let sessions = [];
  let uploadedFiles = [];
  let currentHtmlEmail = null;
  let isLoading = false;

  // DOM helpers
  const $ = id => document.getElementById(id);
  const els = {
    sidebar: $('sidebar'),
    sidebarOverlay: $('sidebarOverlay'),
    menuToggle: $('menuToggle'),
    newChatBtn: $('newChatBtn'),
    searchInput: $('searchInput'),
    sessionsList: $('sessionsList'),
    topbarTitle: $('topbarTitle'),
    clearBtn: $('clearBtn'),
    chatArea: $('chatArea'),
    welcomeScreen: $('welcomeScreen'),
    messagesContainer: $('messagesContainer'),
    recipientInput: $('recipientInput'),
    subjectInput: $('subjectInput'),
    mediaStrip: $('mediaStrip'),
    messageInput: $('messageInput'),
    fileInput: $('fileInput'),
    sendBtn: $('sendBtn'),
    sendModal: $('sendModal'),
    modalClose: $('modalClose'),
    modalCancelBtn: $('modalCancelBtn'),
    modalSendBtn: $('modalSendBtn'),
    modalTo: $('modalTo'),
    modalSubject: $('modalSubject'),
    modalPreview: $('modalPreview'),
    toast: $('toast'),
  };

  /* ---- Sidebar ---- */
  function initSidebar() {
    els.menuToggle.addEventListener('click', toggleSidebar);
    els.sidebarOverlay.addEventListener('click', closeSidebar);
    els.newChatBtn.addEventListener('click', () => { newSession(); closeSidebar(); });
  }
  function toggleSidebar() {
    els.sidebar.classList.toggle('open');
    els.sidebarOverlay.classList.toggle('show');
  }
  function closeSidebar() {
    els.sidebar.classList.remove('open');
    els.sidebarOverlay.classList.remove('show');
  }

  /* ---- LocalStorage ---- */
  function saveToLocalStorage() {
    try {
      localStorage.setItem('mailgpt_sessions', JSON.stringify(sessions));
      localStorage.setItem('mailgpt_current', currentSessionId || '');
    } catch(e) {
      console.log('LocalStorage save failed:', e.message);
    }
  }

  function loadFromLocalStorage() {
    try {
      const saved = localStorage.getItem('mailgpt_sessions');
      if (saved) {
        const parsed = JSON.parse(saved);
        if (parsed && parsed.length > 0) {
          sessions = parsed;
          renderSessions();
          return true;
        }
      }
    } catch(e) {
      console.log('LocalStorage load failed:', e.message);
    }
    return false;
  }

  function getLocalSession(id) {
    try {
      const saved = JSON.parse(localStorage.getItem('mailgpt_sessions') || '[]');
      return saved.find(s => s.id === id) || null;
    } catch { return null; }
  }

  /* ---- Sessions ---- */
  async function loadSessions() {
    const hadLocal = loadFromLocalStorage();
    if (!hadLocal) {
      try {
        const res = await fetch('/api/chat/sessions');
        sessions = await res.json();
        renderSessions();
        saveToLocalStorage();
      } catch {}
    }
  }

  function renderSessions(filter = '') {
    const f = filter.toLowerCase();
    const list = f ? sessions.filter(s => s.title.toLowerCase().includes(f)) : sessions;
    if (!list.length) {
      els.sessionsList.innerHTML = `<div class="sessions-empty">No emails yet.<br>Start composing!</div>`;
      return;
    }
    els.sessionsList.innerHTML = list.map(s => `
      <div class="session-item ${s.id === currentSessionId ? 'active' : ''}" onclick="App.switchSession('${s.id}')">
        <div class="session-icon">✉</div>
        <div class="session-info">
          <div class="session-title" ondblclick="App.startRename(event,'${s.id}')" title="Double-click to rename">${htmlEsc(s.title)}</div>
          <div class="session-preview">${htmlEsc(s.preview || 'Email thread')}</div>
        </div>
        <div class="session-actions">
          <button class="session-rename-btn" onclick="App.startRename(event,'${s.id}')" title="Rename">
            <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>
          </button>
          <button class="session-del" onclick="App.deleteSession(event,'${s.id}')" title="Delete">
            <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>
            </svg>
          </button>
        </div>
      </div>`).join('');
  }

  /* ---- Session Rename ---- */
  function startRename(e, id) {
    e.stopPropagation();
    const item = e.target.closest('.session-item');
    const titleEl = item.querySelector('.session-title');
    const currentTitle = sessions.find(s => s.id === id)?.title || '';

    // Swap title text for an input
    titleEl.innerHTML = '';
    const input = document.createElement('input');
    input.type = 'text';
    input.value = currentTitle;
    input.className = 'session-rename-input';
    titleEl.appendChild(input);
    input.focus();
    input.select();

    function commitRename() {
      const newTitle = input.value.trim() || currentTitle;
      const idx = sessions.findIndex(s => s.id === id);
      if (idx >= 0) {
        sessions[idx].title = newTitle;
        saveToLocalStorage();
        if (currentSessionId === id) els.topbarTitle.textContent = newTitle;
      }
      renderSessions();
    }

    input.addEventListener('blur', commitRename);
    input.addEventListener('keydown', e => {
      if (e.key === 'Enter') { e.preventDefault(); input.blur(); }
      if (e.key === 'Escape') { input.value = currentTitle; input.blur(); }
    });
  }

  async function newSession() {
    try {
      const res = await fetch('/api/chat/sessions', { method: 'POST' });
      const s = await res.json();
      currentSessionId = s.id;
      sessions.unshift({ id: s.id, title: 'New Email', preview: '', messages: [], createdAt: Date.now(), updatedAt: Date.now() });
      renderSessions();
      saveToLocalStorage();
      clearChatUI();
      els.topbarTitle.textContent = 'New Email';
      els.clearBtn.style.display = 'none';
      uploadedFiles = [];
      renderMediaStrip();
      currentHtmlEmail = null;
    } catch { showToast('Could not create session', 'error'); }
  }

  async function switchSession(id) {
    if (id === currentSessionId) { closeSidebar(); return; }
    currentSessionId = id;
    closeSidebar();
    renderSessions();
    try {
      const localSession = getLocalSession(id);
      let session;
      if (localSession && localSession.messages && localSession.messages.length > 0) {
        session = localSession;
      } else {
        const res = await fetch(`/api/chat/sessions/${id}`);
        session = await res.json();
      }
      clearChatUI();
      els.topbarTitle.textContent = session.title || 'Email';
      currentHtmlEmail = null;
      const msgs = session.messages || [];
      for (let i = 0; i < msgs.length; i++) {
        const m = msgs[i];
        if (m.role === 'user') {
          appendMessage('user', m.content);
        } else {
          const { msg, html } = parseAI(m.content);
          appendAIMessage(msg, html);
          if (html) currentHtmlEmail = html;
        }
      }
      if (msgs.length > 0) { showChat(); els.clearBtn.style.display = 'flex'; }
      scrollBottom();
    } catch { showToast('Failed to load session', 'error'); }
  }

  async function deleteSession(e, id) {
    e.stopPropagation();
    try {
      await fetch(`/api/chat/sessions/${id}`, { method: 'DELETE' });
      sessions = sessions.filter(s => s.id !== id);
      if (currentSessionId === id) {
        currentSessionId = null;
        clearChatUI();
        showWelcome();
        els.topbarTitle.textContent = 'MailGPT';
        els.clearBtn.style.display = 'none';
        currentHtmlEmail = null;
      }
      renderSessions();
      saveToLocalStorage();
    } catch { showToast('Delete failed', 'error'); }
  }

  /* ---- File Upload ---- */
  function initFileUpload() {
    els.fileInput.addEventListener('change', async e => {
      const files = Array.from(e.target.files);
      if (!files.length) return;
      showToast('Uploading…');
      const fd = new FormData();
      files.forEach(f => fd.append('files', f));
      try {
        const res = await fetch('/api/media/upload', { method: 'POST', body: fd });
        const data = await res.json();
        if (data.success) {
          uploadedFiles.push(...data.files);
          renderMediaStrip();
          showToast('Files ready!', 'success');
        } else {
          showToast(data.error || 'Upload failed', 'error');
        }
      } catch { showToast('Upload failed', 'error'); }
      e.target.value = '';
    });
  }

  function renderMediaStrip() {
    if (!uploadedFiles.length) { els.mediaStrip.innerHTML = ''; return; }
    els.mediaStrip.innerHTML = uploadedFiles.map((f, i) => {
      const isImg = f.mimetype && f.mimetype.startsWith('image/');
      const thumb = isImg
        ? `<img src="${f.url}" class="media-chip-thumb" alt="${htmlEsc(f.originalName)}">`
        : `<div class="media-chip-icon">${fileIcon(f.mimetype)}</div>`;
      return `<div class="media-chip">
        ${thumb}
        <span class="media-chip-name">${htmlEsc(f.originalName)}</span>
        <button class="media-chip-remove" onclick="App.removeFile(${i})">
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
        </button>
      </div>`;
    }).join('');
  }

  function removeFile(i) { uploadedFiles.splice(i, 1); renderMediaStrip(); }
  function fileIcon(m = '') {
    if (m.startsWith('video/')) return '🎥';
    if (m.startsWith('image/')) return '🖼';
    if (m.includes('pdf')) return '📄';
    return '📎';
  }

  /* ---- Textarea ---- */
  function initTextarea() {
    const ta = els.messageInput;
    ta.addEventListener('input', () => {
      ta.style.height = 'auto';
      ta.style.height = Math.min(ta.scrollHeight, 200) + 'px';
    });
    ta.addEventListener('keydown', e => {
      if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); sendMessage(); }
    });
    els.sendBtn.addEventListener('click', sendMessage);
  }

  /* ---- Send ---- */
  async function sendMessage() {
    const text = els.messageInput.value.trim();
    if (!text && uploadedFiles.length === 0) return;
    if (isLoading) return;
    if (!currentSessionId) await newSession();
    const recipient = els.recipientInput.value.trim();
    const subject = els.subjectInput.value.trim();
    const files = [...uploadedFiles];
    const message = text;
    els.messageInput.value = '';
    els.messageInput.style.height = 'auto';
    uploadedFiles = [];
    renderMediaStrip();
    showChat();
    els.clearBtn.style.display = 'flex';
    appendMessage('user', message, files);
    const thinking = appendThinking();
    isLoading = true;
    els.sendBtn.disabled = true;
    try {
      const res = await fetch('/api/chat/message', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ sessionId: currentSessionId, message, mediaFiles: files, recipientEmail: recipient, emailSubject: subject }),
      });
      const data = await res.json();
      thinking.remove();
      if (!res.ok) {
        appendAIMessage(`⚠️ ${data.error || 'Something went wrong.'}`, null);
      } else {
        currentSessionId = data.sessionId;
        appendAIMessage(data.message, data.htmlEmail);
        if (data.htmlEmail) currentHtmlEmail = data.htmlEmail;
        const aiStoredContent = data.message +
          (data.htmlEmail ? '\n---HTML_EMAIL_START---\n' + data.htmlEmail + '\n---HTML_EMAIL_END---' : '');
        const idx = sessions.findIndex(s => s.id === data.sessionId);
        const entry = { id: data.sessionId, title: data.sessionTitle || 'Email', preview: message.slice(0,60), updatedAt: Date.now(), createdAt: Date.now() };
        if (idx >= 0) {
          sessions[idx] = { ...sessions[idx], ...entry, messages: [...(sessions[idx].messages || []), { role: 'user', content: message }, { role: 'assistant', content: aiStoredContent }] };
        } else {
          sessions.unshift({ ...entry, messages: [{ role: 'user', content: message }, { role: 'assistant', content: aiStoredContent }] });
        }
        sessions.sort((a,b) => b.updatedAt - a.updatedAt);
        els.topbarTitle.textContent = data.sessionTitle || els.topbarTitle.textContent;
        renderSessions();
        saveToLocalStorage();
      }
    } catch (err) {
      thinking.remove();
      appendAIMessage(`Connection error: ${err.message}`, null);
    }
    isLoading = false;
    els.sendBtn.disabled = false;
    scrollBottom();
  }

  /* ---- Chat UI ---- */
  function showWelcome() { els.welcomeScreen.style.display = 'flex'; els.messagesContainer.innerHTML = ''; }
  function showChat() { els.welcomeScreen.style.display = 'none'; }
  function clearChatUI() { els.messagesContainer.innerHTML = ''; els.welcomeScreen.style.display = 'flex'; currentHtmlEmail = null; }

  function appendMessage(role, content, mediaFiles = []) {
    const g = document.createElement('div');
    g.className = 'message-group';
    const mediaHtml = mediaFiles.filter(f => f.mimetype && f.mimetype.startsWith('image/')).map(f =>
      `<img src="${f.url}" class="media-thumb" alt="${htmlEsc(f.originalName)}">`
    ).join('');
    g.innerHTML = `
      <div class="message-row ${role}">
        <div class="message-avatar ${role}">${role === 'user' ? '👤' : '✉'}</div>
        <div class="message-content">
          <div class="message-name">${role === 'user' ? 'You' : 'MailGPT'}</div>
          ${mediaHtml ? `<div class="message-media">${mediaHtml}</div>` : ''}
          <div class="message-text">${htmlEsc(content)}</div>
        </div>
      </div>`;
    els.messagesContainer.appendChild(g);
    scrollBottom();
    return g;
  }

  function appendAIMessage(text, html) {
    const g = document.createElement('div');
    g.className = 'message-group';
    g.innerHTML = `
      <div class="message-row ai">
        <div class="message-avatar ai">✉</div>
        <div class="message-content">
          <div class="message-name">MailGPT</div>
          ${text ? `<div class="message-text">${htmlEsc(text)}</div>` : ''}
          ${html ? buildEmailBlock(html) : ''}
        </div>
      </div>`;
    els.messagesContainer.appendChild(g);
    if (html) {
      const iframe = g.querySelector('.email-iframe');
      if (iframe) {
        iframe.srcdoc = html;
        iframe.addEventListener('load', () => {
          try {
            const h = iframe.contentDocument.documentElement.scrollHeight;
            iframe.style.height = Math.min(h + 20, 500) + 'px';
          } catch {}
        });
      }
    }
    scrollBottom();
    return g;
  }

  function buildEmailBlock(html) {
    const encoded = btoa(unescape(encodeURIComponent(html)));
    return `
      <div class="html-email-block" data-html="${encoded}">
        <div class="email-block-header">
          <div class="email-block-label">
            <span class="dot"></span> HTML Email Preview
          </div>
          <div class="email-block-actions">
            <button class="btn-sm" onclick="App.openEditor(this)" title="Edit HTML live">
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>
              Edit
            </button>
            <button class="btn-sm" onclick="App.copyHtml(this)">
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="9" y="9" width="13" height="13" rx="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/></svg>
              Copy HTML
            </button>
            <button class="btn-sm" onclick="App.toggleCode(this)">
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="16 18 22 12 16 6"/><polyline points="8 6 2 12 8 18"/></svg>
              Source
            </button>
            <button class="btn-sm primary" onclick="App.openSendModal(this)">
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><path d="m22 2-7 20-4-9-9-4Z"/></svg>
              Send
            </button>
          </div>
        </div>
        <div class="email-iframe-wrap">
          <iframe class="email-iframe" sandbox="allow-same-origin" style="height:400px;"></iframe>
        </div>
        <div class="code-view" style="display:none;">
          <pre>${htmlEsc(html)}</pre>
        </div>
        <button class="expand-btn" onclick="App.toggleExpand(this)" data-expanded="false">
          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="6 9 12 15 18 9"/></svg>
          <span>Expand preview</span>
        </button>
      </div>`;
  }

  function appendThinking() {
    const g = document.createElement('div');
    g.className = 'message-group';
    g.innerHTML = `
      <div class="message-row ai">
        <div class="message-avatar ai">✉</div>
        <div class="message-content">
          <div class="message-name">MailGPT</div>
          <div class="thinking"><span></span><span></span><span></span></div>
        </div>
      </div>`;
    els.messagesContainer.appendChild(g);
    scrollBottom();
    return g;
  }

  function scrollBottom() {
    requestAnimationFrame(() => { els.chatArea.scrollTop = els.chatArea.scrollHeight; });
  }

  /* ---- Email Block Actions ---- */
  function getHtmlFromBlock(el) {
    const block = el.closest('.html-email-block');
    return decodeURIComponent(escape(atob(block.dataset.html)));
  }

  function setHtmlOnBlock(block, html) {
    block.dataset.html = btoa(unescape(encodeURIComponent(html)));
    const pre = block.querySelector('.code-view pre');
    if (pre) pre.textContent = html;
  }

  function copyHtml(btn) {
    const html = getHtmlFromBlock(btn);
    navigator.clipboard.writeText(html).then(() => {
      const orig = btn.innerHTML;
      btn.textContent = '✓ Copied!';
      setTimeout(() => { btn.innerHTML = orig; }, 1500);
    });
    showToast('HTML copied!', 'success');
  }

  function toggleCode(btn) {
    const block = btn.closest('.html-email-block');
    const codeView = block.querySelector('.code-view');
    const iframeWrap = block.querySelector('.email-iframe-wrap');
    const showing = codeView.style.display !== 'none';
    if (showing) {
      codeView.style.display = 'none';
      iframeWrap.style.display = 'block';
      btn.innerHTML = `<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="16 18 22 12 16 6"/><polyline points="8 6 2 12 8 18"/></svg> Source`;
    } else {
      codeView.style.display = 'block';
      iframeWrap.style.display = 'none';
      btn.innerHTML = `<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/></svg> Preview`;
    }
  }

  function toggleExpand(btn) {
    const block = btn.closest('.html-email-block');
    const iframe = block.querySelector('.email-iframe');
    const expanded = btn.dataset.expanded === 'true';
    if (expanded) {
      iframe.style.height = '400px';
      btn.innerHTML = `<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="6 9 12 15 18 9"/></svg> <span>Expand preview</span>`;
      btn.dataset.expanded = 'false';
    } else {
      try {
        const h = iframe.contentDocument.documentElement.scrollHeight;
        iframe.style.height = Math.max(h + 30, 500) + 'px';
      } catch { iframe.style.height = '1200px'; }
      btn.innerHTML = `<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="18 15 12 9 6 15"/></svg> <span>Collapse preview</span>`;
      btn.dataset.expanded = 'true';
    }
  }

  /* ---- Live HTML Editor ---- */
  function openEditor(btn) {
    const block = btn.closest('.html-email-block');
    const html = getHtmlFromBlock(btn);

    const backdrop = document.createElement('div');
    backdrop.className = 'editor-backdrop';
    backdrop.innerHTML = `
      <div class="editor-modal">
        <div class="editor-header">
          <div class="editor-title">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>
            Live HTML Editor
          </div>
          <div class="editor-header-actions">
            <button class="btn-sm" id="editorCopyBtn">Copy HTML</button>
            <button class="btn-sm primary" id="editorApplyBtn">Apply Changes</button>
            <button class="icon-btn" id="editorCloseBtn">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
            </button>
          </div>
        </div>
        <div class="editor-body">
          <div class="editor-pane">
            <div class="editor-pane-label">
              <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="16 18 22 12 16 6"/><polyline points="8 6 2 12 8 18"/></svg>
              HTML Code
            </div>
            <textarea class="editor-textarea" id="editorTextarea" spellcheck="false">${htmlEsc(html)}</textarea>
          </div>
          <div class="editor-divider"></div>
          <div class="editor-pane">
            <div class="editor-pane-label">
              <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/></svg>
              Live Preview
            </div>
            <div class="editor-preview-wrap">
              <iframe class="editor-iframe" id="editorIframe" sandbox="allow-same-origin"></iframe>
            </div>
          </div>
        </div>
      </div>`;

    document.body.appendChild(backdrop);
    requestAnimationFrame(() => backdrop.classList.add('visible'));

    const textarea = backdrop.querySelector('#editorTextarea');
    const iframe = backdrop.querySelector('#editorIframe');
    const applyBtn = backdrop.querySelector('#editorApplyBtn');
    const copyBtn = backdrop.querySelector('#editorCopyBtn');
    const closeBtn = backdrop.querySelector('#editorCloseBtn');

    iframe.srcdoc = html;

    // Live preview debounced
    let debounceTimer;
    textarea.addEventListener('input', () => {
      clearTimeout(debounceTimer);
      debounceTimer = setTimeout(() => { iframe.srcdoc = textarea.value; }, 400);
    });

    // Tab support
    textarea.addEventListener('keydown', e => {
      if (e.key === 'Tab') {
        e.preventDefault();
        const s = textarea.selectionStart, end = textarea.selectionEnd;
        textarea.value = textarea.value.slice(0, s) + '  ' + textarea.value.slice(end);
        textarea.selectionStart = textarea.selectionEnd = s + 2;
      }
      if (e.key === 'Escape') closeEditor(backdrop);
    });

    // Apply changes back to chat block
    applyBtn.addEventListener('click', () => {
      const newHtml = textarea.value;
      setHtmlOnBlock(block, newHtml);
      const chatIframe = block.querySelector('.email-iframe');
      if (chatIframe) chatIframe.srcdoc = newHtml;
      currentHtmlEmail = newHtml;
      showToast('Changes applied!', 'success');
      closeEditor(backdrop);
    });

    copyBtn.addEventListener('click', () => {
      navigator.clipboard.writeText(textarea.value).then(() => {
        copyBtn.textContent = '✓ Copied!';
        setTimeout(() => { copyBtn.textContent = 'Copy HTML'; }, 1500);
      });
    });

    closeBtn.addEventListener('click', () => closeEditor(backdrop));
    backdrop.addEventListener('click', e => { if (e.target === backdrop) closeEditor(backdrop); });
  }

  function closeEditor(backdrop) {
    backdrop.classList.remove('visible');
    setTimeout(() => backdrop.remove(), 220);
  }

  /* ---- Send Modal ---- */
  function openSendModal(btn) {
    const html = getHtmlFromBlock(btn);
    els.modalTo.value = els.recipientInput.value;
    els.modalSubject.value = els.subjectInput.value;
    els.sendModal._html = html;
    const iframe = document.createElement('iframe');
    iframe.style.cssText = 'width:100%;border:none;height:250px;display:block;';
    iframe.sandbox = 'allow-same-origin';
    els.modalPreview.innerHTML = '';
    els.modalPreview.appendChild(iframe);
    iframe.srcdoc = html;
    els.sendModal.style.display = 'flex';
  }

  /* ---- Modal ---- */
  function initModal() {
    els.modalClose.addEventListener('click', closeModal);
    els.modalCancelBtn.addEventListener('click', closeModal);
    els.sendModal.addEventListener('click', e => { if (e.target === els.sendModal) closeModal(); });
    els.modalSendBtn.addEventListener('click', async () => {
      const to = els.modalTo.value.trim();
      const subject = els.modalSubject.value.trim();
      const html = els.sendModal._html;
      if (!to) { showToast('Please enter a recipient', 'error'); return; }
      if (!subject) { showToast('Please enter a subject', 'error'); return; }
      els.modalSendBtn.disabled = true;
      els.modalSendBtn.textContent = 'Sending…';
      try {
        const res = await fetch('/api/email/send', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ to, subject, html }),
        });
        const data = await res.json();
        if (data.success) { showToast(`Sent to ${to}! 🎉`, 'success'); closeModal(); }
        else { showToast(data.error || 'Failed to send', 'error'); }
      } catch { showToast('Send failed', 'error'); }
      els.modalSendBtn.disabled = false;
      els.modalSendBtn.innerHTML = `<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><path d="m22 2-7 20-4-9-9-4Z"/></svg> Send Email`;
    });
  }

  function closeModal() { els.sendModal.style.display = 'none'; }

  /* ---- Clear btn ---- */
  function initClearBtn() {
    els.clearBtn.addEventListener('click', async () => {
      if (!currentSessionId) return;
      if (!confirm('Delete this email thread?')) return;
      await deleteSession({ stopPropagation: () => {} }, currentSessionId);
    });
  }

  /* ---- Search ---- */
  function initSearch() {
    els.searchInput.addEventListener('input', e => renderSessions(e.target.value));
  }

  /* ---- Examples ---- */
  function useExample(btn) {
    const span = btn.querySelectorAll('span')[1];
    const text = span ? span.textContent : btn.textContent;
    els.messageInput.value = text;
    els.messageInput.focus();
    els.messageInput.dispatchEvent(new Event('input'));
  }

  /* ---- Parse AI ---- */
  function parseAI(content) {
    const S = '---HTML_EMAIL_START---', E = '---HTML_EMAIL_END---';
    let msg = content, html = null;
    if (content.includes(S)) {
      const si = content.indexOf(S), ei = content.indexOf(E);
      msg = content.slice(0, si).trim();
      html = (ei > si ? content.slice(si + S.length, ei) : content.slice(si + S.length)).trim();
    } else {
      const m = content.match(/```html\n?([\s\S]*?)```/i);
      if (m) { html = m[1].trim(); msg = content.replace(/```html[\s\S]*?```/i, '').trim(); }
    }
    return { msg, html };
  }

  /* ---- Toast ---- */
  let toastTimer;
  function showToast(msg, type = '') {
    clearTimeout(toastTimer);
    els.toast.textContent = msg;
    els.toast.className = `toast show${type ? ' ' + type : ''}`;
    toastTimer = setTimeout(() => els.toast.classList.remove('show'), 3000);
  }

  /* ---- HTML escape ---- */
  function htmlEsc(str = '') {
    return String(str).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
  }

  /* ---- Init ---- */
  function init() {
    initSidebar();
    initFileUpload();
    initTextarea();
    initModal();
    initClearBtn();
    initSearch();
    loadSessions();
  }

  document.addEventListener('DOMContentLoaded', init);

  return { useExample, switchSession, deleteSession, removeFile, copyHtml, toggleCode, toggleExpand, openSendModal, openEditor, startRename, showToast };
})();
