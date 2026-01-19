const axios = require('axios');
require('dotenv').config();

const API_KEY = process.env.GEMINI_API_KEY;

if (!API_KEY) {
    console.error("❌ GEMINI_API_KEY is missing");
    process.exit(1);
}

async function listModels() {
    try {
        console.log("Fetching models from v1beta...");
        // Using v1beta as it usually has the widest list
        const url = `https://generativelanguage.googleapis.com/v1beta/models?key=${API_KEY}`;

        const response = await axios.get(url);
        const models = response.data.models;

        if (!models || models.length === 0) {
            console.log("⚠️ No models found.");
            return;
        }

        console.log(`✅ Found ${models.length} models:`);
        models.forEach(model => {
            // Filter for compile/generate models
            if (model.supportedGenerationMethods.includes("generateContent")) {
                console.log(`   - ${model.name} (Version: ${model.version}, Methods: ${model.supportedGenerationMethods.join(', ')})`);
            }
        });

    } catch (error) {
        console.error("❌ Error listing models:");
        if (error.response) {
            console.error(`Status: ${error.response.status}`);
            console.error(JSON.stringify(error.response.data, null, 2));
        } else {
            console.error(error.message);
        }
    }
}

listModels();
