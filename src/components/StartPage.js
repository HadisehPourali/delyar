import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import AuthModal from './AuthModal';
import './StartPage.css';

const StartPage = () => {
  const navigate = useNavigate();
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [error, setError] = useState('');
  
  const handleChatClick = () => {
    const userData = localStorage.getItem('userData');
    if (userData) {
      navigate('/chat');
    } else {
      setIsModalOpen(true);
      setError('لطفا برای ادامه وارد شوید یا ثبت نام کنید');
    }
  };

  const handleLogin = async (userData) => {
    try {
      const response = await fetch('http://localhost:5000/api/login', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(userData),
      });
      
      const data = await response.json();
      
      if (response.ok) {
        localStorage.setItem('userData', JSON.stringify(data.user));
        setError('');
        navigate('/chat'); // Automatically redirect to chat after successful login
        return true;
      }
      setError(data.error || 'Login failed');
      return false;
    } catch (error) {
      console.error('Login error:', error);
      setError('An error occurred during login');
      return false;
    }
  };

  const handleSignup = async (userData) => {
    try {
      const response = await fetch('http://localhost:5000/api/signup', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(userData),
      });
      
      const data = await response.json();
      
      if (response.ok) {
        localStorage.setItem('userData', JSON.stringify(data.user));
        setError('');
        navigate('/chat'); // Automatically redirect to chat after successful signup
        return true;
      }
      setError(data.error || 'Signup failed');
      return false;
    } catch (error) {
      console.error('Signup error:', error);
      setError('An error occurred during signup');
      return false;
    }
  };
  // Reset error when modal is closed
  const handleModalClose = () => {
    setError('');
    setIsModalOpen(false);
  };

  return (
    <div className="start-page">
      <img 
        src="/images/avatar3.jpg" 
        alt="avatar" 
        className="avatar-image"
      />

      <button 
        className="continue-button"
        onClick={handleChatClick}
        onMouseEnter={(e) => e.target.style.backgroundColor = '#77b9cc'}
        onMouseLeave={(e) => e.target.style.backgroundColor = '#9ecedb'}
      >
        میتونی از اینجا شروع کنی
      </button>

      <button 
        className="auth-button"
        onClick={() => setIsModalOpen(true)}
        style={{
          backgroundColor: '#9ecedb',
          color: '#224a8a',
          marginTop: '1rem',
          padding: '0.8rem 1.5rem',
          borderRadius: '20px',
          border: 'none',
          fontFamily: 'Vazirmatn',
          cursor: 'pointer'
        }}
        onMouseEnter={(e) => e.target.style.backgroundColor = '#77b9cc'}
        onMouseLeave={(e) => e.target.style.backgroundColor = '#9ecedb'}
      >
        ورود / عضویت
      </button>

      <div className="info-box">
        <img 
          src="/images/icon2.png" 
          alt="icon" 
          className="info-icon"
          style={{ width: '100%', maxWidth: '80px', height: 'auto' }}
        />

        <p className="info-text">
          هر زمان که به آرامش نیاز داشتی دلیار کنارته<br />
          بدون قضاوت بهت گوش میدم<br />
          (: و کمکت میکنم حالت بهتر شه
        </p>
      </div>

      <AuthModal 
        isOpen={isModalOpen}
        onClose={handleModalClose}
        onLogin={handleLogin}
        onSignup={handleSignup}
        error={error}
      />
    </div>
  );
};

export default StartPage;