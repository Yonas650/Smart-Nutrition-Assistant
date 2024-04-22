from flask import Flask, request, redirect, url_for, jsonify, render_template_string
import base64
import requests
from dotenv import load_dotenv
import os
load_dotenv()
app = Flask(__name__)

HTML_FORM = '''
<!DOCTYPE html>
<html>
<head>
    <title>Upload Image for Food Analysis</title>
</head>
<body>
    <h1>Upload an image to get the calorie breakdown</h1>
    <form action="/upload" method="post" enctype="multipart/form-data">
        <input type="file" name="image" required>
        <input type="submit" value="Upload Image">
    </form>
</body>
</html>
'''

@app.route('/')
def index():
    return HTML_FORM

def encode_image_to_base64(image_file):
    """Encode an image file to Base64."""
    return base64.b64encode(image_file.read()).decode('utf-8')

def call_gpt4_vision_api(base64_image, api_key):
    """Make an API call to GPT-4 with a custom prompt for food identification."""
    headers = {
        "Content-Type": "application/json",
        "Authorization": f"Bearer {api_key}"
    }
    payload = {
        "model": "gpt-4-vision-preview",
        "messages": [
            {
                "role": "user",
                "content": [
                    {
                        "type": "text",
                        "text": "Identify the food items in this image and provide their calorie breakdown. no long sentences just structure them in a table. also give the total calorie"
                    },
                    {
                        "type": "image_url",
                        "image_url": {
                            "url": f"data:image/jpeg;base64,{base64_image}"
                        }
                    }
                ]
            }
        ],
        "max_tokens": 300
    }
    response = requests.post("https://api.openai.com/v1/chat/completions", headers=headers, json=payload)
    return response.json()

@app.route('/upload', methods=['POST'])
def upload_file():
    if 'image' not in request.files:
        return redirect(request.url)
    file = request.files['image']
    if file.filename == '':
        return redirect(request.url)
    if file:
        base64_image = encode_image_to_base64(file)
        api_key = os.getenv('OPENAI_API_KEY')  
        response = call_gpt4_vision_api(base64_image, api_key)
        try:
            #extract the table data from the response
            table_data = response.get('choices', [{}])[0].get('message', {}).get('content', '')
            #convert the markdown table to HTML table
            table_html = table_data.replace(" | ", "</td><td>").replace("\n", "</td></tr><tr><td>").replace("---", "").strip()
            table_html = f"<table><tr><td>{table_html}</td></tr></table>"
            #return the HTML table
            return render_template_string(f'''<!DOCTYPE html>
<html>
<head>
    <title>Food Analysis Result</title>
</head>
<body>
    <h1>Food Items and Calorie Information</h1>
    {table_html}
    <a href="/">Upload another image</a>
</body>
</html>''')
        except Exception as e:
            return jsonify({"error": str(e)})

if __name__ == '__main__':
    app.run(debug=True)
