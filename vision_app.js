require('dotenv').config();
const express = require('express');
const multer = require('multer');
const axios = require('axios');
const fs = require('fs');
const path = require('path');

const app = express();
const PORT = 4000; // Running on a different port so it doesn't conflict with main app

app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Setup multer for memory storage
const upload = multer({ storage: multer.memoryStorage() });

// ── HTML Frontend ──
const htmlTemplate = `
<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Vision Model Tester</title>
    <style>
        :root {
            --bg: #0f172a; --surface: #1e293b; --primary: #3b82f6; --text: #f8fafc; --text-muted: #94a3b8;
        }
        body {
            font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif;
            background-color: var(--bg); color: var(--text); padding: 40px; margin: 0;
        }
        .container {
            max-width: 1000px; margin: 0 auto;
        }
        h1 { margin-top: 0; }
        .card {
            background-color: var(--surface); padding: 24px; border-radius: 12px; margin-bottom: 24px;
            box-shadow: 0 4px 6px -1px rgba(0, 0, 0, 0.1), 0 2px 4px -1px rgba(0, 0, 0, 0.06);
        }
        label { display: block; margin-bottom: 8px; font-weight: 500; }
        input[type="text"], textarea {
            width: 100%; padding: 12px; border-radius: 8px; border: 1px solid #334155;
            background-color: #0f172a; color: white; margin-bottom: 16px; box-sizing: border-box; font-family: inherit;
        }
        button {
            background-color: var(--primary); color: white; border: none; padding: 12px 24px;
            border-radius: 8px; cursor: pointer; font-weight: 600; font-size: 16px; transition: opacity 0.2s;
        }
        button:hover { opacity: 0.9; }
        button:disabled { opacity: 0.5; cursor: not-allowed; }
        .preview-img { max-width: 300px; max-height: 300px; border-radius: 8px; display: none; margin-bottom: 16px; }
        .grid { display: grid; grid-template-columns: 1fr; gap: 24px; }
        @media (min-width: 768px) { .grid { grid-template-columns: 1fr 1fr; } }
        .result-card {
            background-color: var(--surface); padding: 20px; border-radius: 12px; border-left: 4px solid var(--primary);
        }
        .model-name { font-weight: 700; font-size: 1.1em; margin-bottom: 12px; padding-bottom: 12px; border-bottom: 1px solid #334155; }
        .time-taken { font-size: 0.8em; color: var(--text-muted); float: right; }
        .error-text { color: #ef4444; }
        pre { white-space: pre-wrap; font-family: inherit; margin: 0; line-height: 1.5; color: #cbd5e1; }
    </style>
</head>
<body>
    <div class="container">
        <h1>👁️ Vision Model Tester</h1>
        
        <div class="card">
            <form id="testForm">
                <label>1. Upload Image</label>
                <input type="file" id="imageInput" accept="image/*" required style="margin-bottom: 16px; display: block;">
                <img id="imagePreview" class="preview-img">

                <label>2. Enter Vision Models to Test (comma separated)</label>
                <textarea id="modelsInput" rows="3" placeholder="e.g. nvidia/nemotron-nano-12b-v2-vl:free, openai/gpt-4-vision-preview, google/gemini-pro-vision">nvidia/nemotron-nano-12b-v2-vl:free, google/gemini-2.5-flash</textarea>

                <label>3. Custom Prompt</label>
                <input type="text" id="promptInput" value="Describe what you see in this image in detail. Extract any text, mood, and context." required>

                <button type="submit" id="submitBtn">Test Models</button>
            </form>
        </div>

        <div id="resultsGrid" class="grid"></div>
    </div>

    <script>
        const form = document.getElementById('testForm');
        const imageInput = document.getElementById('imageInput');
        const imagePreview = document.getElementById('imagePreview');
        const modelsInput = document.getElementById('modelsInput');
        const promptInput = document.getElementById('promptInput');
        const submitBtn = document.getElementById('submitBtn');
        const resultsGrid = document.getElementById('resultsGrid');

        // Show image preview
        imageInput.addEventListener('change', (e) => {
            const file = e.target.files[0];
            if (file) {
                const url = URL.createObjectURL(file);
                imagePreview.src = url;
                imagePreview.style.display = 'block';
            } else {
                imagePreview.style.display = 'none';
            }
        });

        form.addEventListener('submit', async (e) => {
            e.preventDefault();
            if (!imageInput.files[0]) return;

            submitBtn.disabled = true;
            submitBtn.textContent = 'Testing...';
            resultsGrid.innerHTML = '';

            const formData = new FormData();
            formData.append('image', imageInput.files[0]);
            formData.append('models', modelsInput.value);
            formData.append('prompt', promptInput.value);

            try {
                const response = await fetch('/api/test', {
                    method: 'POST',
                    body: formData
                });
                const data = await response.json();

                if (data.error) throw new Error(data.error);

                data.results.forEach(res => {
                    const div = document.createElement('div');
                    div.className = 'result-card';
                    
                    const isError = res.error;
                    const content = isError ? \`<span class="error-text">\${res.error}</span>\` : \`<pre>\${res.content}</pre>\`;
                    const time = res.timeMs ? \`<span class="time-taken">\${(res.timeMs / 1000).toFixed(2)}s</span>\` : '';

                    div.innerHTML = \`
                        <div class="model-name">
                            \${res.model} \${time}
                        </div>
                        <div class="model-content">
                            \${content}
                        </div>
                    \`;
                    resultsGrid.appendChild(div);
                });

            } catch (err) {
                alert('Error: ' + err.message);
            } finally {
                submitBtn.disabled = false;
                submitBtn.textContent = 'Test Models';
            }
        });
    </script>
</body>
</html>
`;

app.get('/', (req, res) => {
    res.send(htmlTemplate);
});

app.post('/api/test', upload.single('image'), async (req, res) => {
    try {
        if (!req.file) return res.status(400).json({ error: 'No image uploaded' });

        const modelsStr = req.body.models || '';
        const models = modelsStr.split(',').map(m => m.trim()).filter(Boolean);
        const prompt = req.body.prompt || 'Describe this image.';

        if (models.length === 0) return res.status(400).json({ error: 'No models specified' });

        const base64 = req.file.buffer.toString('base64');
        const mimetype = req.file.mimetype;
        const dataUri = `data:${mimetype};base64,${base64}`;

        const results = [];

        // Run requests in parallel
        await Promise.all(models.map(async (model) => {
            const startTime = Date.now();
            try {
                const payload = {
                    model: model,
                    messages: [
                        {
                            role: 'user',
                            content: [
                                { type: 'text', text: prompt },
                                { type: 'image_url', image_url: { url: dataUri } }
                            ]
                        }
                    ]
                };

                const response = await axios.post('https://openrouter.ai/api/v1/chat/completions', payload, {
                    headers: {
                        Authorization: `Bearer ${process.env.OPENROUTER_API_KEY}`,
                        'HTTP-Referer': process.env.BASE_URL || 'http://localhost'
                    }
                });

                // Log raw response for debugging
                console.log(`[${model}] raw response:`, JSON.stringify(response.data, null, 2));

                const choice = response.data?.choices?.[0];
                if (!choice) {
                    // Model returned no choices — surface the raw response as an error
                    const rawMsg = JSON.stringify(response.data);
                    results.push({
                        model: model,
                        error: `Model returned no choices. Raw response: ${rawMsg}`,
                        timeMs: Date.now() - startTime
                    });
                } else {
                    results.push({
                        model: model,
                        content: choice.message?.content ?? '(empty response)',
                        timeMs: Date.now() - startTime
                    });
                }
            } catch (err) {
                results.push({
                    model: model,
                    error: err.response?.data?.error?.message || err.message,
                    timeMs: Date.now() - startTime
                });
            }
        }));

        res.json({ results });
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: 'Server error' });
    }
});

app.listen(PORT, () => {
    console.log(`\n👁️  Vision Tester App running at http://localhost:${PORT}\n`);
});
