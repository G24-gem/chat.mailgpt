const express = require('express');
const router = express.Router();
const axios = require('axios');
const { v4: uuidv4 } = require('uuid');

// In-memory session store (replace with DB for production)
const sessions = {};

function getSession(sessionId) {
  if (!sessions[sessionId]) {
    sessions[sessionId] = { id: sessionId, messages: [], createdAt: Date.now() };
  }
  return sessions[sessionId];
}

// List all sessions (email threads)
router.get('/sessions', (req, res) => {
  const list = Object.values(sessions).map(s => ({
    id: s.id,
    title: s.title || 'New Email',
    createdAt: s.createdAt,
    updatedAt: s.updatedAt || s.createdAt,
    preview: s.messages.length > 0 ? (s.messages[0].content || '').slice(0, 60) : '',
  }));
  list.sort((a, b) => b.updatedAt - a.updatedAt);
  res.json(list);
});

// Get a single session
router.get('/sessions/:id', (req, res) => {
  const s = sessions[req.params.id];
  if (!s) return res.status(404).json({ error: 'Session not found' });
  res.json(s);
});

// Delete a session
router.delete('/sessions/:id', (req, res) => {
  delete sessions[req.params.id];
  res.json({ success: true });
});

// Create new session
router.post('/sessions', (req, res) => {
  const id = uuidv4();
  const session = { id, messages: [], createdAt: Date.now(), updatedAt: Date.now() };
  sessions[id] = session;
  res.json(session);
});

// Main chat endpoint
router.post('/message', async (req, res) => {
  const { sessionId, message, mediaFiles, recipientEmail, emailSubject } = req.body;

  if (!message && (!mediaFiles || mediaFiles.length === 0)) {
    return res.status(400).json({ error: 'Message or media required' });
  }

  const session = getSession(sessionId || uuidv4());
  if (!sessions[session.id]) sessions[session.id] = session;

  // Build user message content describing media
  let userContent = message || '';
  if (mediaFiles && mediaFiles.length > 0) {
    const mediaDesc = mediaFiles.map(f => {
      const type = f.mimetype.startsWith('image/') ? 'IMAGE' : f.mimetype.startsWith('video/') ? 'VIDEO' : 'FILE';
      return `[${type}: ${f.originalName} | URL: ${f.url} | Type: ${f.mimetype}]`;
    }).join('\n');
    userContent += `\n\nAttached media files:\n${mediaDesc}`;
  }

  // Auto-title session
  if (session.messages.length === 0) {
    session.title = (message || 'Email').slice(0, 50);
  }

  session.messages.push({ role: 'user', content: userContent });
  session.updatedAt = Date.now();

  const systemPrompt = `You are MailGPT, an expert HTML email designer and copywriter. Your job is to transform plain text prompts into stunning, professional HTML emails.

RULES:
1. Always respond with TWO parts separated by "---HTML_EMAIL_START---" and "---HTML_EMAIL_END---":
   - First: A brief friendly message explaining what you created or asking for clarification
   - Second: The complete, self-contained HTML email code

2. HTML Email Standards:
   - Use inline CSS only (email clients don't support external CSS)
   - Use table-based layouts for maximum compatibility
   - Make it mobile-responsive with media queries in <style> tags
   - Use web-safe fonts with fallbacks, or Google Fonts via @import
   - Max width: 600px centered
   - Include a beautiful header, well-structured body, and footer
   - when Generating a responsive HTML email. Return only raw HTML. Do not include any markdown formatting.

3. If the user includes [IMAGE: filename | URL: someurl] or [VIDEO: filename | URL: someurl]:
   - Embed images using the provided URL: <img src="URL" alt="filename" style="max-width:100%;height:auto;">
   - For videos, add a thumbnail-style image with a play button overlay linking to the video URL
   - Use the positional hints the user provides (e.g., "image at the top", "between paragraphs")

4. Make emails visually stunning - use gradients, beautiful typography, proper spacing, call-to-action buttons, etc.

5. If no recipient/subject is specified, create a generic but beautiful email and mention in your message that they should set recipient and subject before sending.

6. For follow-up messages, refine the HTML based on feedback.

${recipientEmail ? `Recipient: ${recipientEmail}` : ''}
${emailSubject ? `Subject: ${emailSubject}` : ''}`;

  try {
    const response = await axios.post(
      'https://openrouter.ai/api/v1/chat/completions',
      {
        model: 'nvidia/nemotron-3-nano-30b-a3b:free',
        messages: [
          { role: 'system', content: systemPrompt },
          ...session.messages,
        ],
        max_tokens: 4000,
        temperature: 0.7,
      },
      {
        headers: {
          Authorization: `Bearer ${process.env.OPENROUTER_API_KEY}`,
          'Content-Type': 'application/json',
          'HTTP-Referer': process.env.BASE_URL,
          'X-Title': 'MailGPT',
        },
        timeout: 60000,
      }
    );

    const assistantContent = response.data.choices[0].message.content;
    console.log('AI RAW RESPONSE:', assistantContent);
    session.messages.push({ role: 'assistant', content: assistantContent });
    session.updatedAt = Date.now();

    // Parse the response
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

    // Also check for code blocks as fallback
    if (!htmlEmail) {
      const codeMatch = assistantContent.match(/```html\n?([\s\S]*?)```/i);
      if (codeMatch) {
        htmlEmail = codeMatch[1].trim();
        aiMessage = assistantContent.replace(/```html[\s\S]*?```/i, '').trim();
      }
    }

    res.json({
      sessionId: session.id,
      sessionTitle: session.title,
      message: aiMessage,
      htmlEmail,
      hasHtml: !!htmlEmail,
    });

  } catch (err) {
    console.error('OpenRouter error:', err.response?.data || err.message);
    res.status(500).json({ 
      error: err.response?.data?.error?.message || err.message,
      details: 'Make sure your OPENROUTER_API_KEY is set in .env'
    });
  }
});

module.exports = router;
