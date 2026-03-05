# MailGPT ✉

AI-powered email composer — describe your email, get beautiful HTML ready to send.

## Quick Start

1. **Install:** `npm install`
2. **Edit .env** — add your `OPENROUTER_API_KEY` (get one free at openrouter.ai)
3. **Run:** `npm start`
4. Open **http://localhost:3000**

## .env Reference

```
PORT=3000
SENDER_EMAIL=kemmiebabk@gmail.com
SENDER_APP_PASSWORD=ouhj xooh xidw tuzc
OPENROUTER_API_KEY=sk-or-your-key-here
BASE_URL=http://localhost:3000
```

## Features
- AI transforms plain text → stunning HTML emails
- Upload images/videos → embedded in the email
- Chat-style follow-up to refine
- Live iframe preview in chat
- One-click send via Gmail
- Full email history sidebar
- Copy HTML to use anywhere

## Structure
```
mailgpt/
├── server.js
├── routes/chat.js       ← AI + sessions
├── routes/email.js      ← Nodemailer send
├── routes/media.js      ← File uploads
├── public/
│   ├── index.html
│   ├── css/style.css
│   ├── js/app.js
│   └── media/           ← uploaded files
└── .env
```
