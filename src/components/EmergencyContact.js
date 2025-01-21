import React, { useState } from 'react';
import './EmergencyContact.css';

const EmergencyContact = () => {
  const [showContacts, setShowContacts] = useState(false);

  const handleButtonClick = () => {
    setShowContacts(!showContacts);
  };

  const handleCloseClick = () => {
    setShowContacts(false);
  };

  return (
    <div className="emergency-contact">
      <button 
        className="sos-button" 
        onClick={handleButtonClick}
      >
        درخواست کمک اضطراری
      </button>
      {showContacts && (
        <div className="contact-list">
          <button className="close-button" onClick={handleCloseClick}>&times;</button>
          <p>در مواقع اضطراری، می‌توانید با شماره‌های زیر تماس بگیرید:</p>
          <ul>
            <li><strong>اورژانس اجتماعی:</strong> <a href="tel:123" className="phone-number">123</a> - کنارت هستیم.</li>
            <li><strong>صدای مشاور:</strong> <a href="tel:1480" className="phone-number">1480</a> - یک تماس ساده می‌تواند آغاز مسیر بهبودی باشد.</li>
            <li><strong>اورژانس روانپزشکی تهران:</strong> <a href="tel:44508200" className="phone-number">44508200</a> - متخصصان ما ۲۴ ساعته آماده ارائه خدمات تخصصی روانپزشکی هستند. سلامت روان شما اولویت ماست.</li>
          </ul>
        </div>
      )}
    </div>
  );
};

export default EmergencyContact;