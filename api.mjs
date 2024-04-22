import fetch from 'node-fetch';
import dotenv from 'dotenv';
import { marked } from 'marked';

dotenv.config();

class NutritionAPI {
    constructor(apiKey) {
        this.apiKey = apiKey;
        this.apiURL = "https://api.openai.com/v1/chat/completions";
        this.headers = {
            "Content-Type": "application/json",
            "Authorization": `Bearer ${this.apiKey}`
        };
    }

    async encodeImageToBase64(imageBuffer) {
        return imageBuffer.toString('base64');
    }

    async callGPT4VisionAPI(base64Image) {
        const payload = {
            "model": "gpt-4-vision-preview",
            "messages": [{
                "role": "user",
                "content": [{
                    "type": "text",
                    "text": "Please identify the food in this image and provide the breakdown in JSON format. Include each food item constituting the meal with its calorie count and macronutrients in grams. The response should include an array of items, each item should list the food name, carbs, protein, fats, and calories. End with a total calorie count for the meal. Aim for a response that follows this structure: {\"items\": [{\"name\": \"Food Item\", \"carbs\": XX, \"protein\": XX, \"fats\": XX, \"calories\": XX}], \"totalCalories\": XXXX}. Provide your best estimate based on the image. This data is required for a web application and must adhere strictly to the requested format without additional text."
                }, {
                    "type": "image_url",
                    "image_url": {
                        "url": `data:image/jpeg;base64,${base64Image}`
                    }
                }]
            }],
            "max_tokens": 700
        };

        try {
            const response = await fetch(this.apiURL, {
                method: 'POST',
                headers: this.headers,
                body: JSON.stringify(payload)
            });
            if (!response.ok) {
                throw new Error(`API request failed with status ${response.status}: ${response.statusText}`);
            }
            return await response.json();
        } catch (error) {
            console.error(`Error calling GPT-4 Vision API: ${error.message}`);
            throw error;
        }
    }

    async getDietaryAdvice(userGoals, dietaryTrends) {
        const messages = [
            {
                "role": "system",
                "content": "You are a helpful assistant providing dietary advice."
            },
            {
                "role": "user",
                "content": `Given that a user's dietary goals are ${JSON.stringify(userGoals)}, and their actual dietary trends are ${JSON.stringify(dietaryTrends)}, provide a detailed analysis and advice on how they can better meet their dietary goals. The advice should be actionable and supportive. Treat the user in first person`
            }
        ];

        const data = {
            model: "gpt-4-turbo",
            messages: messages,
            max_tokens: 800
        };

        try {
            const response = await fetch(this.apiURL, {
                method: 'POST',
                headers: this.headers,
                body: JSON.stringify(data)
            });

            const responseJson = await response.json();
            if (!response.ok) {
                throw new Error(`API request failed with status ${response.status}: ${response.statusText}, Details: ${responseJson.error ? responseJson.error.message : 'No additional error information'}`);
            }

            //convert Markdown advice to HTML using marked
            const adviceResponse = marked(responseJson.choices[0].message.content.trim());
            return adviceResponse;
        } catch (error) {
            console.error(`Error calling GPT-4 API: ${error.message}`);
            throw error;
        }
    }
}

export default new NutritionAPI(process.env.OPENAI_API_KEY);
