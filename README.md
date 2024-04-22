# Smart Nutrition Assistant

Smart Nutrition Assistant is an innovative application designed to help users track and analyze their dietary habits with the aid of advanced AI technology. This tool leverages the GPT-4 Vision API for food recognition and dietary advice, offering a user-friendly interface for meal tracking and nutritional insights.

## Features

- **Meal Photo Upload:** Users can upload photos of their meals for instant nutritional analysis.
- **Dietary Trends Tracking:** View historical dietary data to monitor eating habits over time.
- **Nutritional Advice:** Receive personalized dietary advice based on your eating habits and nutritional goals.
- **User Account Management:** Secure login and registration functionality to manage user profiles and dietary settings.

## Technologies Used

- **Node.js:** A JavaScript runtime built on Chrome's V8 JavaScript engine.
- **Express.js:** A web application framework for Node.js.
- **MongoDB:** A NoSQL database used to store user and meal data.
- **Mongoose:** An ODM (Object Data Modeling) library for MongoDB and Node.js.
- **Bootstrap:** A front-end framework for developing responsive and mobile-first websites.
- **Chart.js:** Simple yet flexible JavaScript charting for designers & developers.
- **OpenAI API:** Utilizes GPT-4 Vision for analyzing meal photos and providing nutritional breakdowns.

## Installation

To get a local copy up and running follow these simple steps:

1. **Clone the repository:**

   ```bash
   git clone https://github.com/Yonas650/smart-nutrition-assistant.git
2. **Navigate to the project directory:**
cd smart-nutrition-assistant

3. **Install NPM packages:**
npm install

4 **Set up the environment variables:Create a .env file in the root directory and update the following:**
MONGODB_URI=YourMongoDBURI
SESSION_SECRET=YourSessionSecret
OPENAI_API_KEY=YourOpenAIKey

5. **Run the application:**
node app.mjs

## Usage
Once the application is running, navigate to http://localhost:3000 to start using the Smart Nutrition Assistant. Register a new account or log in to access the dashboard and begin uploading meal photos and tracking dietary trends.


