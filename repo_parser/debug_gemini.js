const { GoogleGenerativeAI } = require("@google/generative-ai");
require("dotenv").config();
const logger = require("./config/logger");

async function debugGemini() {
    const key = process.env.GEMINI_API_KEY;
    if (!key) {
        console.error("❌ GEMINI_API_KEY is missing");
        return;
    }
    console.log(`🔑 Key loaded: ${key.substring(0, 5)}... (Length: ${key.length})`);

    // Check SDK Version
    try {
        const sdkVersion = require("@google/generative-ai/package.json").version;
        console.log(`📦 SDK Version: ${sdkVersion}`);
    } catch (e) {
        console.log("Could not read SDK version");
    }

    const genAI = new GoogleGenerativeAI(key);

    console.log("\n--- Testing Model Listing (via SDK or REST if needed) ---");
    // Note: SDK usually doesn't expose listModels cleanly in all versions on the instance itself.
    // We'll try a generation directly to see specific errors.

    const modelsToTest = [
        "gemini-1.5-flash",
        "gemini-1.5-flash-latest",
        "gemini-1.0-pro",
        "gemini-pro"
    ];

    for (const modelName of modelsToTest) {
        console.log(`\n🤖 Testing model: ${modelName}`);
        try {
            // Default (v1beta)
            const model = genAI.getGenerativeModel({ model: modelName });
            const result = await model.generateContent("Hello?");
            const response = await result.response;
            console.log(`✅ Success (v1beta)! Response: ${response.text().substring(0, 20)}...`);
        } catch (error) {
            console.error(`❌ Failed (v1beta): ${error.message}`);
        }

        try {
            // v1 Explicit
            const modelV1 = genAI.getGenerativeModel({ model: modelName }, { apiVersion: "v1" });
            const resultV1 = await modelV1.generateContent("Hello?");
            const responseV1 = await resultV1.response;
            console.log(`✅ Success (v1)! Response: ${responseV1.text().substring(0, 20)}...`);
        } catch (error) {
            console.error(`❌ Failed (v1): ${error.message}`);
        }
    }

    console.log("\n--- Testing Explicit 'v1' API Version Request ---");
    try {
        // Attempting to pass apiVersion if SDK supports it in getGenerativeModel config
        // Some versions use: getGenerativeModel({ model: ... }, { apiVersion: 'v1' })
        const modelV1 = genAI.getGenerativeModel({ model: "gemini-1.5-flash" }, { apiVersion: "v1" });
        // NOTE: The second arg might be RequestOptions

        const result = await modelV1.generateContent("Test v1");
        const response = await result.response;
        console.log(`✅ v1 Success! Response: ${response.text().substring(0, 50)}...`);
    } catch (error) {
        console.error(`❌ v1 Failed: ${error.message}`);
    }

}

debugGemini();
