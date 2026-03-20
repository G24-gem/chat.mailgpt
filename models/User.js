/* ./models/User.js */
const mongoose = require('mongoose');

const userSchema = new mongoose.Schema({
  googleId:     { type: String, required: true, unique: true, index: true },
  email:        { type: String, required: true, lowercase: true },
  displayName:  { type: String },
  firstName:    { type: String },
  lastName:     { type: String },
  avatar:       { type: String },
  accessToken:  { type: String },          // Gmail OAuth2 access token
  refreshToken: { type: String },          // Gmail OAuth2 refresh token (offline)
  createdAt:    { type: Date, default: Date.now },
  lastLogin:    { type: Date, default: Date.now },
});

// Never leak tokens in JSON responses
userSchema.methods.toSafeObject = function () {
  return {
    _id:         this._id,
    email:       this.email,
    displayName: this.displayName,
    firstName:   this.firstName,
    lastName:    this.lastName,
    avatar:      this.avatar,
    createdAt:   this.createdAt,
    lastLogin:   this.lastLogin,
  };
};

module.exports = mongoose.model('User', userSchema);