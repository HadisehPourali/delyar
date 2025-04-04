import React, { useState } from 'react';
import './PaymentModal.css';

const SESSION_PRICE = parseInt(process.env.REACT_APP_SESSION_PRICE, 10) || 39000;

const PaymentModal = ({ isOpen, onClose, onConfirm, selectedSessions, setSelectedSessions }) => {
  if (!isOpen) return null;

  const handleSessionChange = (e) => {
    setSelectedSessions(Number(e.target.value));
  };

  return (
    <div className="payment-modal-overlay">
      <div className="payment-modal">
        <h2>خرید جلسه مشاوره</h2>
        <p>هر جلسه {SESSION_PRICE.toLocaleString()} تومان</p>
        <div className="session-selector">
          <label>تعداد جلسات:</label>
          <select value={selectedSessions} onChange={handleSessionChange}>
            {[1, 2, 3, 4, 5].map((num) => (
              <option key={num} value={num}>
                {num}
              </option>
            ))}
          </select>
        </div>
        <p>مبلغ قابل پرداخت: {(selectedSessions * SESSION_PRICE).toLocaleString()} تومان</p>
        <div className="modal-actions">
          <button onClick={onClose}>لغو</button>
          <button onClick={onConfirm}>پرداخت</button>
        </div>
      </div>
    </div>
  );
};

export default PaymentModal;