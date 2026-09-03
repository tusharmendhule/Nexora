const mongoose = require("mongoose");

/**
 * Ensure the MONGO_URI has the password properly URL-encoded.
 *
 * MongoDB Atlas connection strings often contain special characters in the
 * password (e.g. @, #, !, +) that break the URI if not encoded. This helper
 * detects and encodes the password portion automatically so developers can
 * use plain-text passwords in their .env file.
 */
function normalizeMongoUri(uri) {
    if (!uri) return uri;

    // Split off the scheme: "mongodb://" or "mongodb+srv://"
    const schemeMatch = uri.match(/^(mongodb(?:\+srv)?:\/\/)/);
    if (!schemeMatch) return uri;

    const prefix = schemeMatch[0];
    const afterScheme = uri.slice(prefix.length);

    // Find the LAST @ — it separates userinfo from host.
    // This correctly handles passwords that contain literal @ characters.
    const atIndex = afterScheme.lastIndexOf("@");
    if (atIndex === -1) return uri;

    const userinfo = afterScheme.substring(0, atIndex);
    const hostAndPath = afterScheme.substring(atIndex + 1);

    // Split userinfo into user and password (first colon separates them)
    const colonIndex = userinfo.indexOf(":");
    if (colonIndex === -1) return uri;

    const user = userinfo.substring(0, colonIndex);
    const password = userinfo.substring(colonIndex + 1);

    // Already encoded (has %XX hex sequences) — skip
    if (/^%[0-9a-fA-F]{2}/.test(password) || /[^%]%[0-9a-fA-F]{2}/.test(password)) return uri;

    // Only encode if the password contains characters that need it
    const needsEncoding = /[^a-zA-Z0-9\-._~]/.test(password);
    if (!needsEncoding) return uri;

    const encodedPassword = encodeURIComponent(password);
    console.log("🔐 MONGO_URI password auto-encoded for safe connection");
    return `${prefix}${user}:${encodedPassword}@${hostAndPath}`;
}

const connectDB = async () => {
    try {
        const rawUri = process.env.MONGO_URI;
        const uri = normalizeMongoUri(rawUri);
        const conn = await mongoose.connect(uri);
        console.log("MongoDB Connected: " + conn.connection.host);
    } catch (err) {
        console.error("MongoDB connection failed:", err.message);
        console.error("Server will start but database operations will fail.");
        console.error("Fix your MONGO_URI in .env and restart.");
    }
};

module.exports = connectDB;
