/* ./routes/chat.js */
const express = require('express');
const router = express.Router();
const axios = require('axios');
const fs = require('fs');
const path = require('path');
const Session = require('../models/Session');

// Helper for auth ID
const getUserId = (req) => req.user ? req.user._id : null;

// ── GET all sessions
router.get('/sessions', async (req, res) => {
  const userId = getUserId(req);
  console.log("userId: ", userId)
  if (!userId) return res.json([]); // Anonymous has no persistent cross-reload sessions yet
  const list = await Session.find({ userId }).sort({ updatedAt: -1 });
  const mapped = list.map(s => ({
    id: s._id.toString(),
    title: s.title || 'New Email',
    createdAt: s.createdAt,
    updatedAt: s.updatedAt,
    phase: s.phase,
    hasUnreadReply: s.hasUnreadReply,
    preview: s.messages.length > 0 ? (s.messages[s.messages.length - 1].content || '').slice(0, 60) : '',
  }));
  res.json(mapped);
});

// ── GET single session
router.get('/sessions/:id', async (req, res) => {
  try {
    const s = await Session.findById(req.params.id);
    if (!s) return res.status(404).json({ error: 'Session not found' });
    const mapped = {
      id: s._id.toString(),
      title: s.title,
      messages: s.messages.map(m => ({ role: m.role, content: m.content })),
      phase: s.phase,
      emailType: s.emailType
    };
    res.json(mapped);
  } catch (err) {
    res.status(400).json({ error: 'Invalid ID' });
  }
});

// ── DELETE session
router.delete('/sessions/:id', async (req, res) => {
  try {
    await Session.findByIdAndDelete(req.params.id);
    res.json({ success: true });
  } catch (e) {
    res.json({ success: false });
  }
});

// ── POST new session
router.post('/sessions', async (req, res) => {
  const session = await Session.create({
    userId: getUserId(req),
    title: 'New Email',
    messages: []
  });
  res.json({ id: session._id.toString(), title: 'New Email', messages: [] });
});

// ── GET notifications (Unread replies)
router.get('/notifications', async (req, res) => {
  const userId = getUserId(req);
  if (!userId) return res.json([]);
  const list = await Session.find({ userId, hasUnreadReply: true }).sort({ updatedAt: -1 });
  res.json(list.map(s => ({
    id: s._id.toString(),
    title: s.title || 'Client Replied!',
    emailType: s.emailType,
    updatedAt: s.updatedAt,
  })));
});

// ── Mark notification as read
router.post('/notifications/:id/read', async (req, res) => {
  const userId = getUserId(req);
  if (!userId) return res.json({ success: false });
  try {
    await Session.findOneAndUpdate({ _id: req.params.id, userId }, { hasUnreadReply: false });
    res.json({ success: true });
  } catch (e) {
    res.json({ success: false });
  }
});

// ── Multimodal Vision helper
async function describeImage(f) {
  try {
    // Safely extract just the filename from the url
    let filename = f.filename;
    if (!filename && f.url) {
      filename = f.url.split('/').pop();
    }
    const fp = path.join(__dirname, '../public/media', filename);
    if (!fs.existsSync(fp)) {
      console.log(`❌ File not found at ${fp}`);
      return null;
    }
    const base64 = fs.readFileSync(fp).toString('base64');
    const dataUri = `data:${f.mimetype};base64,${base64}`;

    const visionModel = process.env.VISION_MODEL || 'nvidia/nemotron-nano-12b-v2-vl:free';
    const payload = {
      model: visionModel,
      messages: [
        {
          role: 'user',
          content: [
            { type: 'text', text: 'Describe what you see in this image in detail. Extract any text, mood, and context. This will be used to design an email.' },
            { type: 'image_url', image_url: { url: dataUri } }
          ]
        }
      ]
    };

    const resp = await axios.post('https://openrouter.ai/api/v1/chat/completions', payload, {
      headers: { Authorization: `Bearer ${process.env.OPENROUTER_API_KEY}`, 'HTTP-Referer': process.env.BASE_URL }
    });

    console.log(`[Vision] Raw response from ${visionModel}:`, JSON.stringify(resp.data?.choices?.[0]?.message?.content?.slice(0, 120), null, 2));

    const choice = resp.data?.choices?.[0];
    if (!choice) {
      console.error('[Vision] No choices in response:', JSON.stringify(resp.data));
      return null;
    }
    return choice.message?.content ?? null;
  } catch (e) {
    console.error('Vision API error:', e.response?.data || e.message);
    return null;
  }
}

// ── Main chat endpoint
router.post('/message', async (req, res) => {
  const { sessionId, message, mediaFiles, recipientEmail, emailSubject, emailType } = req.body;

  if (!message && (!mediaFiles || mediaFiles.length === 0)) {
    return res.status(400).json({ error: 'Message or media required' });
  }

  let session;
  if (sessionId) {
    try { session = await Session.findById(sessionId); } catch (e) { }
  }
  if (!session) {
    session = await Session.create({ userId: getUserId(req), emailType: emailType || 'cold_pitch', messages: [] });
  }

  // Track type
  if (emailType && session.emailType !== emailType) {
    session.emailType = emailType;
  }

  let userContent = message || '';

  // ── Handle Multimodal Interception
  if (mediaFiles && mediaFiles.length > 0) {
    let mediaDescText = '\n\nUser attached files:\n';
    for (const f of mediaFiles) {
      if (f.mimetype.startsWith('image/')) {
        console.log(`\n👁️  Vision AI processing image: ${f.originalName}...`);
        const aiDesc = await describeImage(f);
        console.log(`✅ Vision AI Output for ${f.originalName}:\n"${aiDesc || 'Failed to process'}"\n`);
        mediaDescText += `[IMAGE: ${f.originalName} | URL: ${f.url} | AI Vision Description: ${aiDesc || 'Visual context processing failed'}]\n`;
      } else {
        mediaDescText += `[FILE: ${f.originalName} | URL: ${f.url}]\n`;
      }
    }
    userContent += mediaDescText;
  }

  if (session.messages.length === 0) {
    session.title = (message || 'Email').slice(0, 50);
  }

  session.messages.push({ role: 'user', content: userContent });
  session.updatedAt = Date.now();
  await session.save();

  // Route depending on Phase
  const typeLabel = session.emailType?.replace('_', ' ').toUpperCase() || 'EMAIL';

  // If user replies after an email is generated, loop back to regenerate/revise it with their feedback!
  if (session.phase === 'ready') {
    session.phase = 'generating';
  }

  if (session.phase === 'interview') {
    // ── Phase 1: Interviewer AI
    const interviewerSystem = `You are the MailGPT Interviewer. Your task is to act as a highly intelligent assistant to gather information before generating a ${typeLabel} email.
    
CRITICAL RULES (FOLLOW STRICTLY):
1. ADAPT TO THE EMAIL TYPE! If it's a personal/casual email (like a birthday), DO NOT ask business questions like Project Scope, Price, or Deliverables. Ask only what makes sense.
2. NEVER act like a rigid bot. If the user says "do it for me", "fill everything", "skip", or gives you creative freedom, YOU MUST STOP ASKING QUESTIONS and immediately proceed.
3. If the user does not have information, DO NOT force them. Intelligently infer it, make something up, or use a placeholder.
4. DO NOT write the final HTML email here. Only act as an assistant preparing the brief.
5. If you STILL need to ask questions to gather info, just ask them normally. DO NOT OUTPUT ANY SECRET TAGS.
6. IF you have all the info you need (or if the user said "make it up"), you must reply with EXACTLY this sequence of characters on its own line:
<START_GENERATION>
DO NOT include <START_GENERATION> if you are still asking questions.`;

    try {
      const response = await axios.post(
        'https://openrouter.ai/api/v1/chat/completions',
        {
          model: 'nvidia/nemotron-3-nano-30b-a3b:free', // Fast conversational
          messages: [{ role: 'system', content: interviewerSystem }, ...session.messages.map(m => ({ role: m.role, content: m.content }))],
          max_tokens: 1500,
          temperature: 0.6,
        },
        { headers: { Authorization: `Bearer ${process.env.OPENROUTER_API_KEY}` } }
      );

      let aiText = response.data?.choices?.[0]?.message?.content || "";
      console.log("🤖 Interviewer Says:", aiText || "(Empty response)");

      if (!aiText) {
        throw new Error("AI returned empty content. Please try again.");
      }

      if (aiText.includes('<START_GENERATION>')) {
        aiText = aiText.replace(/<START_GENERATION>/g, '').trim();
        session.phase = 'generating';

        if (aiText) {
          session.messages.push({ role: 'assistant', content: aiText });
          await session.save();
        }

        // Let execution fall through to Phase 2 below!
      } else {
        // Just return the conversational response
        session.messages.push({ role: 'assistant', content: aiText });
        await session.save();
        return res.json({
          sessionId: session._id.toString(),
          sessionTitle: session.title,
          message: aiText,
          htmlEmail: null,
          hasHtml: false,
        });
      }

    } catch (e) {
      console.error('Interviewer AI Error:', e.response?.data || e.message);
      return res.status(500).json({ error: e.response?.data?.error?.message || e.message });
    }
  }

  // ── Phase 2: Generation AI 
  if (session.phase === 'generating') {
    const generatorSystem = `You are MailGPT, a high-end agentic freelance email designer and expert copywriter.
You have reviewed all the chat logs and collected requirements. Your sole purpose is to output the final, heavily optimized, ultra-converting HTML ${typeLabel}.

RULES:
1. Always respond with TWO parts separated by "---HTML_EMAIL_START---" and "---HTML_EMAIL_END---":
   - First: A very short message to the user ("Here is your finalized email design!").
   - Second: The COMPLETE HTML email code.

2. HTML Guidelines:
   - Max width: 600px centered, table-based layouts
   - Use stunning Typography, modern CSS backgrounds (inline where possible), minimal padding.
   - For images provided in chat ([IMAGE... URL: x]): DO NOT blindly embed them in the HTML. If the image is meant as a reference (like a color palette, mockups, style inspiration), DO NOT include an <img> tag. Simply use the provided "AI Vision Description" to extract colors, styles, and inspiration for the design. ONLY embed images with <img src="x" /> if it makes sense to display them directly to the recipient (like a flyer or logo).
   - Write highly converting copy utilizing the collected notes and context.

${recipientEmail ? 'Recipient is: ' + recipientEmail : ''}
${emailSubject ? 'Subject is: ' + emailSubject : ''}`;

    try {
      const response = await axios.post(
        'https://openrouter.ai/api/v1/chat/completions',
        {
          model: 'nvidia/nemotron-3-nano-30b-a3b:free', // Advanced HTML creator
          messages: [{ role: 'system', content: generatorSystem }, ...session.messages.map(m => ({ role: m.role, content: m.content }))],
          max_tokens: 5000,
          temperature: 0.7,
        },
        { headers: { Authorization: `Bearer ${process.env.OPENROUTER_API_KEY}` } }
      );

      const assistantContent = response.data.choices[0].message.content;
      console.log("🎨 HTML Generator processing complete!");

      session.messages.push({ role: 'assistant', content: assistantContent });

      // Auto-move to "ready_to_send" phase
      session.phase = 'ready';
      await session.save();

      // Parse HTML
      let aiMessage = assistantContent;
      let htmlEmail = null;
      const startMarker = '---HTML_EMAIL_START---';
      const endMarker = '---HTML_EMAIL_END---';

      if (assistantContent.includes(startMarker)) {
        const startIdx = assistantContent.indexOf(startMarker);
        const endIdx = assistantContent.indexOf(endMarker);
        aiMessage = assistantContent.slice(0, startIdx).trim();
        if (endIdx > startIdx) {
          htmlEmail = assistantContent.slice(startIdx + startMarker.length, endIdx).trim();
        } else {
          htmlEmail = assistantContent.slice(startIdx + startMarker.length).trim();
        }
      }

      if (!htmlEmail) {
        const codeMatch = assistantContent.match(/```html\n?([\s\S]*?)```/i);
        if (codeMatch) {
          htmlEmail = codeMatch[1].trim();
          aiMessage = assistantContent.replace(/```html[\s\S]*?```/i, '').trim();
        }
      }

      return res.json({
        sessionId: session._id.toString(),
        sessionTitle: session.title,
        message: aiMessage,
        htmlEmail,
        hasHtml: !!htmlEmail,
      });

    } catch (e) {
      console.error('Generator AI Error:', e.response?.data || e.message);
      return res.status(500).json({ error: e.response?.data?.error?.message || e.message });
    }
  }

});

module.exports = router;
