from flask import Flask, request, jsonify
import requests
import json
from flask_cors import CORS

app = Flask(__name__)
CORS(app)

url = 'https://api.metisai.ir/api/v1'
headers = {
    'Authorization': 'Bearer tpsg-3a92YJqTnAqFcoK276VzE634QcXXrDz',  # Replace 'YOUR API KEY' with your actual key
    'Content-Type': 'application/json',
}

# Create a session with the chatbot
@app.route('/create-session', methods=['POST'])
def create_session():
    bot_id = request.json.get('botId')  # Get bot ID from the request
    
    if bot_id is None:
        return jsonify({'error': 'Bot ID not provided'}), 400

    session_data = {
        "botId": bot_id,
        "user": None,
        "initialMessages": None
    }

    print(f"Creating session with bot ID: {bot_id}")

    response = requests.post(url + "/chat/session", headers=headers, data=json.dumps(session_data))
    print(f"Session creation response: {response.json()}")

    return jsonify(response.json())


# Send a message to the chatbot and get a response
@app.route('/respond', methods=['POST'])
def respond_to_chat():
    # Debugging: Check what JSON data is received
    data = request.json
    print(f"Received data: {data}")  # This will log the received data in the terminal

    session_id = data.get('sessionId')
    content = data.get('content')

    # Error handling if data is missing
    if session_id is None or content is None:
        print(f"Missing session_id or content: session_id={session_id}, content={content}")
        return jsonify({'error': 'Session ID or content not provided'}), 400

    print(f"Sending message to session ID: {session_id}, Content: {content}")

    message_url = url + f"/chat/session/{session_id}/message"
    message_data = {
        "message": {
            "content": content,
            "type": "USER"
        }
    }

    response = requests.post(message_url, headers=headers, data=json.dumps(message_data))
    print(f"Message response: {response.json()}")

    return jsonify(response.json())



if __name__ == '__main__':
    app.run(debug=True)
