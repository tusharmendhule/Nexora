require("dotenv").config();
const express = require("express");
const connectDB = require("./config/database");
const userRoutes = require("./routes/user.route");
const authRoutes = require("./routes/auth.route");
const postRoutes = require("./routes/post.route"); 
const notificationRoutes = require("./routes/notification.route");
const otpRoutes = require('./routes/otp.route');;

const app = express();

connectDB();

app.use(express.json());

// ==========================================
// Mount Routers (pointing to ./backend/routes)
// ==========================================
app.use('/api/auth', require('./routes/auth.route'));
app.use('/api/users', require('./routes/user.route'));
app.use('/api/posts', require('./routes/post.route'));
app.use('/api/notifications', require('./routes/notification.route'));
app.use('/api/stories', require('./routes/story.route'));
app.use('/api/highlights', require('./routes/highlight.route'));
app.use('/api/messages', require('./routes/message.route'));
app.use('/api/activities', require('./routes/activity.route'));
app.use('/api/analytics', require('./routes/analytics.route'));
app.use('/api/otp', require('./routes/otp.route'));
app.use('/api/hashtags', require('./routes/hashtag.route'));
app.use('/api/settings', require('./routes/settings.route'));
app.use('/api/reports', require('./routes/report.route'));
app.use('/api/trust-score', require('./routes/trustScore.route'));
app.use('/api/fact-check', require('./routes/factCheck.route'));
app.use('/api/moderation', require('./routes/moderation.route'));
app.use('/api/users', require('./routes/follow.route'));
app.use('/api/comments', require('./routes/comment.route'));
app.use('/api/likes', require('./routes/like.route'));
app.use('/api/conversations', require('./routes/conversation.route'));

app.get("/", (req, res) => {
  res.send("Nexora Backend Running 🚀");
});

const PORT = process.env.PORT || 5000;
app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});