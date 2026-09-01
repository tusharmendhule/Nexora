const mongoose = require("mongoose");

const connectDB = async () => {
    try {
        const conn = await mongoose.connect(process.env.MONGO_URI);
        console.log("MongoDB Connected: " + conn.connection.host);
    } catch (err) {
        console.error("MongoDB connection failed:", err.message);
        console.error("Server will start but database operations will fail.");
        console.error("Fix your MONGO_URI in .env and restart.");
    }
};

module.exports = connectDB;
