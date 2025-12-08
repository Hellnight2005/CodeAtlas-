const mongoose = require("mongoose");
const logger = require("./logger");

const connectDB = async () => {
  try {
    const mongoURI = process.env.MONGO_URI;

    await mongoose.connect(mongoURI, {
      dbName: "codeAtlas", // explicitly set db name (optional if URI already has it)
    });

    logger.info({
      message: "MongoDB connected successfully",
      service_name: process.env.SERVICE_NAME || "GitHub_Service",
    });

    console.log("MongoDB connected successfully");
  } catch (err) {
    logger.error({
      message: "MongoDB connection error",
      error: err,
      service_name: process.env.SERVICE_NAME || "GitHub_Service",
    });
    console.error("MongoDB connection error:", err);
    process.exit(1);
  }
};

mongoose.connection.on("disconnected", () => {
  logger.warn({
    message: "MongoDB disconnected",
    service_name: process.env.SERVICE_NAME || "GitHub_Service",
  });
});

mongoose.connection.on("reconnected", () => {
  logger.info({
    message: "MongoDB reconnected",
    service_name: process.env.SERVICE_NAME || "GitHub_Service",
  });
});

module.exports = connectDB;
