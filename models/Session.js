const mongoose = require('mongoose');

const messageSchema = new mongoose.Schema({
    role: { type: String, enum: ['user', 'assistant', 'system'], required: true },
    content: { type: String, required: true },
    createdAt: { type: Date, default: Date.now }
});

const sessionSchema = new mongoose.Schema({
    userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: false },
    title: { type: String, default: 'New Email' },
    emailType: { type: String, default: null }, // cold_pitch, proposal, follow_up, etc.
    phase: { type: String, default: 'interview' }, // interview, generating, ready, sent_awaiting_reply, replied, followup_suggested
    gmailThreadId: { type: String }, // To track email replies
    sentAt: { type: Date, default: null }, // When the email was sent (for 24h follow-up check)
    lastSeenMessageId: { type: String, default: null }, // Deduplication: ID of the last reply message we processed
    followupSuggested: { type: Boolean, default: false }, // True once we've suggested a follow-up
    hasUnreadReply: { type: Boolean, default: false },
    clientSocialLinks: [{ type: String }],
    collectedData: { type: mongoose.Schema.Types.Mixed, default: {} },
    messages: [messageSchema],
    createdAt: { type: Date, default: Date.now },
    updatedAt: { type: Date, default: Date.now }
});

module.exports = mongoose.model('Session', sessionSchema);
