from flask import Flask, request, jsonify, Response
from flask_sqlalchemy import SQLAlchemy
from flask_cors import CORS
import bcrypt
import requests
import json
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

db = SQLAlchemy(app)

# Chatbot configuration
CHATBOT_URL = os.getenv('CHATBOT_URL')
CHATBOT_HEADERS = {
    'Authorization': os.getenv('CHATBOT_TOKEN'),
    'Content-Type': 'application/json',
}

# User model
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

@app.route('/test-db-detailed', methods=['GET'])
def test_db_detailed():
    """Extended database testing endpoint"""
    try:
        # Test 1: Basic connection
        logger.info("Testing basic database connection...")
        db.session.execute('SELECT 1')
        
        # Test 2: Create table if not exists
        logger.info("Testing table creation...")
        with app.app_context():
            db.create_all()
        
        # Test 3: Try inserting and querying a test user
        logger.info("Testing user insertion and query...")
        test_user = User(
            username=f"test_user_{datetime.now().timestamp()}",
            password=bcrypt.hashpw("test123".encode('utf-8'), bcrypt.gensalt()).decode('utf-8'),
            gender="test"
        )
        
        db.session.add(test_user)
        db.session.commit()
        
        # Query the test user
        queried_user = User.query.filter_by(username=test_user.username).first()
        
        # Cleanup
        db.session.delete(test_user)
        db.session.commit()
        
        return jsonify({
            'status': 'success',
            'message': 'All database tests passed successfully',
            'details': {
                'connection': 'successful',
                'table_creation': 'successful',
                'test_user_creation': 'successful',
                'test_user_query': 'successful'
            }
        })
        
    except Exception as e:
        logger.error(f"Database test failed: {str(e)}", exc_info=True)
        return jsonify({
            'status': 'error',
            'message': 'Database test failed',
            'error': str(e)
        }), 500


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

# Simple test route to verify database connection
@app.route('/test-db')
def test_db():
    try:
        db.session.execute('SELECT 1')
        return jsonify({'message': 'Database connection successful'})
    except Exception as e:
        return jsonify({'error': f'Database connection failed: {str(e)}'}), 500

# Initialize database tables
def init_db():
    with app.app_context():
        try:
            db.create_all()
            print("Database tables created successfully")
        except Exception as e:
            print(f"Error creating database tables: {str(e)}")

def generate_initial_prompt(user_data=None):
    """Generate the initial prompt based on user data if available"""
    base_prompt = """
    As an empathetic and supportive companion, I'm here to listen and help you process your thoughts and feelings. 
    My role is to create a safe, non-judgmental space where you can freely express yourself.
    """
    
    if user_data:
        # Craft a personalized context for the chatbot without directly referencing the data
        context_prompt = f"""
        Context: Speaking with someone who has shared some background about themselves.
        Their life experience includes aspects of {user_data.get('education', '')} and {user_data.get('job', '')}.
        They are in the {user_data.get('age', '')} age range.
        Key considerations: {user_data.get('disorder', 'No specific conditions mentioned')}.
        
        Approach:
        - Maintain a supportive and understanding tone
        - Draw relevant insights from their background when appropriate
        - Be mindful of their specific circumstances
        - Focus on creating a comfortable space for open dialogue
        """
        return base_prompt + context_prompt
    
    return base_prompt


@app.route('/create-session', methods=['POST'])
def create_session():
    bot_id = request.json.get('botId')
    username = request.json.get('username')
    
    if not bot_id:
        return jsonify({'error': 'Bot ID not provided'}), 400
        
    user_data = None
    if username:
        user = User.query.filter_by(username=username).first()
        if user:
            user_data = {
                'username': user.username,
                'gender': user.gender,
                'age': user.age,
                'education': user.education,
                'job': user.job,
                'disorder': user.disorder
            }
    
    session_data = {
        "botId": bot_id,
        "user": None,
        "initialMessages": None
    }
    
    response = requests.post(
        f"{CHATBOT_URL}/chat/session", 
        headers=CHATBOT_HEADERS, 
        data=json.dumps(session_data)
    )
    
    session_response = response.json()
    
    # If session created successfully and we have user data, send initial prompt
    if 'id' in session_response:
        initial_prompt = generate_initial_prompt(user_data)
        message_url = f"{CHATBOT_URL}/chat/session/{session_response['id']}/message"
        message_data = {
            "message": {
                "content": initial_prompt,
                "type": "SYSTEM"
            }
        }
        requests.post(message_url, headers=CHATBOT_HEADERS, json=message_data)
    
    return jsonify(session_response)

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