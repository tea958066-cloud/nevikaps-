require('dotenv').config();
const { GoogleGenAI } = require('@google/genai');

async function test() {
    try {
        const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });
        const response = await ai.models.generateContent({
            model: 'gemini-2.5-pro',
            contents: 'Hello!'
        });
        console.log(response.text);
    } catch (e) {
        console.log("ERROR:", e);
    }
}
test();
