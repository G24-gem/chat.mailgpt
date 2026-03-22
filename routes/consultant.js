/* ./routes/consultant.js */
const express = require('express');
const router = express.Router();
const axios = require('axios');
const fs = require('fs');
const path = require('path');

// THE SOURCE OF TRUTH (The "PDF" replacement)
const docsPath = path.join(__dirname, '../docs', 'mailgpt_docs.txt');

router.post('/chat', async (req, res) => {
    const { message } = req.body;
    if (!message) return res.status(400).json({ error: 'No message provided' });

    try {
        // Read the knowledge base
        let knowledge = "";
        if (fs.existsSync(docsPath)) {
            knowledge = fs.readFileSync(docsPath, 'utf8');
        }

        const systemPrompt = `You are the Official MailGPT AI Consultant. 
Your SOLE purpose is to guide users on how to use the MailGPT ecosystem. 

KNOWLEDGE BASE (USE THIS FOR ALL ANSWERS):
${knowledge}

INSTRUCTIONS:
1. Only answer questions related to MailGPT.
2. If asked about technical features (e.g. Gmail poller or 24h followups), refer to the documentation above.
3. Be encouraging and concise.
4. If a user asks about something NOT in the docs (like generic weather or math), politely redirect them to MailGPT features.

IMPORTANT: Do not hallucinate features we don't have. Only talk about what is in the knowledge base.`;

        const response = await axios.post(
            'https://openrouter.ai/api/v1/chat/completions',
            {
                model: 'nvidia/nemotron-3-nano-30b-a3b:free',
                messages: [
                    { role: 'system', content: systemPrompt },
                    { role: 'user', content: message }
                ],
                max_tokens: 1000,
                temperature: 0.5,
            },
            { headers: { Authorization: `Bearer ${process.env.OPENROUTER_API_KEY}` } }
        );

        const aiReply = response.data?.choices?.[0]?.message?.content || "I'm sorry, I'm having trouble accessing my documentation right now.";
        res.json({ reply: aiReply });

    } catch (err) {
        console.error('[Consultant] API Error:', err.message);
        res.status(500).json({ error: 'Consultant engine disconnected.' });
    }
});

module.exports = router;
