import React from 'react';
import { useNavigate } from 'react-router-dom';
import './StartPage.css';

const StartPage = () => {
  const navigate = useNavigate();

  const handleClick = () => {
    navigate('/chat');
  };

  return (
    <div className="start-page">
      <img 
        src="/images/avatar2.jpg" 
        alt="avatar" 
        className="avatar-image"
      />

      <button 
        className="continue-button"
        onClick={handleClick}
        onMouseEnter={(e) => e.target.style.backgroundColor = '#77b9cc'}
        onMouseLeave={(e) => e.target.style.backgroundColor = '#9ecedb'}
      >
        میتونی از اینجا شروع کنی
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
    </div>
  );
};

export default StartPage;