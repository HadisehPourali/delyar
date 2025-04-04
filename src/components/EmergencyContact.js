import React, { useState } from 'react';
import './EmergencyContact.css'; // Ensure CSS is imported

const EmergencyContact = () => {
  // State to control the visibility of the contact list
  const [showContacts, setShowContacts] = useState(false);

  // Toggle the visibility state when the SOS button is clicked
  const handleButtonClick = () => {
    setShowContacts(prevShow => !prevShow); // Use functional update for reliability
  };

  // Explicitly close the contact list
  const handleCloseClick = () => {
    setShowContacts(false);
  };

  return (
    // Use a wrapping div for positioning context if needed
    <div className="emergency-contact">
      {/* SOS Button */}
      <button
        className="sos-button"
        onClick={handleButtonClick}
        aria-expanded={showContacts} // Accessibility attribute
        aria-controls="contact-list-popup"
        title="تماس‌های اضطراری"
      >
        SOS
      </button>

      {/* Contact List Popup */}
      {/* Conditionally apply a 'visible' class based on state */}
      <div
         id="contact-list-popup"
         // --- CHANGE: Conditionally add 'visible' class ---
         className={`contact-list ${showContacts ? 'visible' : ''}`}
         onClick={(e) => e.stopPropagation()}
        >
          {/* Close button inside the popup */}
          <button
             className="close-button"
             onClick={handleCloseClick}
             title="بستن"
             aria-label="بستن لیست تماس اضطراری"
             >
             × {/* Simple multiplication sign for 'X' */}
          </button>

          {/* Content */}
          <p>در مواقع اضطراری، می‌توانید با شماره‌های زیر تماس بگیرید:</p>
          <ul>
            <li><strong>اورژانس اجتماعی:</strong> <a href="tel:123" className="phone-number">123</a></li>
            <li><strong>صدای مشاور:</strong> <a href="tel:1480" className="phone-number">1480</a></li>
            {/* Add more contacts if needed */}
            <li><strong>اورژانس روانپزشکی تهران:</strong> <a href="tel:44508200" className="phone-number">44508200</a></li>
          </ul>
          <strong><p className="supportive-message">به یاد داشته باشید، شما تنها نیستید.</p></strong>
        </div>

    </div>
  );
};

export default EmergencyContact;