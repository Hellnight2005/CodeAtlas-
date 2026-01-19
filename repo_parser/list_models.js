const { GoogleGenerativeAI } = require("@google/generative-ai");
require('dotenv').config();

async function listModels() {
    const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
    const model = genAI.getGenerativeModel({ model: "gemini-1.5-flash" }); // Dummy model just to get client? 
    // Actually usually accessing the API directly or checking documentation.
    // The SDK might not have a direct 'listModels' helper exposed on the top level efficiently in all versions.
    // Let's try to just use valid model or see if we can find a workaround.

    // Wait, I can't easily list models via the SDK helper in this version without checking docs.
    // But I can try a "hardcoded" known working model or try to list via REST if SDK allows.

    // Actually, I will update the service to 'gemini-1.5-flash-001' first as a quick fix.
    // If that fails, I'll use a REST call to list models.
}

// REST implementation to list models
const axios = require('axios');

async function checkModels() {
    const key = process.env.GEMINI_API_KEY;
    if (!key) {
        console.error("No API Key found");
        return;
    }

    try {
        const url = `https://generativelanguage.googleapis.com/v1beta/models?key=${key}`;
        const res = await axios.get(url);
        console.log("Available Models:");
        res.data.models.forEach(m => console.log(`- ${m.name} (${m.supportedGenerationMethods.join(', ')})`));
    } catch (err) {
        console.error("Error listing models:", err.response ? err.response.data : err.message);
    }
}

checkModels();
