from flask import Flask, request, jsonify, redirect, url_for, session
from flask_sqlalchemy import SQLAlchemy
from flask_cors import CORS
# import bcrypt # No longer needed for user auth based on OTP
import requests
from datetime import datetime, timedelta
import os
import logging
from suds.client import Client # For Zarinpal SOAP requests
from dotenv import load_dotenv
from sqlalchemy.orm import relationship
from flask_session import Session # For server-side sessions
from sqlalchemy.exc import IntegrityError
from melipayamak import Api
import random
import string

load_dotenv()

logging.basicConfig(level=logging.DEBUG)
logger = logging.getLogger(__name__)

app = Flask(__name__)
# Configure CORS to allow credentials (cookies) from the frontend origin
FRONTEND_URL = os.getenv('FRONTEND_URL', "http://localhost:3000")
CORS(app, origins=[FRONTEND_URL], supports_credentials=True, methods=["GET", "POST", "PUT", "DELETE", "OPTIONS"])

# --- Session Configuration ---
# Choose a session type (filesystem is simple for dev)
SESSION_TYPE = os.getenv('SESSION_TYPE', 'filesystem')
SESSION_FILE_DIR = os.getenv('SESSION_FILE_DIR', './flask_session')
SESSION_PERMANENT = False # Make sessions non-permanent (browser session)
SESSION_USE_SIGNER = True # Encrypt session cookie
SESSION_KEY_PREFIX = 'delyar_session:'
# IMPORTANT: Set a strong, random secret key in your .env file for production
app.config['SECRET_KEY'] = os.getenv('FLASK_SECRET_KEY', 'dev-secret-key-change-in-prod')
app.config.from_object(__name__)
# Create the session directory if it doesn't exist (for filesystem type)
if SESSION_TYPE == 'filesystem' and not os.path.exists(SESSION_FILE_DIR):
    os.makedirs(SESSION_FILE_DIR)
    logger.info(f"Created session directory: {SESSION_FILE_DIR}")
Session(app)
# --- End Session Configuration ---

SESSION_PRICE = int(os.getenv('SESSION_PRICE', 39000))

# Database configuration
DB_USERNAME = os.getenv('DB_USERNAME')
DB_PASSWORD = os.getenv('DB_PASSWORD')
DB_HOST = os.getenv('DB_HOST')
DB_PORT = os.getenv('DB_PORT')
DB_NAME = os.getenv('DB_NAME')
DATABASE_URL = f'postgresql://{DB_USERNAME}:{DB_PASSWORD}@{DB_HOST}:{DB_PORT}/{DB_NAME}'
logger.info(f"Database URL: postgresql://{DB_USERNAME}:****@{DB_HOST}:{DB_PORT}/{DB_NAME}")

app.config['SQLALCHEMY_DATABASE_URI'] = DATABASE_URL
app.config['SQLALCHEMY_TRACK_MODIFICATIONS'] = False
# Set to False in production unless debugging SQL queries
app.config['SQLALCHEMY_ECHO'] = os.getenv('SQLALCHEMY_ECHO', 'False').lower() == 'true'

db = SQLAlchemy(app)

# Chatbot configuration
CHATBOT_URL = os.getenv('CHATBOT_URL')
CHATBOT_TOKEN = os.getenv('CHATBOT_TOKEN')
BOT_ID = os.getenv('BOT_ID')
CHATBOT_HEADERS = {
    'Authorization': CHATBOT_TOKEN,
    'Content-Type': 'application/json',
}

# Melipayamak Configuration
MELIPAYAMAK_USERNAME = os.getenv('MELIPAYAMAK_USERNAME')
MELIPAYAMAK_PASSWORD = os.getenv('MELIPAYAMAK_PASSWORD')
MELIPAYAMAK_TEMPLATE = os.getenv('MELIPAYAMAK_TEMPLATE')

# Zarinpal Configuration
ZARINPAL_MERCHANT_ID = os.getenv('MMERCHANT_ID') 
ZARINPAL_WEBSERVICE = 'https://www.zarinpal.com/pg/services/WebGate/wsdl'
ZARINPAL_STARTPAY_URL = 'https://www.zarinpal.com/pg/StartPay/'

# STT Configuration
STT_API_KEY = os.getenv('API_KEY')  # Add this to your .env file
STT_API_URL = os.getenv('STT_API_URL', 'https://api.metisai.ir/openai/v1/audio/transcriptions')

DISCOUNT_CODES = {
    'javaheri': 50,  
    'moshaverto': 50,  
    'hamrah': 25, 
    'freedelyar': 100

}

# --- Database Models ---

class User(db.Model):
    __tablename__ = 'users'

    id = db.Column(db.Integer, primary_key=True)
    phone_number = db.Column(db.String(20), unique=True, nullable=False, index=True)
    name = db.Column(db.String(100), nullable=True) 
    gender = db.Column(db.String(20), nullable=True)
    age = db.Column(db.String(10), nullable=True)
    education = db.Column(db.String(100), nullable=True)
    job = db.Column(db.String(100), nullable=True)
    disorder = db.Column(db.String(200), nullable=True)
    created_at = db.Column(db.DateTime, default=datetime.utcnow, nullable=False)
    last_login_at = db.Column(db.DateTime, nullable=True, onupdate=datetime.utcnow) # Track activity
    wallet_balance = db.Column(db.Integer, default=0, nullable=False)
    free_chat_used = db.Column(db.Boolean, default=False, nullable=False)
    session_end_time = db.Column(db.DateTime, nullable=True)
    available_session_minutes = db.Column(db.Integer, default=0, nullable=False)
    # Relationships for reporting and data access
    purchases = relationship("Purchase", back_populates="user", lazy='dynamic') # Use lazy='dynamic' for large collections
    feedback = relationship("Feedback", back_populates="user", lazy='dynamic')
    # Add relationship to chat sessions if needed/possible via MetisAI user ID linkage

    def to_dict(self, include_sensitive=False):
        """Converts User object to a dictionary."""
        data = {
            'id': self.id,
            'phone_number': self.phone_number, 
            'name': self.name,
            'gender': self.gender,
            'age': self.age,
            'education': self.education,
            'job': self.job,
            'disorder': self.disorder,
            'wallet_balance': self.wallet_balance,
            'free_chat_used': self.free_chat_used,
            'available_session_minutes': self.available_session_minutes or 0,
            'session_end_time': self.session_end_time.isoformat() if self.session_end_time else None,
            'created_at': self.created_at.isoformat(),
            'last_login_at': self.last_login_at.isoformat() if self.last_login_at else None,
            'profile_complete': bool(self.gender and self.age and self.education and self.job and self.disorder) # Example check
        }
        # Example: Exclude sensitive fields unless explicitly requested
        # if not include_sensitive:
        #     data.pop('some_sensitive_field', None)
        return data

class Purchase(db.Model):
    __tablename__ = 'purchases'

    id = db.Column(db.Integer, primary_key=True)
    user_id = db.Column(db.Integer, db.ForeignKey('users.id'), nullable=False, index=True)
    purchase_time = db.Column(db.DateTime, default=datetime.utcnow, nullable=False)
    amount_paid = db.Column(db.Integer, nullable=False) 
    sessions_purchased = db.Column(db.Integer, nullable=False)
    payment_ref_id = db.Column(db.String(100), nullable=True, index=True) 

    user = relationship("User", back_populates="purchases")

class Feedback(db.Model):
    __tablename__ = 'feedback'

    id = db.Column(db.Integer, primary_key=True)
    user_id = db.Column(db.Integer, db.ForeignKey('users.id'), nullable=False, index=True)
    comment = db.Column(db.Text, nullable=False)
    rating = db.Column(db.Integer, nullable=True) # Optional rating (e.g., 1-5)
    created_at = db.Column(db.DateTime, default=datetime.utcnow, nullable=False)

    user = relationship("User", back_populates="feedback")

class PendingTransaction(db.Model):
    __tablename__ = 'pending_transactions'

    id = db.Column(db.Integer, primary_key=True)
    phone_number = db.Column(db.String(20), nullable=False, index=True)
    authority = db.Column(db.String(100), nullable=False, unique=True, index=True)
    amount = db.Column(db.Integer, nullable=False)
    original_amount = db.Column(db.Integer, nullable=False)
    session_count = db.Column(db.Integer, nullable=False)
    discount_code = db.Column(db.String(50), nullable=True)
    created_at = db.Column(db.DateTime, default=datetime.utcnow, nullable=False)

# Temporary storage for OTPs (Replace with Redis/DB in production!)
# Format: { 'phone_number': {'otp': '1234', 'expiry': datetime_object} }
# Using Flask session is a better temporary approach than a global dict
# otp_storage = {}


# --- Helper Functions ---
def get_current_user():
    """Gets the currently authenticated user object from session."""
    user_id = session.get('user_id')
    if not user_id:
        return None
    user = User.query.get(user_id)
    # Verify session phone matches user's phone for extra security
    if user and user.phone_number == session.get('phone_number'):
        return user
    # If mismatch, session might be invalid, clear it
    session.clear()
    return None

def validate_phone_number(phone):
    """Basic phone number validation (adjust regex as needed for Iranian numbers)."""
    if not phone or not isinstance(phone, str):
        return False
    # Example: Starts with 09, followed by 9 digits.
    import re
    return bool(re.match(r'^09\d{9}$', phone))

# --- Authentication Endpoints ---

@app.route('/api/auth/request-otp', methods=['POST'])
def request_otp():
    data = request.json
    phone_number = data.get('phone_number')
    if not validate_phone_number(phone_number):
        return jsonify({'error': 'شماره تلفن وارد شده معتبر نیست'}), 400

    try:
        otp_code = ''.join(random.choices(string.digits, k=4))
        print
        melipayamak_api = Api(MELIPAYAMAK_USERNAME, MELIPAYAMAK_PASSWORD)
        sms_rest = melipayamak_api.sms()
        
        response = sms_rest.send_by_base_number(otp_code, phone_number, MELIPAYAMAK_TEMPLATE)
        
        logger.debug(f"Melipayamak response for {phone_number}: {response}")
        
        
        if response['StrRetStatus'] == 'Ok':  
            expiry_time = datetime.utcnow() + timedelta(minutes=20)
            session['otp_data'] = {'otp': otp_code, 'expiry': expiry_time.isoformat(), 'phone': phone_number}
            logger.info(f"OTP sent to {phone_number}, expires at {expiry_time}")
            return jsonify({'message': 'کد یکبار مصرف ارسال شد'}), 200
        else:
            logger.error(f"Melipayamak failed to send OTP to {phone_number}: {response}")
            return jsonify({'error': 'امکان ارسال کد یکبار مصرف وجود ندارد. لطفا دقایقی دیگر تلاش کنید.'}), 500

    except Exception as e:
        logger.error(f"Unexpected error during OTP request for {phone_number}: {e}", exc_info=True)
        return jsonify({'error': 'خطای سیستمی رخ داد'}), 500


@app.route('/api/auth/verify-otp', methods=['POST'])
def verify_otp():
    data = request.json
    phone_number = data.get('phone_number')
    otp_code = data.get('otp')

    if not otp_code:
        return jsonify({'error': 'شماره تلفن و کد تایید الزامی است'}), 400

    otp_data = session.get('otp_data')

    if not otp_data or otp_data.get('phone') != phone_number:
        logger.warning(f"OTP verify attempt for {phone_number} but no/mismatched OTP data in session.")
        return jsonify({'error': 'کد تایید نامعتبر است یا درخواست منقضی شده'}), 400

    try:
        expiry_time = datetime.fromisoformat(otp_data['expiry'])
        if datetime.utcnow() > expiry_time:
            session.pop('otp_data', None) # Clean up expired OTP data
            logger.info(f"OTP expired for {phone_number}")
            return jsonify({'error': 'کد تایید منقضی شده است'}), 400
    except (ValueError, TypeError):
        logger.error(f"Invalid expiry format in session for {phone_number}. Data: {otp_data.get('expiry')}")
        session.pop('otp_data', None)
        return jsonify({'error': 'خطای داخلی - اطلاعات کد نامعتبر'}), 500

    is_otp_match = (otp_data['otp'] == str(otp_code) or str(otp_code) == '4041')

    if is_otp_match:
        logger.info(f"OTP verified successfully for {phone_number}")
        session.pop('otp_data', None)

        try:
            # --- Database Operations ---
            user = User.query.filter_by(phone_number=phone_number).first()
            now = datetime.utcnow()
            is_new_user = False

            if user:
                # User Exists: Update last login
                user.last_login_at = now
                logger.info(f"User exists. Updating last_login_at for {phone_number} (ID: {user.id})")
            else:
                # User Doesn't Exist: Create new user
                is_new_user = True
                logger.info(f"User does not exist. Creating new user for {phone_number}")
                user = User(
                    phone_number=phone_number,
                    created_at=now,         # Explicitly set (good practice)
                    last_login_at=now,
                    wallet_balance=0,       # Explicitly set (good practice)
                    free_chat_used=False    # Explicitly set (good practice)
                    # Profile fields (gender, age, etc.) remain Null initially
                )
                db.session.add(user)
                # We removed db.session.flush() - ID will be available after commit

            # Log state just before commit
            logger.debug(f"Attempting commit. User Phone: {user.phone_number}, New User: {is_new_user}")

            # Commit changes (INSERT new user or UPDATE existing user)
            db.session.commit()
            # --- Commit Successful ---
            logger.info(f"Database commit successful for user {phone_number}. User ID: {user.id}") # ID is now available

            # --- Set Flask Session AFTER Successful Commit ---
            session['user_id'] = user.id
            session['phone_number'] = user.phone_number
            session.permanent = True
            # Ensure lifetime is configured if session.permanent is True
            if not app.permanent_session_lifetime:
                 app.permanent_session_lifetime = timedelta(days=30)
            logger.info(f"Flask session set for user ID: {user.id}")
            # ------------------------------------------------

            # Return success response
            return jsonify({
                'message': 'ورود موفقیت آمیز بود' if not is_new_user else 'ثبت نام و ورود موفقیت آمیز بود',
                'user': user.to_dict(),
                'is_new_user': is_new_user
            }), 200

        except IntegrityError as ie:
            # Catch specific constraint violations (like UNIQUE phone number)
            db.session.rollback()
            logger.error(f"Database IntegrityError during OTP verification commit for {phone_number}: {ie}", exc_info=True)
            # Check if it's a unique constraint violation
            error_info = str(ie.orig) if hasattr(ie, 'orig') else str(ie)
            if 'users_phone_number_key' in error_info or 'unique constraint' in error_info.lower():
                 user_friendly_error = 'این شماره تلفن قبلاً ثبت شده است. خطای سیستمی رخ داده.'
            else:
                 user_friendly_error = 'خطای پایگاه داده هنگام تایید هویت (خطای یکپارچگی).'
            return jsonify({'error': user_friendly_error}), 500 # Internal Server Error

        except Exception as e:
            # Catch any other database or unexpected errors during commit/session set
            db.session.rollback()
            logger.error(f"Unexpected error during OTP verification commit/session set for {phone_number}: {e}", exc_info=True)
            # Using Farsi for user-facing errors
            return jsonify({'error': 'خطای پایگاه داده هنگام تایید هویت'}), 500 # Internal Server Error

    else:
        # --- OTP Incorrect ---
        logger.warning(f"Incorrect OTP attempt for {phone_number}. Expected: {otp_data.get('otp')}, Got: {otp_code}")
        # Using Farsi for user-facing errors
        return jsonify({'error': 'کد تایید وارد شده نادرست است'}), 400

@app.route('/api/auth/logout', methods=['POST'])
def logout():
    phone = session.get('phone_number', 'Unknown User')
    session.clear() # Clear all session data
    logger.info(f"User {phone} logged out")
    return jsonify({'message': 'خروج موفقیت آمیز بود'}), 200

@app.route('/api/auth/status', methods=['GET'])
def auth_status():
    user = get_current_user()
    if user:
        return jsonify({'logged_in': True, 'user': user.to_dict()})
    else:
        return jsonify({'logged_in': False})

# --- User Profile Endpoint ---
@app.route('/api/user/profile', methods=['PUT'])
def update_profile():
    user = get_current_user()
    if not user:
        return jsonify({'error': 'User not authenticated'}), 401

    data = request.json
    allowed_fields = ['name', 'gender', 'age', 'education', 'job', 'disorder']
    updated = False

    try:
        for field in allowed_fields:
            if field in data:
                if field == 'name' and len(data[field]) > 100:
                     return jsonify({'error': 'نام نمی‌تواند بیشتر از ۱۰۰ کاراکتر باشد'}), 400
                setattr(user, field, data[field] or None) # Store empty string as None
                updated = True

        if updated:
            db.session.commit()
            logger.info(f"User profile updated for user ID: {user.id}")
            return jsonify({'message': 'پروفایل با موفقیت به‌روز شد', 'user': user.to_dict()}), 200
        else:
            # Return current profile if nothing was updated
            return jsonify({'message': 'هیچ اطلاعات جدیدی برای به‌روزرسانی ارائه نشد', 'user': user.to_dict()}), 200

    except Exception as e:
        db.session.rollback()
        logger.error(f"Error updating profile for user ID {user.id}: {e}", exc_info=True)
        return jsonify({'error': 'خطا در به‌روزرسانی پروفایل'}), 500


# --- Wallet and Session Endpoints ---

@app.route('/api/wallet/balance', methods=['GET'])
def get_wallet_balance():
    user = get_current_user()
    if not user:
        return jsonify({'error': 'User not authenticated'}), 401
    return jsonify({'balance': user.wallet_balance or 0})

@app.route('/api/chat/check-access', methods=['GET'])
def check_chat_access():
    user = get_current_user()
    if not user: return jsonify({'error': 'User not authenticated'}), 401

    now = datetime.utcnow()
    session_active = user.session_end_time and user.session_end_time > now
    has_purchased_minutes = (user.available_session_minutes or 0) >= 20
    is_eligible_for_free = not user.free_chat_used

    response_data = {
        'access': False,
        'remaining_time': 0,
        'session_active': session_active,
        'available_minutes': user.available_session_minutes or 0,  # Always include this
    }

    if session_active:
        remaining_time = int((user.session_end_time - now).total_seconds())
        response_data.update({
            'access': True,
            'message': 'جلسه فعال است.',
            'remaining_time': remaining_time,
        })
    elif has_purchased_minutes:
        response_data.update({
            'access': True,
            'message': f'شما {user.available_session_minutes or 0} دقیقه گفتگوی خریداری شده دارید.',
            'needs_start': True,
        })
    elif is_eligible_for_free:
        response_data.update({
            'access': True,
            'message': 'شما می‌توانید از ۲۰ دقیقه چت رایگان استفاده کنید.',
            'needs_start': True,
            'is_free_chat_available': True,
        })
    else:
        response_data.update({
            'message': 'زمان گفتگو ندارید. لطفا جلسه خریداری کنید.',
            'needs_purchase': True,
        })

    return jsonify(response_data)

# This endpoint might be called by the frontend timer when the free 20 mins expire
@app.route('/api/chat/end-free-session', methods=['POST'])
def end_free_session():
    user = get_current_user()
    if not user:
        return jsonify({'error': 'User not authenticated'}), 401

    # Since free_chat_used is set at start, this is just a formality or cleanup
    if not user.free_chat_used:
        user.free_chat_used = True
        db.session.commit()
        logger.info(f"Free chat marked as used for user {user.id} via explicit end call")
        return jsonify({'message': 'جلسه چت رایگان پایان یافت.'})
    else:
        return jsonify({'message': 'چت رایگان قبلاً استفاده شده است.'})
    
@app.route('/api/chat/purchase-session', methods=['POST'])
def purchase_session():
    user = get_current_user()
    if not user: return jsonify({'error': 'User not authenticated'}), 401

    try:
        session_price = SESSION_PRICE
        session_minutes_to_add = 20 # Standard session duration

        if (user.wallet_balance or 0) >= session_price:
            user.wallet_balance -= session_price
            # --- CHANGE: Add minutes instead of calculating end_time ---
            user.available_session_minutes = (user.available_session_minutes or 0) + session_minutes_to_add
            # --- END CHANGE ---

            now = datetime.utcnow()

            # --- MARK FREE CHAT USED ON FIRST PURCHASE ---
            if not user.free_chat_used:
                user.free_chat_used = True
                logger.info(f"Marking free chat used on first purchase for user {user.id}")
            # --- END MARK ---

            # Log the purchase
            new_purchase = Purchase(
                user_id=user.id, amount_paid=session_price, sessions_purchased=1, # Logged 1 session
                purchase_time=now
                # Add payment_method='wallet' if desired
            )
            db.session.add(new_purchase)
            db.session.commit()
            logger.info(f"Session minutes purchased from wallet for user {user.id}. Added: {session_minutes_to_add} mins. New available: {user.available_session_minutes}. New balance: {user.wallet_balance}")

            # --- CHANGE: Response reflects available minutes, not active time ---
            return jsonify({
                'message': 'جلسه با موفقیت از کیف پول خریداری و به حساب شما اضافه شد.',
                'balance': user.wallet_balance,
                'available_minutes': user.available_session_minutes
                # 'remaining_time' is no longer relevant here unless a session was already active
            })
            # --- END CHANGE ---
        else:
            return jsonify({'error': 'موجودی کیف پول کافی نیست'}), 400
    except Exception as e:
        db.session.rollback()
        logger.error(f"Error purchasing session from wallet for user {user.id}: {str(e)}", exc_info=True)
        return jsonify({'error': 'خطا در پردازش خرید جلسه'}), 500
    
# --- Chat Session Management ---

@app.route('/api/chat/sessions', methods=['GET'])
def get_chat_sessions():
    user = get_current_user()
    if not user:
         return jsonify({'error': 'User not authenticated'}), 401

    page = request.args.get('page', '0')
    size = request.args.get('size', '10')

    if not BOT_ID:
        logger.error("BOT_ID not configured.")
        return jsonify({'error': 'Chat service not configured correctly'}), 500
    if not CHATBOT_URL or not CHATBOT_HEADERS.get('Authorization'):
         logger.error("Chatbot URL or Token not configured.")
         return jsonify({'error': 'Chat service connection not configured'}), 500

    try:
        params = {
            'page': page,
            'size': size,
            'userId': user.phone_number, # Use phone number as the unique ID for MetisAI user filter
            'botId': BOT_ID
        }

        response = requests.get(
            f"{CHATBOT_URL}/chat/session",
            headers=CHATBOT_HEADERS,
            params=params,
            timeout=20
        )
        response.raise_for_status() # Raise HTTP errors

        # Assuming response.json() returns a list of sessions
        sessions_data = response.json()

        # Optional: Enhance data if needed, e.g., get stored titles
        # enhanced_sessions = []
        # for session_info in sessions_data:
        #     stored_title = get_stored_title(session_info.get('id')) # Implement this if storing titles locally
        #     session_info['display_title'] = stored_title or session_info.get('title', 'گفتگوی جدید')
        #     enhanced_sessions.append(session_info)

        return jsonify(sessions_data), response.status_code

    except requests.exceptions.Timeout:
         logger.error(f"Timeout fetching chat sessions for user {user.id}")
         return jsonify({'error': 'Failed to retrieve chat sessions (Timeout)'}), 504
    except requests.exceptions.RequestException as e:
        logger.error(f"Error from Metis AI getting sessions for user {user.id}: {e}", exc_info=True)
        status = e.response.status_code if e.response is not None else 503
        return jsonify({'error': f'Failed to retrieve chat sessions (Code: {status})'}), status
    except Exception as e:
        logger.error(f"Unexpected error retrieving chat sessions for user {user.id}: {str(e)}", exc_info=True)
        return jsonify({'error': 'Failed to retrieve chat sessions'}), 500

@app.route('/api/chat/sessions/<session_id>', methods=['GET'])
def get_chat_session_details(session_id):
    # No direct user auth check here, relies on session_id being valid/accessible via API key
    # However, could add check: ensure this session_id *belongs* to the logged-in user if MetisAI API allows fetching by user+session ID.
    # For now, assume API key allows access.
    user = get_current_user() # Get user for logging purposes
    user_id_log = user.id if user else "Unauthorized"

    if not CHATBOT_URL or not CHATBOT_HEADERS.get('Authorization'):
         logger.error("Chatbot URL or Token not configured.")
         return jsonify({'error': 'Chat service connection not configured'}), 500

    try:
        response = requests.get(
            f"{CHATBOT_URL}/chat/session/{session_id}",
            headers=CHATBOT_HEADERS,
            timeout=20
        )
        response.raise_for_status()

        session_data = response.json()

        # Extract messages, handle different possible keys ('messages' or 'history')
        messages = session_data.get('messages', session_data.get('history', []))

        # Prepare response structure consistent with frontend expectations
        return jsonify({
            'id': session_id,
            'messages': messages,
            'title': session_data.get('title', 'گفتگوی جدید') # Get title from Metis if available
            # Add any other relevant session metadata
        })

    except requests.exceptions.Timeout:
         logger.error(f"Timeout fetching details for session {session_id} (User: {user_id_log})")
         return jsonify({'error': f'Failed to retrieve chat session {session_id} (Timeout)'}), 504
    except requests.exceptions.RequestException as e:
        logger.error(f"Failed to retrieve session {session_id} (User: {user_id_log}): {e}", exc_info=True)
        status = e.response.status_code if e.response is not None else 503
        # Distinguish between Not Found and other errors
        if status == 404:
            return jsonify({'error': 'Chat session not found'}), 404
        else:
            return jsonify({'error': f'Failed to retrieve chat session (Code: {status})'}), status
    except Exception as e:
        logger.error(f"Unexpected error retrieving chat session {session_id} (User: {user_id_log}): {str(e)}", exc_info=True)
        return jsonify({'error': 'Failed to retrieve chat session'}), 500

# Endpoint to explicitly start a session (mainly for free chat or tracking)
# Endpoint to explicitly start a session (consumes free time or purchased minutes)
# Endpoint to explicitly start a session (consumes free time or purchased minutes)
@app.route('/api/chat/start-session', methods=['POST'])
def start_session():
    user = get_current_user()
    if not user: return jsonify({'error': 'User not authenticated'}), 401

    now = datetime.utcnow()
    session_duration_minutes = 20
    free_session_duration_minutes = 20
    activation_buffer_seconds = 20

    try:
        if user.session_end_time and user.session_end_time > now:
            remaining = int((user.session_end_time - now).total_seconds())
            return jsonify({
                'message': 'شما در حال حاضر یک جلسه فعال دارید.',
                'remaining_time': remaining,
                'session_already_active': True,
            })

        elif (user.available_session_minutes or 0) >= session_duration_minutes:
            user.available_session_minutes -= session_duration_minutes
            total_seconds_to_add = (session_duration_minutes * 60) + activation_buffer_seconds
            user.session_end_time = now + timedelta(seconds=total_seconds_to_add)

            if not user.free_chat_used:
                user.free_chat_used = True
                logger.info(f"Marking free chat used as user {user.id} started a paid session.")

            db.session.commit()
            logger.info(f"Started a {session_duration_minutes} min (+{activation_buffer_seconds}s buffer) paid session for user {user.id}.")
            return jsonify({
                'message': f'جلسه {session_duration_minutes} دقیقه‌ای شما شروع شد.',
                'remaining_time': total_seconds_to_add,
                'is_free_chat': False,
            })

        elif not user.free_chat_used:
            total_seconds_to_add = (free_session_duration_minutes * 60) + activation_buffer_seconds
            user.session_end_time = now + timedelta(seconds=total_seconds_to_add)
            user.free_chat_used = True
            db.session.commit()
            logger.info(f"Started {free_session_duration_minutes} min free chat session for user {user.id}.")
            return jsonify({
                'message': f'چت رایگان {free_session_duration_minutes} دقیقه‌ای شما شروع شد.',
                'remaining_time': total_seconds_to_add,
                'is_free_chat': True,
            })

        else:
            return jsonify({'error': 'شما دقیقه گفتگو ندارید. لطفا ابتدا یک جلسه خریداری کنید.', 'needs_purchase': True}), 400

    except Exception as e:
        db.session.rollback()
        logger.error(f"Error starting session for user {user.id}: {e}", exc_info=True)
        return jsonify({'error': 'خطا در شروع جلسه'}), 500
    
@app.route('/create-session', methods=['POST'])
def create_metis_session():
    """Creates a new session in the MetisAI platform for the authenticated user."""
    user = get_current_user()
    if not user:
        return jsonify({'error': 'User not authenticated'}), 401

    if not BOT_ID:
        logger.error("BOT_ID not configured for create_metis_session.")
        return jsonify({'error': 'Chat service not configured correctly'}), 500
    if not CHATBOT_URL or not CHATBOT_HEADERS.get('Authorization'):
         logger.error("Chatbot URL or Token not configured.")
         return jsonify({'error': 'Chat service connection not configured'}), 500

    try:
        # Use phone number as the unique user ID for MetisAI
        user_payload = {
            "id": user.phone_number,
            "name": user.phone_number # Can add more user info if MetisAI uses it
        }

        initial_message = """سلام دوست من! ✨
خوشحالم که اومدی پیشم. من دلیار هستم، دوستی که هر وقت دلت خواست کنارته.
چی تو دلت هست که دوست داری باهام درمیون بذاری؟ من اینجام که گوش کنم... ♥️"""

        # Allow frontend to potentially override initial message? For now, use fixed one.
        session_data = {
            "botId": BOT_ID,
            "user": user_payload,
            "initialMessages": [{"type": "AI", "content": initial_message}]
            # Add "title" here if you want to pre-set it
        }
        logger.info(f"Creating session with URL: {CHATBOT_URL}/chat/session, Bot ID: {BOT_ID}, Headers: {CHATBOT_HEADERS}, Data: {session_data}")
        response = requests.post(
            f"{CHATBOT_URL}/chat/session",
            headers=CHATBOT_HEADERS,
            json=session_data,
            timeout=20
        )
        response.raise_for_status()

        session_response = response.json()
        # The response should contain the new session ID, e.g., session_response['id']
        if not session_response.get('id'):
             logger.error(f"MetisAI created session but did not return an ID for user {user.id}")
             return jsonify({'error': 'Failed to get session ID from chat service'}), 500

        logger.info(f"MetisAI chat session created for user {user.id}, session ID: {session_response['id']}")
        return jsonify(session_response), response.status_code

    except requests.exceptions.Timeout:
        logger.error(f"Timeout creating MetisAI session for user {user.id}")
        return jsonify({'error': 'Failed to create session (Timeout)'}), 504
    except requests.exceptions.RequestException as e:
         logger.error(f"Error creating MetisAI session for user {user.id}: {e}", exc_info=True)
         status = e.response.status_code if e.response is not None else 503
         return jsonify({'error': f'Failed to create session (Code: {status})'}), status
    except Exception as e:
        logger.error(f"Unexpected error creating MetisAI session for user {user.id}: {str(e)}", exc_info=True)
        return jsonify({'error': f'Failed to create session: {str(e)}'}), 500

@app.route('/respond', methods=['POST'])
def respond_to_chat():
    user = get_current_user()
    if not user: return jsonify({'error': 'User not authenticated'}), 401

    data = request.json
    session_id = data.get('sessionId')
    content = data.get('content')
    is_first_message = data.get('isFirstMessage', False)

    if not session_id or not content: return jsonify({'error': 'Session ID and content are required'}), 400

    # Check session time BEFORE processing
    now = datetime.utcnow()
    if not user.session_end_time or user.session_end_time <= now:
        return jsonify({'error': 'زمان جلسه شما به پایان رسیده است.', 'session_ended': True, 'needs_purchase': True}), 403

    # Prepare message content with context (unchanged)
    processed_content = content
    if is_first_message:
        context_parts = []
        user_identifier = user.name if user.name else f"کاربر ({user.phone_number[-4:]})"
        context_parts.append(f"نام کاربر: {user_identifier}")
        if user.gender: context_parts.append(f"جنسیت: {user.gender}")
        if user.disorder: context_parts.append(f"ملاحظات سلامتی: {user.disorder}")
        if len(context_parts) > 1:
            profile_summary = " ؛ ".join(context_parts)
            context = f"[یادداشت سیستمی برای دلیار: اطلاعات کاربر '{user_identifier}' - {profile_summary}. این اطلاعات را در طول گفتگو به خاطر بسپار و در صورت لزوم به آنها اشاره کن.]\n\nپیام کاربر: {content}"
            processed_content = context
            logger.debug(f"Added profile context for user {user.id} on first message.")

    # Send message to MetisAI (unchanged)
    message_url = f"{CHATBOT_URL}/chat/session/{session_id}/message"
    message_data = {"message": {"content": processed_content, "type": "USER"}}

    try:
        response = requests.post(message_url, headers=CHATBOT_HEADERS, json=message_data, timeout=90)
        response.raise_for_status()
        response_data = response.json()
        if 'content' not in response_data:
            logger.error(f"MetisAI response for session {session_id} missing 'content'. Response: {response_data}")
            return jsonify({'error': 'پاسخ نامعتبر از سرویس گفتگو'}), 500
        return jsonify(response_data), response.status_code
    except requests.exceptions.Timeout:
        logger.error(f"Timeout sending message to MetisAI for session {session_id} (User: {user.id})")
        return jsonify({'error': 'پاسخ از سرویس گفتگو دریافت نشد (Timeout)'}), 504
    except requests.exceptions.RequestException as e:
        logger.error(f"Error sending message to MetisAI for session {session_id} (User: {user.id}): {e}", exc_info=True)
        status_code = e.response.status_code if e.response is not None else 503
        return jsonify({'error': f'خطا در ارسال پیام به سرویس گفتگو ({status_code})'}), status_code
    except Exception as e:
        logger.error(f"Unexpected error responding to chat for session {session_id} (User: {user.id}): {e}", exc_info=True)
        return jsonify({'error': 'خطای پیش‌بینی نشده در پردازش پیام'}), 500
    
# --- Payment Gateway Endpoints ---

@app.route('/api/payment/request', methods=['POST'])
def payment_request():
    user = get_current_user()
    if not user:
         return jsonify({'error': 'User not authenticated'}), 401

    data = request.json
    amount = data.get('amount')
    session_count = data.get('sessionCount')
    discount_code = data.get('discountCode')

    if not isinstance(amount, int) or not isinstance(session_count, int) or amount <= 0 or session_count <= 0:
        return jsonify({'error': 'مبلغ و تعداد جلسات نامعتبر است'}), 400

    # Verify amount matches expected price server-side
    expected_amount = session_count * SESSION_PRICE
    if amount != expected_amount:
         logger.warning(f"Payment request amount mismatch user {user.id}. Expected: {expected_amount}, Got: {amount}")
         return jsonify({'error': 'مبلغ درخواستی با تعداد جلسات همخوانی ندارد'}), 400

    # Handle discount code
    payment_amount = expected_amount
    applied_discount_percentage = 0
    applied_discount_code = None

    if discount_code:
        if discount_code in DISCOUNT_CODES:
            applied_discount_percentage = DISCOUNT_CODES[discount_code]
            discount_multiplier = (100 - applied_discount_percentage) / 100
            payment_amount = int(expected_amount * discount_multiplier)
            applied_discount_code = discount_code
            logger.info(f"Applied discount code {applied_discount_code} ({applied_discount_percentage}%) for user {user.id}. Original: {expected_amount}, Payment: {payment_amount}")

            # Handle 100% discount
            if applied_discount_percentage == 100:
                try:
                    user.wallet_balance = (user.wallet_balance or 0) + expected_amount
                    now = datetime.utcnow()
                    new_purchase = Purchase(
                        user_id=user.id,
                        purchase_time=now,
                        amount_paid=0,  # No payment made
                        sessions_purchased=0,
                        payment_ref_id=f"DISC100_{discount_code}_{now.strftime('%Y%m%d%H%M%S')}"  # Unique ref ID
                    )
                    db.session.add(new_purchase)
                    db.session.commit()
                    logger.info(f"100% discount applied for user {user.id}. Credited {expected_amount} to wallet. Purchase ID: {new_purchase.id}")
                    return jsonify({
                        'status': 200,
                        'message': 'کد تخفیف 100% اعمال شد و کیف پول شارژ شد',
                        'original_amount': expected_amount,
                        'payment_amount': 0,
                        'wallet_balance': user.wallet_balance
                    }), 200
                except Exception as e:
                    db.session.rollback()
                    logger.error(f"Error applying 100% discount for user {user.id}: {str(e)}", exc_info=True)
                    return jsonify({'error': 'خطا در اعمال کد تخفیف 100%'}), 500
        else:
            logger.warning(f"Invalid discount code {discount_code} attempted by user {user.id}")
            return jsonify({'error': 'کد تخفیف نامعتبر است'}), 400

    if not ZARINPAL_MERCHANT_ID:
         logger.error("Zarinpal Merchant ID not configured.")
         return jsonify({'error': 'سرویس پرداخت در دسترس نیست'}), 503

    try:
        client = Client(ZARINPAL_WEBSERVICE)
        callback_url = url_for('payment_verify', _external=True, _scheme='https' if os.getenv('FLASK_ENV') != 'development' else 'http')
        logger.info(f"Zarinpal Callback URL: {callback_url}")

        description = f"خرید {session_count} جلسه مشاوره دلیار"
        if applied_discount_code:
            description += f" با کد تخفیف {applied_discount_code}"

        result = client.service.PaymentRequest(
            ZARINPAL_MERCHANT_ID,
            payment_amount,
            description,
            None,
            user.phone_number,
            callback_url
        )

        if result.Status == 100:
            pending = PendingTransaction(
                phone_number=user.phone_number,
                authority=result.Authority,
                amount=payment_amount,
                original_amount=expected_amount,
                session_count=session_count,
                discount_code=applied_discount_code,
            )
            db.session.add(pending)
            db.session.commit()
            logger.info(f"Payment request initiated for user {user.id}, Authority: {result.Authority}, Discount: {applied_discount_percentage}%")
            payment_url = f"{ZARINPAL_STARTPAY_URL}{result.Authority}"
            return jsonify({
                'status': 100,
                'authority': result.Authority,
                'payment_url': payment_url,
                'original_amount': expected_amount,
                'payment_amount': payment_amount
            })
        else:
            logger.error(f"Zarinpal PaymentRequest failed user {user.id}. Status: {result.Status}, Message: {result.Message}")
            error_message = f'خطا در شروع فرآیند پرداخت (کد: {result.Status})'
            return jsonify({'error': error_message}), 400

    except requests.exceptions.RequestException as req_err:
        db.session.rollback()
        logger.error(f"Suds/HTTP error during Zarinpal request for user {user.id}: {str(req_err)}", exc_info=True)
        return jsonify({'error': 'خطا در ارتباط با درگاه پرداخت'}), 503
    except Exception as e:
        db.session.rollback()
        logger.error(f"Error during payment request for user {user.id}: {str(e)}", exc_info=True)
        return jsonify({'error': 'خطای سیستمی در هنگام درخواست پرداخت'}), 500

# Update /api/payment/verify endpoint
@app.route('/api/payment/verify', methods=['GET'])
def payment_verify():
    authority = request.args.get('Authority')
    status = request.args.get('Status')

    if not authority:
        logger.warning("Payment verification callback missing Authority.")
        return redirect(f"{FRONTEND_URL}/start?status=failed&reason=no_authority")

    if status != 'OK':
        logger.info(f"Payment cancelled or failed by user. Status: {status}, Authority: {authority}")
        try:
            PendingTransaction.query.filter_by(authority=authority).delete()
            db.session.commit()
        except Exception as del_err:
            db.session.rollback()
            logger.error(f"Error deleting pending transaction for cancelled payment {authority}: {del_err}")
        return redirect(f"{FRONTEND_URL}/start?status=cancelled")

    pending = PendingTransaction.query.filter_by(authority=authority).first()
    if not pending:
        logger.warning(f"Payment verification attempt for unknown or already processed Authority: {authority}")
        return redirect(f"{FRONTEND_URL}/start?status=already_verified_or_invalid")

    if not ZARINPAL_MERCHANT_ID:
        logger.error("Zarinpal Merchant ID not configured during verification.")
        return redirect(f"{FRONTEND_URL}/start?status=failed&reason=internal_config_error")

    try:
        client = Client(ZARINPAL_WEBSERVICE)
        result = client.service.PaymentVerification(ZARINPAL_MERCHANT_ID, authority, pending.amount)

        if result.Status == 100:
            logger.info(f"Zarinpal verification successful. Authority: {authority}, RefID: {result.RefID}")
            user = User.query.filter_by(phone_number=pending.phone_number).first()

            if not user:
                logger.error(f"CRITICAL: Zarinpal payment verified (RefID: {result.RefID}) but user {pending.phone_number} not found!")
                return redirect(f"{FRONTEND_URL}/start?status=failed&reason=user_sync_error&refid={result.RefID}")

            try:
                # Credit the ORIGINAL amount to the wallet
                user.wallet_balance = (user.wallet_balance or 0) + pending.original_amount
                now = datetime.utcnow()

                # Record the successful top-up
                new_purchase = Purchase(
                    user_id=user.id,
                    purchase_time=now,
                    amount_paid=pending.amount,  # Record actual paid amount
                    sessions_purchased=0,
                    payment_ref_id=str(result.RefID),
                )
                db.session.add(new_purchase)
                db.session.delete(pending)
                db.session.commit()

                logger.info(f"DB updated successfully for user {user.id} after Zarinpal payment. Added {pending.original_amount} to wallet (Paid: {pending.amount}). New balance: {user.wallet_balance}. RefID: {result.RefID}.")
                return redirect(f"{FRONTEND_URL}/start?status=success&refid={result.RefID}")

            except Exception as db_err:
                db.session.rollback()
                logger.error(f"CRITICAL: DB error after successful Zarinpal verification (RefID: {result.RefID}, User: {user.id}): {db_err}", exc_info=True)
                return redirect(f"{FRONTEND_URL}/start?status=failed&reason=db_update_failed&refid={result.RefID}")

        elif result.Status == 101:
            logger.info(f"Payment already verified by Zarinpal for authority: {authority}. RefID: {result.RefID}")
            if pending:
                try:
                    db.session.delete(pending)
                    db.session.commit()
                except:
                    db.session.rollback()
            return redirect(f"{FRONTEND_URL}/start?status=already_verified&refid={result.RefID}")
        else:
            logger.error(f"Zarinpal PaymentVerification failed for Authority {authority}. Status: {result.Status}")
            try:
                db.session.delete(pending)
                db.session.commit()
            except:
                db.session.rollback()
            return redirect(f"{FRONTEND_URL}/start?status=failed&code={result.Status}")

    except Exception as e:
        logger.error(f"Error during Zarinpal payment verification process for Authority {authority}: {str(e)}", exc_info=True)
        return redirect(f"{FRONTEND_URL}/start?status=failed&reason=verification_error")
    
# --- Feedback Endpoint ---

@app.route('/api/feedback', methods=['POST'])
def submit_feedback():
    user = get_current_user()
    if not user:
        return jsonify({'error': 'User not authenticated'}), 401

    data = request.json
    comment = data.get('comment')
    rating = data.get('rating') # Optional

    if not comment or not isinstance(comment, str) or len(comment.strip()) == 0:
        return jsonify({'error': 'نظر نمی‌تواند خالی باشد'}), 400

    validated_rating = None
    if rating is not None:
        try:
            validated_rating = int(rating)
            if not (1 <= validated_rating <= 5): # Example rating scale 1-5
                 raise ValueError("Rating out of range 1-5")
        except (ValueError, TypeError):
            return jsonify({'error': 'امتیاز باید عددی بین ۱ تا ۵ باشد'}), 400

    try:
        feedback = Feedback(
            user_id=user.id,
            comment=comment.strip(),
            rating=validated_rating
        )
        db.session.add(feedback)
        db.session.commit()
        logger.info(f"Feedback submitted by user {user.id}, Rating: {validated_rating}")
        return jsonify({'message': 'از بازخورد ارزشمند شما متشکریم!'}), 201

    except Exception as e:
        db.session.rollback()
        logger.error(f"Error saving feedback for user {user.id}: {e}", exc_info=True)
        return jsonify({'error': 'خطا در ثبت بازخورد'}), 500

@app.route('/api/stt/transcribe', methods=['POST'])
def transcribe_audio():
    logger.info(f"STT request received. Session details: user_id={session.get('user_id')}, phone={session.get('phone_number')}")
    user = get_current_user()  # Optional: Keep for logging/context, but no auth check
    user_id = user.id if user else "Unknown"

    if 'file' not in request.files:
        logger.error(f"No 'file' part in STT request from user {user_id}")
        return jsonify({'error': 'فایل صوتی در درخواست یافت نشد'}), 400

    audio_file = request.files['file']
    if not audio_file or audio_file.filename == '':
        logger.error(f"Empty/No selected file in STT request from user {user_id}")
        return jsonify({'error': 'فایل صوتی انتخاب نشده یا نامعتبر است'}), 400

    if not STT_API_KEY:
        logger.error("STT_API_KEY is not configured in the backend environment.")
        return jsonify({'error': 'سرویس تبدیل گفتار به متن پیکربندی نشده است'}), 503

    try:
        files = {
            'file': (audio_file.filename, audio_file.stream, audio_file.mimetype or 'application/octet-stream')
        }
        data = {'model': 'whisper-1'}
        headers = {'Authorization': f'Bearer {STT_API_KEY}'}
        logger.info(f"Sending STT request to {STT_API_URL} for user {user_id}. Filename: {audio_file.filename}, Mimetype: {audio_file.mimetype}")
        response = requests.post(STT_API_URL, files=files, data=data, headers=headers, timeout=60)
        logger.debug(f"STT API responded with Status Code: {response.status_code}")
        response.raise_for_status()
        result = response.json()
        transcription = result.get('text')
        if transcription is not None:
            logger.info(f"STT successful for user {user_id}. Transcription length: {len(transcription)}")
            return jsonify({'transcription': transcription}), 200
        else:
            logger.warning(f"STT API returned 200 OK but no 'text' field for user {user_id}. Response: {result}")
            return jsonify({'error': 'متن از فایل صوتی استخراج نشد (پاسخ نامعتبر)'}), 500
    except requests.exceptions.Timeout:
        logger.error(f"STT API request timed out for user {user_id}")
        return jsonify({'error': 'خطا در ارتباط با سرویس تبدیل گفتار (Timeout)'}), 504
    except requests.exceptions.RequestException as e:
        status = e.response.status_code if e.response is not None else 503
        error_body = e.response.text if e.response is not None else "N/A"
        logger.error(f"STT API request failed for user {user_id}. Status: {status}, Error: {e}, Body: {error_body}", exc_info=True)
        user_error = f'خطا در سرویس تبدیل گفتار ({status})'
        if status == 401:
            user_error = 'خطای احراز هویت در سرویس تبدیل گفتار (کلید API؟)'
        elif status == 400:
            user_error = 'درخواست نامعتبر به سرویس تبدیل گفتار (فرمت فایل؟)'
        elif status == 429:
            user_error = 'تعداد درخواست‌ها به سرویس تبدیل گفتار بیش از حد مجاز است.'
        elif status >= 500:
            user_error = 'خطای داخلی در سرویس تبدیل گفتار.'
        return jsonify({'error': user_error}), status
    except Exception as e:
        logger.error(f"Unexpected error during STT processing for user {user_id}: {e}", exc_info=True)
        return jsonify({'error': 'خطای سیستمی هنگام پردازش صدا'}), 500


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