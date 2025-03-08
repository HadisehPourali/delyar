from flask import Flask, request, jsonify, send_from_directory
from flask_sqlalchemy import SQLAlchemy
from flask_cors import CORS
import bcrypt
import requests
from datetime import datetime
import os
import logging
from dotenv import load_dotenv
load_dotenv()

logging.basicConfig(level=logging.DEBUG)
logger = logging.getLogger(__name__)

app = Flask(__name__)
CORS(app)

# Database configuration
DB_USERNAME = os.getenv('DB_USERNAME')
DB_PASSWORD = os.getenv('DB_PASSWORD')
DB_HOST = os.getenv('DB_HOST')
DB_PORT = os.getenv('DB_PORT')
DB_NAME = os.getenv('DB_NAME')

# Construct database URL - note the specific format
DATABASE_URL = f'postgresql://{DB_USERNAME}:{DB_PASSWORD}@{DB_HOST}:{DB_PORT}/{DB_NAME}'
logger.info(f"Database URL (without password): postgresql://{DB_USERNAME}:****@{DB_HOST}:{DB_PORT}/{DB_NAME}")

# Database configuration
app.config['SQLALCHEMY_DATABASE_URI'] = DATABASE_URL
app.config['SQLALCHEMY_TRACK_MODIFICATIONS'] = False
app.config['SQLALCHEMY_ECHO'] = True  # Enable SQL query logging

# Create a static directory if it doesn't exist
STATIC_DIR = os.path.join(os.path.dirname(os.path.abspath(__file__)), 'static')
if not os.path.exists(STATIC_DIR):
    os.makedirs(STATIC_DIR)
    logger.info(f"Created static directory at {STATIC_DIR}")

# Create eNamad verification file
ENAMAD_FILE = os.path.join(STATIC_DIR, '39639356.txt')
with open(ENAMAD_FILE, 'w') as f:
    f.write('')  # Create empty file
    logger.info(f"Created eNamad verification file at {ENAMAD_FILE}")

db = SQLAlchemy(app)

# Chatbot configuration
CHATBOT_URL = os.getenv('CHATBOT_URL')
CHATBOT_HEADERS = {
    'Authorization': os.getenv('CHATBOT_TOKEN'),
    'Content-Type': 'application/json',
}

class User(db.Model):
    __tablename__ = 'users'
    
    id = db.Column(db.Integer, primary_key=True)
    username = db.Column(db.String(80), unique=True, nullable=False)
    password = db.Column(db.String(255), nullable=False)
    gender = db.Column(db.String(20))
    age = db.Column(db.String(10))
    education = db.Column(db.String(100))
    job = db.Column(db.String(100))
    disorder = db.Column(db.String(200))
    created_at = db.Column(db.DateTime, default=datetime.utcnow)

    def to_dict(self):
        return {
            'username': self.username,
            'gender': self.gender,
            'age': self.age,
            'education': self.education,
            'job': self.job,
            'disorder': self.disorder
        }

# eNamad verification file route
@app.route('/39639356.txt')
def enamad_verification():
    return send_from_directory(STATIC_DIR, '39639356.txt')

@app.route('/api/chat/sessions', methods=['GET'])
def get_chat_sessions():
    try:
        username = request.args.get('userId')
        page = request.args.get('page', '0')
        size = request.args.get('size', '10')
        bot_id = os.getenv('BOT_ID')  # Get from environment variables
        
        if not username:
            logger.error("No userId provided in request")
            return jsonify({'error': 'userId is required'}), 400

        # Include both userId and botId in the request
        params = {
            'page': page,
            'size': size
        }
        
        # Add filters if they exist
        if username:
            params['userId'] = username
        if bot_id:
            params['botId'] = bot_id
            
        response = requests.get(
            f"{CHATBOT_URL}/chat/session",
            headers=CHATBOT_HEADERS,
            params=params
        )
        
        if response.ok:
            return jsonify(response.json()), response.status_code
        else:
            logger.error(f"Error from Metis AI: {response.text}")
            return jsonify({'error': 'Failed to retrieve chat sessions'}), response.status_code

    except Exception as e:
        logger.error(f"Error retrieving chat sessions: {str(e)}", exc_info=True)
        return jsonify({'error': 'Failed to retrieve chat sessions'}), 500
    
@app.route('/api/chat/sessions/<session_id>', methods=['GET'])
def get_chat_session(session_id):
    try:
        response = requests.get(
            f"{CHATBOT_URL}/chat/session/{session_id}",
            headers=CHATBOT_HEADERS
        )
        
        if response.ok:
            session_data = response.json()
            messages = []
            if 'messages' in session_data:
                messages = session_data['messages']
            elif 'history' in session_data:
                messages = session_data['history']
            
            return jsonify({
                'id': session_id,
                'messages': messages,
                'title': session_data.get('title', 'گفتگوی جدید')
            })
            
        logger.error(f"Failed to retrieve session {session_id}: {response.text}")
        return jsonify({'error': 'Failed to retrieve chat session'}), response.status_code

    except Exception as e:
        logger.error(f"Error retrieving chat session: {str(e)}", exc_info=True)
        return jsonify({'error': 'Failed to retrieve chat session'}), 500

@app.route('/api/signup', methods=['POST'])
def signup():
    try:
        data = request.json
        logger.info(f"Received signup request for username: {data.get('username')}")
        
        # Validate required fields
        if not data.get('username') or not data.get('password'):
            return jsonify({'error': 'Username and password are required'}), 400
            
        # Check if username already exists
        existing_user = User.query.filter_by(username=data['username']).first()
        if existing_user:
            return jsonify({'error': 'Username already exists'}), 400
        
        # Hash password
        hashed_password = bcrypt.hashpw(data['password'].encode('utf-8'), bcrypt.gensalt())
        
        # Create new user
        new_user = User(
            username=data['username'],
            password=hashed_password.decode('utf-8'),
            gender=data.get('gender', ''),
            age=str(data.get('age', '')),
            education=data.get('education', ''),
            job=data.get('job', ''),
            disorder=data.get('disorder', '')
        )
        
        # Save to database
        logger.info("Attempting to save new user to database...")
        db.session.add(new_user)
        db.session.commit()
        logger.info("Successfully saved new user to database")
        
        return jsonify({
            'message': 'User created successfully',
            'user': new_user.to_dict()
        })
        
    except Exception as e:
        logger.error(f"Error in signup: {str(e)}", exc_info=True)
        db.session.rollback()
        return jsonify({'error': f'An error occurred during signup: {str(e)}'}), 500

@app.route('/api/login', methods=['POST'])
def login():
    try:
        data = request.json
        
        # Validate input
        if not data.get('username') or not data.get('password'):
            return jsonify({'error': 'Username and password are required'}), 400
        
        # Find user
        user = User.query.filter_by(username=data['username']).first()
        
        if not user:
            return jsonify({'error': 'Invalid credentials'}), 401
        
        # Verify password
        if bcrypt.checkpw(data['password'].encode('utf-8'), user.password.encode('utf-8')):
            return jsonify({
                'message': 'Login successful',
                'user': user.to_dict()
            })
        else:
            return jsonify({'error': 'Invalid credentials'}), 401
            
    except Exception as e:
        print(f"Error in login: {str(e)}")
        return jsonify({'error': 'An error occurred during login'}), 500

def init_db():
    with app.app_context():
        try:
            db.create_all()
            print("Database tables created successfully")
        except Exception as e:
            print(f"Error creating database tables: {str(e)}")


@app.route('/create-session', methods=['POST'])
def create_session():
    try:
        bot_id = request.json.get('botId')
        username = request.json.get('username')
        
        if not bot_id:
            return jsonify({'error': 'Bot ID not provided'}), 400
        
        user = None
        if username:
            user = {
                "id": username,
                "name": username
            }
        
        session_data = {
            "botId": bot_id,
            "user": user,
            "initialMessages":[
                {
                  "type": "AI",
                  "content": """سلام دوست من! ✨
خوشحالم که اومدی پیشم. من دلیار هستم، دوستی که هر وقت دلت خواست کنارته.
چی تو دلت هست که دوست داری باهام درمیون بذاری؟ من اینجام که گوش کنم... ♥️"""
                }
              ]
        }
        
        response = requests.post(
            f"{CHATBOT_URL}/chat/session", 
            headers=CHATBOT_HEADERS, 
            json=session_data
        )
        
        session_response = response.json()
        
        return jsonify(session_response)
        
    except Exception as e:
        logger.error(f"Error creating session: {str(e)}", exc_info=True)
        return jsonify({'error': f'Failed to create session: {str(e)}'}), 500
        
@app.route('/respond', methods=['POST'])
def respond_to_chat():
    data = request.json
    session_id = data.get('sessionId')
    content = data.get('content')
    username = data.get('username')
    is_first_message = data.get('isFirstMessage', False)
    
    if not session_id or not content:
        return jsonify({'error': 'Session ID or content not provided'}), 400
    
    if is_first_message and username:
        user = User.query.filter_by(username=username).first()
        if user:
            context = f"""[System Note: This user has provided the following information:
Gender: {user.gender or 'Not specified'}
Age: {user.age or 'Not specified'}
Education: {user.education or 'Not specified'}
Job: {user.job or 'Not specified'}
Health Considerations: {user.disorder or 'Not specified'}

Please consider this information while interacting with the user and reference it when relevant.
Remember these details throughout the conversation.]

User message: {content}"""
            
            content = context
    
    message_url = f"{CHATBOT_URL}/chat/session/{session_id}/message"
    message_data = {
        "message": {
            "content": content,
            "type": "USER"
        }
    }
    
    response = requests.post(message_url, headers=CHATBOT_HEADERS, json=message_data)
    return jsonify(response.json())

if __name__ == '__main__':
    with app.app_context():
        try:
            logger.info("Attempting to create database tables...")
            db.create_all()
            logger.info("Database tables created successfully")
        except Exception as e:
            logger.error(f"Error creating database tables: {str(e)}", exc_info=True)
    
    port = 5000
    app.run(host='0.0.0.0', port=port, debug=True)