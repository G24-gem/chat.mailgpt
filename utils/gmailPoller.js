/* ./utils/gmailPoller.js */
const { google } = require('googleapis');
const axios = require('axios');
const Session = require('../models/Session');
const User = require('../models/User');

const POLL_INTERVAL_MS = 60 * 1000;       // Check for replies every 60 s
const FOLLOWUP_HOURS = 24;              // Suggest follow-up after 24 h of silence
const FOLLOWUP_MS = FOLLOWUP_HOURS * 60 * 60 * 1000;

// ── Build a Gmail client for a given user ────────────────────────────────────
function gmailClient(user) {
    const auth = new google.auth.OAuth2(
        process.env.GOOGLE_CLIENT_ID,
        process.env.GOOGLE_CLIENT_SECRET,
        process.env.GOOGLE_CALLBACK_URL,
    );
    auth.setCredentials({ access_token: user.accessToken, refresh_token: user.refreshToken });
    return google.gmail({ version: 'v1', auth });
}

// ── Decode a Gmail base64url message body ────────────────────────────────────
function decodeBody(part) {
    try {
        if (part?.body?.data) {
            return Buffer.from(part.body.data, 'base64').toString('utf-8');
        }
        if (part?.parts) {
            for (const p of part.parts) {
                const decoded = decodeBody(p);
                if (decoded) return decoded;
            }
        }
    } catch { }
    return null;
}

// ── Main poll function ────────────────────────────────────────────────────────
async function pollGmail() {
    let sessions;
    try {
        sessions = await Session.find({
            phase: 'sent_awaiting_reply',
            gmailThreadId: { $ne: null }
        });
    } catch (dbErr) {
        console.error('[Poller] ❌  DB query failed:', dbErr.message);
        return;
    }

    if (sessions.length === 0) {
        console.log('[Poller] 💤  No active sessions awaiting reply.');
        return;
    }

    console.log(`[Poller] 🔍  Scanning ${sessions.length} session(s) for replies…`);

    for (const session of sessions) {
        if (!session.userId) continue;

        let user;
        try { user = await User.findById(session.userId); } catch { continue; }
        if (!user) continue;

        const gmail = gmailClient(user);

        try {
            // ── 1. Fetch the full Gmail thread ───────────────────────────────
            const res = await gmail.users.threads.get({
                userId: 'me',
                id: session.gmailThreadId,
                format: 'full',
            });
            const thread = res.data;
            const messages = thread?.messages || [];

            console.log(`[Poller]   Session ${session._id} → thread has ${messages.length} message(s)`);

            // ── 2. Check for a NEW client reply (deduplication via lastSeenMessageId) ──
            if (messages.length > 1) {
                const latestMsg = messages[messages.length - 1];
                const latestMsgId = latestMsg.id;

                // Skip if we've already handled this message
                if (session.lastSeenMessageId === latestMsgId) {
                    console.log(`[Poller]   ↩  Already processed message ${latestMsgId} — skipping.`);
                } else {
                    const headers = latestMsg.payload?.headers || [];
                    const fromHdr = headers.find(h => h.name.toLowerCase() === 'from');
                    const subjHdr = headers.find(h => h.name.toLowerCase() === 'subject');
                    const dateHdr = headers.find(h => h.name.toLowerCase() === 'date');

                    const isClientReply = fromHdr && !fromHdr.value.includes(user.email);

                    if (isClientReply) {
                        const snippet = latestMsg.snippet || '';
                        const fullBody = decodeBody(latestMsg.payload) || snippet || 'Reply received.';

                        // ── TERMINAL LOGGING (low-level raw dump) ────────────
                        console.log('\n══════════════════════════════════════════════════');
                        console.log('📩  [GMAIL_REPLY_DETECTED]');
                        console.log(`   ├─ Session ID : ${session._id}`);
                        console.log(`   ├─ Thread ID  : ${session.gmailThreadId}`);
                        console.log(`   ├─ Message ID : ${latestMsgId}`);
                        console.log(`   ├─ From       : ${fromHdr.value}`);
                        console.log(`   ├─ Subject    : ${subjHdr?.value || '(none)'}`);
                        console.log(`   ├─ Date       : ${dateHdr?.value || new Date().toISOString()}`);
                        console.log(`   └─ Snippet    : "${snippet.substring(0, 120)}"`);
                        console.log('══════════════════════════════════════════════════\n');

                        // ── Push client reply into session messages ───────────
                        session.messages.push({
                            role: 'user',
                            content: `CLIENT REPLIED:\nFrom: ${fromHdr.value}\nMessage:\n${fullBody}\n\nAnalyze their reply and help transition to the next phase: either a Proposal or a Follow-up email.`
                        });

                        session.phase = 'interview';
                        session.emailType = 'proposal';
                        session.lastSeenMessageId = latestMsgId;
                        session.hasUnreadReply = true;
                        session.updatedAt = new Date();

                        // ── Autonomous AI trigger ─────────────────────────────
                        const systemPrompt = `You are the MailGPT Agentic Assistant. A client has just replied to an email sent by the user.

INSTRUCTIONS:
1. Open by clearly announcing the client's reply — quote a short snippet so the user can see what was said.
2. Briefly interpret their intent: Are they interested? Asking questions? Declining?
3. Based on their intent, tell the user what the recommended next step is (e.g. a Proposal, a Meeting Request, or a Clarification email).
4. Ask the user 1–2 targeted questions ONLY if information is genuinely missing (e.g. project budget, timeline).
5. Do NOT write any HTML email yet. Only assist in planning the response.

Keep the tone sharp, confident, and professional.`;

                        try {
                            console.log(`[Poller] 🤖  Triggering AI response analysis for Session ${session._id}…`);
                            const aiRes = await axios.post(
                                'https://openrouter.ai/api/v1/chat/completions',
                                {
                                    model: 'nvidia/nemotron-3-nano-30b-a3b:free',
                                    messages: [
                                        { role: 'system', content: systemPrompt },
                                        ...session.messages.map(m => ({ role: m.role, content: m.content }))
                                    ],
                                    max_tokens: 800,
                                    temperature: 0.55,
                                },
                                { headers: { Authorization: `Bearer ${process.env.OPENROUTER_API_KEY}` } }
                            );
                            const aiReply = aiRes.data.choices[0].message.content;
                            session.messages.push({ role: 'assistant', content: aiReply });

                            console.log(`\n[Poller] ✅  AI RESPONSE GENERATED FOR SESSION ${session._id}`);
                            console.log('┌─────────────── AI AGENT RESPONSE ───────────────┐');
                            aiReply.split('\n').forEach(line => {
                                console.log(`│  ${line}`);
                            });
                            console.log('└──────────────────────────────────────────────────┘\n');
                        } catch (aiErr) {
                            console.error('[Poller] ❌  AI trigger failed:', aiErr.message);
                        }

                        await session.save();
                        console.log(`[Poller] 💾  Session ${session._id} saved — notification queued for user.\n`);
                        continue; // Done with this session for this cycle
                    }
                }
            }

            // ── 3. No reply yet — check 24-hour follow-up window ─────────────
            const sentAt = session.sentAt;
            if (sentAt && !session.followupSuggested) {
                const hoursSinceSent = (Date.now() - new Date(sentAt).getTime()) / (1000 * 60 * 60);

                if (hoursSinceSent >= FOLLOWUP_HOURS) {
                    console.log('\n══════════════════════════════════════════════════');
                    console.log('⏰  [FOLLOW-UP TRIGGERED — NO REPLY IN 24h]');
                    console.log(`   ├─ Session ID   : ${session._id}`);
                    console.log(`   ├─ Sent At      : ${new Date(sentAt).toLocaleString()}`);
                    console.log(`   └─ Hours Elapsed: ${hoursSinceSent.toFixed(1)}h`);
                    console.log('══════════════════════════════════════════════════\n');

                    // ── AI suggests a follow-up to the user ──────────────────
                    const followupSystem = `You are the MailGPT Agentic Assistant. The user sent an email over 24 hours ago and the client has NOT replied yet.

YOUR JOB:
1. Inform the user that their client hasn't responded in 24 hours.
2. Strongly recommend sending a follow-up email — explain briefly why follow-ups dramatically increase reply rates.
3. Ask the user 1–2 quick questions to personalise the follow-up (e.g. "Should I keep it warm and casual, or add a sense of urgency?").
4. Sound like a savvy freelance strategist, not a robot.
Do NOT write the HTML yet.`;

                    try {
                        console.log(`[Poller] 🤖  Generating 24h follow-up suggestion for Session ${session._id}…`);
                        const aiRes = await axios.post(
                            'https://openrouter.ai/api/v1/chat/completions',
                            {
                                model: 'nvidia/nemotron-3-nano-30b-a3b:free',
                                messages: [
                                    { role: 'system', content: followupSystem },
                                    ...session.messages.map(m => ({ role: m.role, content: m.content }))
                                ],
                                max_tokens: 600,
                                temperature: 0.6,
                            },
                            { headers: { Authorization: `Bearer ${process.env.OPENROUTER_API_KEY}` } }
                        );
                        const aiSuggestion = aiRes.data.choices[0].message.content;
                        session.messages.push({
                            role: 'assistant',
                            content: aiSuggestion
                        });

                        session.followupSuggested = true;
                        session.hasUnreadReply = true; // surface in notification bell
                        session.phase = 'interview';
                        session.emailType = 'follow_up';
                        session.updatedAt = new Date();
                        await session.save();

                        console.log(`\n[Poller] ✅  FOLLOW-UP AI SUGGESTION GENERATED FOR SESSION ${session._id}`);
                        console.log('┌─────────────── 24H FOLLOW-UP SUGGESTION ─────────┐');
                        aiSuggestion.split('\n').forEach(line => {
                            console.log(`│  ${line}`);
                        });
                        console.log('└──────────────────────────────────────────────────┘\n');
                    } catch (aiErr) {
                        console.error('[Poller] ❌  Follow-up AI trigger failed:', aiErr.message);
                    }
                } else {
                    const hoursLeft = (FOLLOWUP_HOURS - hoursSinceSent).toFixed(1);
                    console.log(`[Poller]   No reply yet for Session ${session._id} — follow-up in ~${hoursLeft}h`);
                }
            }

        } catch (gmailErr) {
            const msg = gmailErr.message || '';
            if (gmailErr.code === 401 || gmailErr.status === 401) {
                console.warn(`[Poller] ⚠️  Token expired for user ${user.email} — skipping session ${session._id}`);
            } else if (msg.includes('insufficient authentication scopes')) {
                console.warn(`\n[Poller] 🔐  SCOPE ERROR for session ${session._id}`);
                console.warn(`   The stored Google token is missing the 'gmail.readonly' scope.`);
                console.warn(`   ➡  ACTION REQUIRED: Open http://localhost:${process.env.PORT || 3000} → click "Login with Google" → accept ALL permissions.\n`);
            } else {
                console.error(`[Poller] ❌  Gmail error for thread ${session.gmailThreadId}:`, msg);
            }
        }
    }
}

// ── Start the poller ──────────────────────────────────────────────────────────
function startPoller() {
    console.log(`🔄  Started Gmail Agent Poller (every ${POLL_INTERVAL_MS / 1000}s | follow-up after ${FOLLOWUP_HOURS}h)`);
    pollGmail(); // run once immediately on startup
    setInterval(pollGmail, POLL_INTERVAL_MS);
}

module.exports = { startPoller, pollGmail };
