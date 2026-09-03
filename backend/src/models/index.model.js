const User = require('./user.model');
const OTP = require('./otp.model');
const Post = require('./post.model');
const Comment = require('./comment.model');
const Like = require('./like.model');
const Follower = require('./follower.model');
const Story = require('./story.model');
const Conversation = require('./conversation.model');
const Message = require('./message.model');
const SavedPost = require('./saved-post.model');
const Hashtag = require('./hashtag.model');
const Highlight = require('./highlight.model');
const TrustScore = require('./trust-score.model');
const FactCheckCache = require('./fact-check-cache.model');
const Moderation = require('./moderation.model');
const Report = require('./report.model');
const ClaimEntity = require('./claim-entity.model');
const Block = require('./block.model');

module.exports = {
  User,
  OTP,
  Post,
  Comment,
  Like,
  Follower,
  Story,
  Conversation,
  Message,
  SavedPost,
  Hashtag,
  Highlight,
  TrustScore,
  FactCheckCache,
  Moderation,
  Report,
  ClaimEntity,
  Block,
};