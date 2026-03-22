/* ============================== MailGPT — Freelancer Email Composer ============================== */
const App = (() => {

  // ── State ──────────────────────────────────────────────────────────────────
  let currentSessionId = null;
  let sessions = [];
  let uploadedFiles = [];
  let currentHtmlEmail = null;
  let isLoading = false;
  let currentUser = null;
  let currentEmailType = null; // tracks selected email type

  // ── Email Types ────────────────────────────────────────────────────────────
  const EMAIL_TYPES = {
    cold_pitch: {
      label: 'Cold Pitch',
      icon: '🔥',
      desc: 'Reach new clients & land gigs',
      hint: 'Write a cold pitch email to a potential client. I am a [your skill e.g. web developer / graphic designer]. Their business is [describe their business]. I want to offer [your service]. Keep it short, confident, and end with a soft CTA to hop on a quick call.',
      badge: '#1 Money-Maker',
    },
    proposal: {
      label: 'Proposal',
      icon: '💰',
      desc: 'Convert interest into payment',
      hint: 'Write a project proposal email for a client who showed interest. Project: [describe project]. Timeline: [X weeks]. Price: [$amount]. Deliverables: [list them]. End with a CTA to accept or book a call.',
      badge: 'Close the Deal',
    },
    follow_up: {
      label: 'Follow-Up',
      icon: '🔁',
      desc: 'Revive ignored proposals',
      hint: 'Write a follow-up email to a client who has not replied to my proposal sent [X days] ago. Keep it warm, not pushy. Remind them of the value and ask if they have any questions.',
      badge: 'High ROI',
    },
    client_update: {
      label: 'Client Update',
      icon: '📊',
      desc: 'Keep clients happy & confident',
      hint: 'Write a project update email for my client. What is done: [list progress]. What is next: [next steps]. Any blockers: [mention if any]. Keep it professional and reassuring.',
      badge: 'Retention',
    },
  };

  // ── DOM helpers ─────────────────────────────────────────────────────────────
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
    welcomeHeading: $('welcomeHeading'),
    welcomeSubtitle: $('welcomeSubtitle'),
    loginPrompt: $('loginPrompt'),
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
    modalFromText: $('modalFromText'),
    toast: $('toast'),
    loginBtn: $('loginBtn'),
    userPill: $('userPill'),
    userAvatar: $('userAvatar'),
    userGreeting: $('userGreeting'),
    userDropdown: $('userDropdown'),
    dropdownAvatar: $('dropdownAvatar'),
    dropdownName: $('dropdownName'),
    dropdownEmail: $('dropdownEmail'),
    notifBtn: $('notifBtn'),
    notifBadge: $('notifBadge'),
    notifDropdown: $('notifDropdown'),
    notifList: $('notifList'),
  };

  /* ════════════════════════════════════════════════════════════════════════════
     AUTH
  ════════════════════════════════════════════════════════════════════════════ */
  async function fetchUser() {
    try {
      const res = await fetch('/auth/me', { credentials: 'include' });
      const data = await res.json();
      currentUser = data.user || null;
    } catch {
      currentUser = null;
    }
    updateAuthUI();
    handleAuthCallback();
  }

  function updateAuthUI() {
    if (currentUser) {
      els.loginBtn.style.display = 'none';
      els.userPill.style.display = 'flex';
      els.loginPrompt.style.display = 'none';

      // Safe name extraction — never crash if fields are missing
      const displayName = currentUser.displayName || currentUser.email || 'Freelancer';
      const first = currentUser.firstName || displayName.split(' ')[0] || 'Freelancer';

      // Avatar — set on both topbar pill and dropdown
      const avatarUrl = currentUser.avatar || '';
      if (avatarUrl) {
        els.userAvatar.onerror = () => { els.userAvatar.style.display = 'none'; };
        els.dropdownAvatar.onerror = () => { els.dropdownAvatar.style.display = 'none'; };
        els.userAvatar.src = avatarUrl;
        els.dropdownAvatar.src = avatarUrl;
        els.userAvatar.style.display = 'block';
        els.dropdownAvatar.style.display = 'block';
      } else {
        els.userAvatar.style.display = 'none';
        els.dropdownAvatar.style.display = 'none';
      }

      els.userGreeting.textContent = `Hi, ${first}`;
      els.dropdownName.textContent = displayName;
      els.dropdownEmail.textContent = currentUser.email || '';

      // Welcome heading
      els.welcomeHeading.innerHTML =
        `Ready to get paid faster, <em>${first}</em>?`;
      els.welcomeSubtitle.textContent =
        'Pick an email type below. MailGPT writes it, you send it. Every email is designed to move money.';

      // Pre-fill From in send modal
      els.modalFromText.textContent =
        `${displayName} <${currentUser.email}>`;

    } else {
      els.loginBtn.style.display = 'flex';
      els.userPill.style.display = 'none';
      els.loginPrompt.style.display = 'block';

      els.welcomeHeading.innerHTML =
        `Win more clients with <em>AI emails</em>`;
      els.welcomeSubtitle.textContent =
        'MailGPT writes cold pitches, proposals, follow-ups and client updates that help freelancers get paid faster.';
      els.modalFromText.textContent = '— login required —';
    }

    // Re-render welcome screen with correct state
    renderWelcomeScreen();
  }

  function handleAuthCallback() {
    const params = new URLSearchParams(window.location.search);
    const status = params.get('auth');
    if (status === 'success') {
      const first = currentUser?.firstName || 'freelancer';
      showToast(`Welcome, ${first}! Let's get you paid. 🎉`, 'success');
      history.replaceState(null, '', window.location.pathname);
    } else if (status === 'failed') {
      showToast('Google login failed. Please try again.', 'error');
      history.replaceState(null, '', window.location.pathname);
    }
  }

  function initUserPillToggle() {
    els.userPill.addEventListener('click', e => {
      if (e.target.closest('.user-dropdown')) return;
      els.userPill.classList.toggle('open');
    });
    document.addEventListener('click', e => {
      if (!els.userPill.contains(e.target)) els.userPill.classList.remove('open');
    });
  }

  function initNotifToggle() {
    els.notifBtn.addEventListener('click', e => {
      e.stopPropagation();
      els.notifBtn.closest('.notif-wrapper').classList.toggle('open');
      if (els.notifBtn.closest('.notif-wrapper').classList.contains('open')) {
        fetchNotifications();
      }
    });
    document.addEventListener('click', e => {
      if (!els.notifBtn.closest('.notif-wrapper').contains(e.target)) {
        els.notifBtn.closest('.notif-wrapper').classList.remove('open');
      }
    });
  }

  async function fetchNotifications() {
    if (!currentUser) return;
    try {
      const res = await fetch('/api/chat/notifications');
      const notifs = await res.json();

      const hasNewForCurrent = notifs.some(n => n.id === currentSessionId);
      if (hasNewForCurrent) {
        console.log('[App] New reply on active session — auto-syncing...');
        await switchSession(currentSessionId, true);
      }

      renderNotifications(notifs);

      if (notifs.length > 0) {
        els.notifBadge.style.display = 'block';
        els.notifBtn.classList.add('notif-ring');
      } else {
        els.notifBadge.style.display = 'none';
        els.notifBtn.classList.remove('notif-ring');
      }
    } catch (e) { console.error('Failed to fetch notifications', e); }
  }

  function renderNotifications(notifs) {
    if (notifs.length === 0) {
      els.notifList.innerHTML = `
        <div class="notif-empty">
          <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" style="opacity:.3">
            <path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9"/>
            <path d="M13.73 21a2 2 0 0 1-3.46 0"/>
          </svg>
          All caught up
        </div>`;
      return;
    }
    const timeStr = (d) => new Date(d).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    els.notifList.innerHTML = notifs.map(n => `
      <div class="notif-item" onclick="App.handleNotifClick('${n.id}')">
        <div class="notif-dot-wrap"><div class="notif-dot"></div></div>
        <div class="notif-info">
          <div class="notif-title">🔔 ${htmlEsc(n.title)}</div>
          <div class="notif-msg">Client replied · AI response ready</div>
          <span class="notif-tag">${(n.emailType || '').replace(/_/g, ' ')}</span>
        </div>
        <div class="notif-time">${timeStr(n.updatedAt)}</div>
      </div>
    `).join('');
  }

  async function handleNotifClick(id) {
    // Force fresh server fetch — poller messages only exist in MongoDB, not localStorage
    await switchSession(id, true);
    await fetch(`/api/chat/notifications/${id}/read`, { method: 'POST' });
    fetchNotifications();
    els.notifBtn.closest('.notif-wrapper').classList.remove('open');
    showToast('💬 Client replied — AI response loaded!', 'success');
  }

  function login() { window.location.href = '/auth/google'; }

  async function logout() {
    try { await fetch('/auth/logout', { method: 'POST', credentials: 'include' }); } catch { }
    currentUser = null;
    updateAuthUI();
    showToast('Signed out. Come back soon!');
  }

  /* ════════════════════════════════════════════════════════════════════════════
     WELCOME SCREEN — EMAIL TYPE SELECTOR
  ════════════════════════════════════════════════════════════════════════════ */
  function renderWelcomeScreen() {
    // Find or create the email-type grid inside welcome-inner
    const inner = els.welcomeScreen.querySelector('.welcome-inner');
    if (!inner) return;

    // Remove old type grid + example grid if present
    inner.querySelectorAll('.email-type-grid, .example-grid').forEach(el => el.remove());

    // Build the 4-type selector
    const grid = document.createElement('div');
    grid.className = 'email-type-grid';
    grid.innerHTML = Object.entries(EMAIL_TYPES).map(([key, t]) => `
      <button class="email-type-card ${currentEmailType === key ? 'selected' : ''}"
              onclick="App.selectEmailType('${key}')">
        <div class="type-card-top">
          <span class="type-icon">${t.icon}</span>
          <span class="type-badge">${t.badge}</span>
        </div>
        <div class="type-label">${t.label}</div>
        <div class="type-desc">${t.desc}</div>
      </button>`).join('');

    // Insert grid before login-prompt (or at end of inner)
    const prompt = inner.querySelector('.login-prompt');
    if (prompt) inner.insertBefore(grid, prompt);
    else inner.appendChild(grid);
  }

  function selectEmailType(key) {
    currentEmailType = key;
    const type = EMAIL_TYPES[key];
    if (!type) return;

    // Highlight selected card
    document.querySelectorAll('.email-type-card').forEach(c => c.classList.remove('selected'));
    const card = document.querySelector(`.email-type-card[onclick*="${key}"]`);
    if (card) card.classList.add('selected');

    // Pre-fill compose textarea with hint
    els.messageInput.value = type.hint;
    els.messageInput.dispatchEvent(new Event('input'));
    els.messageInput.focus();

    // Update topbar hint
    els.topbarTitle.textContent = `${type.icon} ${type.label} Email`;
  }

  /* ════════════════════════════════════════════════════════════════════════════
     LOGIN GUARD MODAL (shown when logged-out user tries to send)
  ════════════════════════════════════════════════════════════════════════════ */
  function showLoginGuard() {
    const existing = document.getElementById('loginGuardModal');
    if (existing) return;

    const modal = document.createElement('div');
    modal.id = 'loginGuardModal';
    modal.className = 'modal-backdrop';
    modal.innerHTML = `
      <div class="modal" style="max-width:420px;text-align:center;">
        <div class="modal-head" style="justify-content:center;border:none;padding-bottom:0;">
          <h3 style="font-size:20px;">Login to Send</h3>
        </div>
        <div class="modal-body" style="padding-top:12px;">
          <div style="font-size:48px;margin-bottom:16px;">📬</div>
          <p style="color:var(--text2);font-size:14.5px;line-height:1.7;margin-bottom:24px;">
            Connect your Gmail account to send emails directly from MailGPT.<br>
            <strong style="color:var(--text);">Free, takes 10 seconds.</strong>
          </p>
          <button onclick="App.login()" style="
            display:inline-flex;align-items:center;gap:10px;
            padding:12px 24px;background:var(--gradient);border:none;
            border-radius:99px;color:#fff;font-size:14px;font-weight:600;
            font-family:inherit;cursor:pointer;box-shadow:0 4px 16px var(--accent-glow);
            width:100%;justify-content:center;margin-bottom:10px;">
            <svg width="16" height="16" viewBox="0 0 24 24">
              <path fill="#fff" d="M5.27 9.76A7.08 7.08 0 0 1 17.4 6.54l2.93-2.93A11.94 11.94 0 0 0 .94 8.23l4.33 1.53Z"/>
              <path fill="#fff" d="M12 24c3.24 0 5.95-1.08 7.94-2.91l-3.88-3.01A7.1 7.1 0 0 1 5.3 14.2L.97 15.74A12 12 0 0 0 12 24Z"/>
              <path fill="#fff" d="M23.75 12.27c0-.79-.07-1.56-.19-2.27H12v4.51h6.61a5.64 5.64 0 0 1-2.45 3.7l3.88 3.01C22.13 19.39 23.75 16.1 23.75 12.27Z"/>
              <path fill="#fff" d="M5.27 14.24a7.13 7.13 0 0 1 0-4.48L.94 8.23a12.04 12.04 0 0 0 0 7.51l4.33-1.5Z"/>
            </svg>
            Continue with Google
          </button>
          <button onclick="document.getElementById('loginGuardModal').remove()" style="
            display:block;width:100%;padding:10px;background:none;border:1px solid var(--border2);
            border-radius:99px;color:var(--text3);font-size:13px;font-family:inherit;cursor:pointer;">
            Maybe later
          </button>
        </div>
      </div>`;

    document.body.appendChild(modal);
    modal.addEventListener('click', e => { if (e.target === modal) modal.remove(); });
  }

  /* ════════════════════════════════════════════════════════════════════════════
     SIDEBAR
  ════════════════════════════════════════════════════════════════════════════ */
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

  /* ════════════════════════════════════════════════════════════════════════════
     LOCAL STORAGE
  ════════════════════════════════════════════════════════════════════════════ */
  function saveToLocalStorage() {
    try {
      localStorage.setItem('mailgpt_sessions', JSON.stringify(sessions));
      localStorage.setItem('mailgpt_current', currentSessionId || '');
    } catch (e) { console.log('LocalStorage save failed:', e.message); }
  }

  function loadFromLocalStorage() {
    try {
      const saved = localStorage.getItem('mailgpt_sessions');
      if (saved) {
        const parsed = JSON.parse(saved);
        if (parsed && parsed.length > 0) { sessions = parsed; renderSessions(); return true; }
      }
    } catch (e) { console.log('LocalStorage load failed:', e.message); }
    return false;
  }

  function getLocalSession(id) {
    try {
      const saved = JSON.parse(localStorage.getItem('mailgpt_sessions') || '[]');
      return saved.find(s => s.id === id) || null;
    } catch { return null; }
  }

  /* ════════════════════════════════════════════════════════════════════════════
     SESSIONS
  ════════════════════════════════════════════════════════════════════════════ */
  async function loadSessions() {
    // 1. Show local cache immediately for speed
    loadFromLocalStorage();

    // 2. But ALWAYS background-sync with the server to show poller replies
    try {
      const res = await fetch('/api/chat/sessions');
      const serverSessions = await res.json();

      // Update local state with fresh server data (titles, update dates, etc)
      // We keep existing local data but let the server dictate order and counts
      sessions = serverSessions.map(s => {
        const local = sessions.find(ls => ls.id === s.id);
        return local ? { ...local, ...s } : s;
      });

      renderSessions();
      saveToLocalStorage();
      fetchNotifications();
    } catch (e) { console.warn('[App] Server sync failed:', e.message); }
  }

  function renderSessions(filter = '') {
    const f = filter.toLowerCase();
    const list = f ? sessions.filter(s => s.title.toLowerCase().includes(f)) : sessions;
    if (!list.length) {
      els.sessionsList.innerHTML = `<div class="sessions-empty">No emails yet.<br>Pick a type and start composing!</div>`;
      return;
    }
    els.sessionsList.innerHTML = list.map(s => `
      <div class="session-item ${s.id === currentSessionId ? 'active' : ''} ${s.hasUnreadReply ? 'unread' : ''}" onclick="App.switchSession('${s.id}')">
        <div class="session-icon">✉</div>
        <div class="session-info">
          <div class="session-title" ondblclick="App.startRename(event,'${s.id}')" title="Double-click to rename">${htmlEsc(s.title)}</div>
          <div class="session-preview">${htmlEsc(s.preview || 'Email thread')}</div>
        </div>
        ${s.hasUnreadReply ? '<div class="session-dot"></div>' : ''}
        <div class="session-actions">
          <button class="session-rename-btn" onclick="App.startRename(event,'${s.id}')" title="Rename">
            <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>
          </button>
          <button class="session-del" onclick="App.deleteSession(event,'${s.id}')" title="Delete">
            <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
          </button>
        </div>
      </div>`).join('');
  }

  function startRename(e, id) {
    e.stopPropagation();
    const item = e.target.closest('.session-item');
    const titleEl = item.querySelector('.session-title');
    const currentTitle = sessions.find(s => s.id === id)?.title || '';
    titleEl.innerHTML = '';
    const input = document.createElement('input');
    input.type = 'text';
    input.value = currentTitle;
    input.className = 'session-rename-input';
    titleEl.appendChild(input);
    input.focus(); input.select();

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
      currentEmailType = null;
      sessions.unshift({ id: s.id, title: 'New Email', preview: '', messages: [], createdAt: Date.now(), updatedAt: Date.now() });
      renderSessions(); saveToLocalStorage();
      clearChatUI();
      els.topbarTitle.textContent = 'MailGPT';
      els.clearBtn.style.display = 'none';
      uploadedFiles = []; renderMediaStrip();
      currentHtmlEmail = null;
    } catch { showToast('Could not create session', 'error'); }
  }

  async function switchSession(id, forceServer = false) {
    if (id === currentSessionId && !forceServer) { closeSidebar(); return; }
    currentSessionId = id;
    closeSidebar(); renderSessions();
    try {
      // 🧬 TRUTH FIX: Always sync from server to ensure poller replies are visible
      const res = await fetch(`/api/chat/sessions/${id}`);
      const session = await res.json();

      const idx = sessions.findIndex(s => s.id === id);
      if (idx >= 0) {
        sessions[idx] = { ...sessions[idx], messages: session.messages, hasUnreadReply: false };
        saveToLocalStorage();
      }

      // Mark as read if it was unread
      if (session.hasUnreadReply) {
        fetch(`/api/chat/notifications/${id}/read`, { method: 'POST' }).then(() => fetchNotifications());
      }

      clearChatUI();
      els.topbarTitle.textContent = session.title || 'Email';
      currentHtmlEmail = null;
      const sessionMessages = session.messages || [];
      for (let i = 0; i < sessionMessages.length; i++) {
        const m = sessionMessages[i];
        if (m.role === 'user') { appendMessage('user', m.content); }
        else {
          const { msg, html } = parseAI(m.content);
          appendAIMessage(msg, html);
          if (html) currentHtmlEmail = html;
        }
      }
      if (sessionMessages.length > 0) { showChat(); els.clearBtn.style.display = 'flex'; }
      scrollBottom();
    } catch { showToast('Failed to load session', 'error'); }
  }

  async function deleteSession(e, id) {
    e.stopPropagation();
    try {
      await fetch(`/api/chat/sessions/${id}`, { method: 'DELETE' });
      sessions = sessions.filter(s => s.id !== id);
      if (currentSessionId === id) {
        currentSessionId = null; clearChatUI(); showWelcome();
        els.topbarTitle.textContent = 'MailGPT';
        els.clearBtn.style.display = 'none';
        currentHtmlEmail = null;
      }
      renderSessions(); saveToLocalStorage();
    } catch { showToast('Delete failed', 'error'); }
  }

  /* ════════════════════════════════════════════════════════════════════════════
     FILE UPLOAD
  ════════════════════════════════════════════════════════════════════════════ */
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
        if (data.success) { uploadedFiles.push(...data.files); renderMediaStrip(); showToast('Files ready!', 'success'); }
        else { showToast(data.error || 'Upload failed', 'error'); }
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

  /* ════════════════════════════════════════════════════════════════════════════
     TEXTAREA
  ════════════════════════════════════════════════════════════════════════════ */
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

  /* ════════════════════════════════════════════════════════════════════════════
     SEND MESSAGE
  ════════════════════════════════════════════════════════════════════════════ */
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
    uploadedFiles = []; renderMediaStrip();
    showChat(); els.clearBtn.style.display = 'flex';
    appendMessage('user', message, files);
    const thinking = appendThinking();
    isLoading = true; els.sendBtn.disabled = true;

    try {
      const res = await fetch('/api/chat/message', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          sessionId: currentSessionId,
          message,
          mediaFiles: files,
          recipientEmail: recipient,
          emailSubject: subject,
          emailType: currentEmailType, // pass type to backend for smarter prompting
        }),
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
        const entry = {
          id: data.sessionId,
          title: data.sessionTitle || (currentEmailType ? EMAIL_TYPES[currentEmailType]?.label + ' Email' : 'Email'),
          preview: message.slice(0, 60),
          updatedAt: Date.now(),
          createdAt: Date.now(),
        };

        if (idx >= 0) {
          sessions[idx] = { ...sessions[idx], ...entry, messages: [...(sessions[idx].messages || []), { role: 'user', content: message }, { role: 'assistant', content: aiStoredContent }] };
        } else {
          sessions.unshift({ ...entry, messages: [{ role: 'user', content: message }, { role: 'assistant', content: aiStoredContent }] });
        }
        sessions.sort((a, b) => b.updatedAt - a.updatedAt);
        els.topbarTitle.textContent = entry.title;
        renderSessions(); saveToLocalStorage();
      }
    } catch (err) {
      thinking.remove();
      appendAIMessage(`Connection error: ${err.message}`, null);
    }

    isLoading = false; els.sendBtn.disabled = false;
    scrollBottom();
  }

  /* ════════════════════════════════════════════════════════════════════════════
     CHAT UI
  ════════════════════════════════════════════════════════════════════════════ */
  function showWelcome() { els.welcomeScreen.style.display = 'flex'; els.messagesContainer.innerHTML = ''; }
  function showChat() { els.welcomeScreen.style.display = 'none'; }
  function clearChatUI() { els.messagesContainer.innerHTML = ''; els.welcomeScreen.style.display = 'flex'; currentHtmlEmail = null; }

  function appendMessage(role, content, mediaFiles = []) {
    const g = document.createElement('div');
    g.className = 'message-group';
    const mediaHtml = mediaFiles.filter(f => f.mimetype && f.mimetype.startsWith('image/')).map(f =>
      `<img src="${f.url}" class="media-thumb" alt="${htmlEsc(f.originalName)}">`
    ).join('');

    const avatarInner = (role === 'user' && currentUser?.avatar)
      ? `<img src="${currentUser.avatar}" style="width:30px;height:30px;border-radius:8px;object-fit:cover;" alt="You">`
      : (role === 'user' ? '👤' : '✉');

    g.innerHTML = `
      <div class="message-row ${role}">
        <div class="message-avatar ${role}">${role === 'user' ? avatarInner : '✉'}</div>
        <div class="message-content">
          <div class="message-name">${role === 'user' ? (currentUser?.firstName || 'You') : 'MailGPT'}</div>
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
          <div class="message-name">MailGPT Bot</div>
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
          } catch { }
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
            <button class="btn-sm" onclick="App.openEditor(this)">
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

  /* ════════════════════════════════════════════════════════════════════════════
     EMAIL BLOCK ACTIONS
  ════════════════════════════════════════════════════════════════════════════ */
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

  /* ════════════════════════════════════════════════════════════════════════════
     LIVE HTML EDITOR
  ════════════════════════════════════════════════════════════════════════════ */
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
    let debounceTimer;
    textarea.addEventListener('input', () => {
      clearTimeout(debounceTimer);
      debounceTimer = setTimeout(() => { iframe.srcdoc = textarea.value; }, 400);
    });
    textarea.addEventListener('keydown', e => {
      if (e.key === 'Tab') {
        e.preventDefault();
        const s = textarea.selectionStart, end = textarea.selectionEnd;
        textarea.value = textarea.value.slice(0, s) + '  ' + textarea.value.slice(end);
        textarea.selectionStart = textarea.selectionEnd = s + 2;
      }
      if (e.key === 'Escape') closeEditorModal(backdrop);
    });
    applyBtn.addEventListener('click', () => {
      const newHtml = textarea.value;
      setHtmlOnBlock(block, newHtml);
      const chatIframe = block.querySelector('.email-iframe');
      if (chatIframe) chatIframe.srcdoc = newHtml;
      currentHtmlEmail = newHtml;
      showToast('Changes applied!', 'success');
      closeEditorModal(backdrop);
    });
    copyBtn.addEventListener('click', () => {
      navigator.clipboard.writeText(textarea.value).then(() => {
        copyBtn.textContent = '✓ Copied!';
        setTimeout(() => { copyBtn.textContent = 'Copy HTML'; }, 1500);
      });
    });
    closeBtn.addEventListener('click', () => closeEditorModal(backdrop));
    backdrop.addEventListener('click', e => { if (e.target === backdrop) closeEditorModal(backdrop); });
  }

  function closeEditorModal(backdrop) {
    backdrop.classList.remove('visible');
    setTimeout(() => backdrop.remove(), 220);
  }

  /* ════════════════════════════════════════════════════════════════════════════
     SEND MODAL
  ════════════════════════════════════════════════════════════════════════════ */
  function openSendModal(btn) {
    // Gate: must be logged in — show login guard modal
    if (!currentUser) { showLoginGuard(); return; }

    const html = getHtmlFromBlock(btn);
    els.modalTo.value = els.recipientInput.value;
    els.modalSubject.value = els.subjectInput.value;
    els.sendModal._html = html;

    const displayName = currentUser.displayName || currentUser.email || '';
    els.modalFromText.textContent = `${displayName} <${currentUser.email}>`;

    const iframe = document.createElement('iframe');
    iframe.style.cssText = 'width:100%;border:none;height:250px;display:block;';
    iframe.sandbox = 'allow-same-origin';
    els.modalPreview.innerHTML = '';
    els.modalPreview.appendChild(iframe);
    iframe.srcdoc = html;
    els.sendModal.style.display = 'flex';
  }

  function initModal() {
    els.modalClose.addEventListener('click', closeModal);
    els.modalCancelBtn.addEventListener('click', closeModal);
    els.sendModal.addEventListener('click', e => { if (e.target === els.sendModal) closeModal(); });

    els.modalSendBtn.addEventListener('click', async () => {
      if (!currentUser) { showLoginGuard(); closeModal(); return; }

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
          credentials: 'include',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ to, subject, html, sessionId: currentSessionId }),
        });
        const data = await res.json();

        if (data.success) {
          showToast(`Sent to ${to}! 🎉`, 'success');
          closeModal();
        } else if (data.relogin) {
          showToast('Session expired — please login again', 'error');
          closeModal();
          setTimeout(() => window.location.href = '/auth/google', 1200);
        } else {
          showToast(data.error || 'Failed to send', 'error');
        }
      } catch { showToast('Send failed', 'error'); }

      els.modalSendBtn.disabled = false;
      els.modalSendBtn.innerHTML = `<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><path d="m22 2-7 20-4-9-9-4Z"/></svg> Send Email`;
    });
  }

  function closeModal() { els.sendModal.style.display = 'none'; }

  /* ════════════════════════════════════════════════════════════════════════════
     MISC
  ════════════════════════════════════════════════════════════════════════════ */
  function initClearBtn() {
    els.clearBtn.addEventListener('click', async () => {
      if (!currentSessionId) return;
      if (!confirm('Delete this email thread?')) return;
      await deleteSession({ stopPropagation: () => { } }, currentSessionId);
    });
  }

  function initSearch() {
    els.searchInput.addEventListener('input', e => renderSessions(e.target.value));
  }

  function useExample(btn) {
    const span = btn.querySelectorAll('span')[1];
    const text = span ? span.textContent : btn.textContent;
    els.messageInput.value = text;
    els.messageInput.focus();
    els.messageInput.dispatchEvent(new Event('input'));
  }

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

  let toastTimer;
  function showToast(msg, type = '') {
    clearTimeout(toastTimer);
    els.toast.textContent = msg;
    els.toast.className = `toast show${type ? ' ' + type : ''}`;
    toastTimer = setTimeout(() => els.toast.classList.remove('show'), 3000);
  }

  function htmlEsc(str = '') {
    return String(str).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  }

  /* ════════════════════════════════════════════════════════════════════════════
     INIT
  ════════════════════════════════════════════════════════════════════════════ */
  function init() {
    initSidebar();
    initUserPillToggle();
    initFileUpload();
    initTextarea();
    initModal();
    initClearBtn();
    initSearch();
    loadSessions();
    fetchUser();
    initNotifToggle();
    setInterval(fetchNotifications, 30000); // Poll every 30s
  }

  document.addEventListener('DOMContentLoaded', init);

  return {
    useExample, switchSession, deleteSession, removeFile,
    copyHtml, toggleCode, toggleExpand, openSendModal, openEditor,
    startRename, showToast, login, logout, selectEmailType,
    handleNotifClick,
  };
})();