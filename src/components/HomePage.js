import React from 'react';
import { useNavigate } from 'react-router-dom';
import './HomePage.css';

const HomePage = () => {
  const navigate = useNavigate();

  return (
    <div className="home-page">
      <div className="avatar-container">
        <img 
          src="/images/avatar3.jpg" 
          alt="Avatar" 
        />
      </div>
      
      <div className="scrolling-text">
        <p>نفس عمیق بکش</p>
        <p>تو قوی تر از اون چیزی هستی که فکر میکنی</p>
      </div>

      <button 
        onClick={() => navigate('/start')} 
        className="action-button"
        style={{
          backgroundColor: '#9ecedb',
          color: '#224a8a',
          border: 'none',
        }}
      >
        ادامه
      </button>
    </div>
  );
};

export default HomePage;