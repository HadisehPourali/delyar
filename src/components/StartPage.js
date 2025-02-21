import React, { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import AuthModal from './AuthModal';
import './StartPage.css';
import EmergencyContact from './EmergencyContact';
import ChatSidebar from './ChatSidebar';
import { Menu } from 'lucide-react';
import axios from 'axios';

const API_URL = process.env.REACT_APP_API_URL;

const StartPage = () => {
  const navigate = useNavigate();
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [error, setError] = useState('');
  const [isSidebarOpen, setIsSidebarOpen] = useState(false);
  const sidebarRef = useRef(null);

  useEffect(() => {
    function handleClickOutside(event) {
      if (isSidebarOpen && 
          sidebarRef.current && 
          !sidebarRef.current.contains(event.target) &&
          !event.target.closest('.menu-button')) {
        setIsSidebarOpen(false);
      }
    }
    
    if (isSidebarOpen) {
      document.addEventListener('mousedown', handleClickOutside);
    }
    
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [isSidebarOpen]);

  const handleChatClick = async () => {
    const userData = localStorage.getItem('userData');
    if (userData) {
      try {
        const user = JSON.parse(userData);
        const response = await axios.post(`${API_URL}/create-session`, { 
          botId: process.env.REACT_APP_BOT_ID, 
          username: user.username || null 
        });
        navigate('/chat', { state: { sessionId: response.data.id } });
      } catch (error) {
        console.error('Error creating session:', error);
        setError('Failed to create a new chat session');
      }
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
        //navigate('/chat');
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
        //navigate('/chat');
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

  const handleModalClose = () => {
    setError('');
    setIsModalOpen(false);
  };

  const handleNewChat = () => {
    handleChatClick();
  };

  const handleSelectChat = (chatData) => {
    navigate('/chat', { 
      state: { 
        sessionId: chatData.id, 
        messages: chatData.messages
      }
    });
  };

  return (
    <div className="start-page">
      {!isSidebarOpen && (
        <button
          onClick={() => setIsSidebarOpen(!isSidebarOpen)}
          className="menu-button"
        >
          <Menu size={24} />
        </button>
      )}

      <ChatSidebar
        ref={sidebarRef}
        isOpen={isSidebarOpen}
        toggleSidebar={() => setIsSidebarOpen(!isSidebarOpen)}
        onNewChat={handleNewChat}
        onSelectChat={handleSelectChat}
      />

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

      <EmergencyContact />
    </div>
  );
};

export default StartPage;