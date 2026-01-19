const { GoogleGenerativeAI } = require("@google/generative-ai");
require("dotenv").config();
const logger = require("../config/logger");

// Initialize Gemini client
const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);

/**
 * ✅ 2026 Free Tier Optimized Models
 * Primary: Flash-Lite (1,000 requests/day free)
 * Fallback: Flash (Standard stable version)
 */
const PRIMARY_MODEL = "gemini-2.5-flash-lite";
const FALLBACK_MODEL = "gemini-2.5-flash";

/**
 * Generates a code summary for the CodeAtlas side panel.
 */
const generateCodeSummary = async (codeContent, fileName) => {
    if (!process.env.GEMINI_API_KEY) {
        throw new Error("GEMINI_API_KEY is missing from environment variables.");
    }

    // Placing instructions inside the prompt ensures compatibility with all API versions
    const fullPrompt = `
        SYSTEM INSTRUCTION:
        You are a senior software architect for CodeAtlas. 
        Analyze the provided code and provide structured insights for a UI side-panel.

        TASK:
        Analyze the file "${fileName}". 
        CODE:
        ${codeContent}

        Return ONLY a JSON object with this exact structure:
        {
          "summary": "1-sentence purpose",
          "exports": ["list", "of", "functions"],
          "dependencies": ["list", "of", "libraries"],
          "complexity_score": 5,
          "improvement_tip": "one technical advice"
        }
    `;

    const run = async (modelName) => {
        // We use the stable 'v1' endpoint for consistent free-tier access
        const model = genAI.getGenerativeModel(
            { model: modelName },
            { apiVersion: 'v1' }
        );

        const result = await model.generateContent(fullPrompt);
        const response = await result.response;
        const text = response.text();

        // Strip markdown backticks to ensure valid JSON parsing
        const cleanJson = text.replace(/```json|```/gi, "").trim();

        try {
            return JSON.parse(cleanJson);
        } catch (parseError) {
            logger.error(`[GeminiService] JSON Parse Error: ${parseError.message}`);
            throw new Error("Failed to parse AI response into JSON.");
        }
    };

    try {
        logger.info(`[GeminiService] Free-tier analysis for ${fileName} using ${PRIMARY_MODEL}`);
        return await run(PRIMARY_MODEL);
    } catch (error) {
        logger.warn(`[GeminiService] ${PRIMARY_MODEL} limit or error: ${error.message}`);

        // Retry with standard Flash if Lite is unavailable
        try {
            return await run(FALLBACK_MODEL);
        } catch (fallbackError) {
            logger.error(`[GeminiService] Total failure for ${fileName}: ${fallbackError.message}`);
            throw fallbackError;
        }
    }
};

module.exports = { generateCodeSummary };