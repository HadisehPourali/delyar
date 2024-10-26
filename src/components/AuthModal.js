import React, { useState, useEffect } from 'react';
import './AuthModal.css';

const initialFormData = {
  username: '',
  password: '',
  gender: '',
  age: '',
  education: '',
  job: '',
  disorder: ''
};

const AuthModal = ({ isOpen, onClose, onLogin, onSignup, error }) => {
  const [isLoginMode, setIsLoginMode] = useState(true);
  const [formData, setFormData] = useState(initialFormData);
  const [localError, setLocalError] = useState('');

  // Reset form when modal is opened/closed
  useEffect(() => {
    if (!isOpen) {
      setFormData(initialFormData);
      setIsLoginMode(true);
      setLocalError('');
    }
  }, [isOpen]);

  const handleChange = (e) => {
    setFormData({
      ...formData,
      [e.target.name]: e.target.value
    });
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setLocalError('');

    if (!formData.username || !formData.password) {
      setLocalError('نام کاربری و رمز عبور الزامی است');
      return;
    }

    try {
      if (isLoginMode) {
        const success = await onLogin(formData);
        if (success) {
          onClose();
        }
      } else {
        const success = await onSignup(formData);
        if (success) {
          onClose();
        }
      }
    } catch (err) {
      setLocalError('خطایی رخ داد. لطفا دوباره تلاش کنید');
    }
  };

  if (!isOpen) return null;

  return (
    <div className="modal-overlay">
      <div className="modal-content">
        <button className="modal-close" onClick={onClose}>&times;</button>
        <h2 className="modal-title">
          {isLoginMode ? 'ورود' : 'اگر بیشتر بشناسمت، بهتر میتونم کمکت کنم'}
        </h2>
        
        <form onSubmit={handleSubmit} className="auth-form">
          <input
            type="text"
            name="username"
            placeholder="نام کاربری"
            value={formData.username}
            onChange={handleChange}
            required
          />
          
          <input
            type="password"
            name="password"
            placeholder="رمز عبور"
            value={formData.password}
            onChange={handleChange}
            required
          />

          {!isLoginMode && (
            <>
              <select name="gender" value={formData.gender} onChange={handleChange}>
                <option value="">جنسیت (اختیاری)</option>
                <option value="male">مرد</option>
                <option value="female">زن</option>
                <option value="other">سایر</option>
              </select>

              <input
                type="number"
                name="age"
                placeholder="سن (اختیاری)"
                value={formData.age}
                onChange={handleChange}
              />

              <input
                type="text"
                name="education"
                placeholder="تحصیلات (اختیاری)"
                value={formData.education}
                onChange={handleChange}
              />

              <input
                type="text"
                name="job"
                placeholder="شغل (اختیاری)"
                value={formData.job}
                onChange={handleChange}
              />

              <input
                type="text"
                name="disorder"
                placeholder="اختلال خاص (اختیاری)"
                value={formData.disorder}
                onChange={handleChange}
              />
            </>
          )}

          {(error || localError) && (
            <div className="error-message">
              {error || localError}
            </div>
          )}

          <button type="submit" className="submit-button">
            {isLoginMode ? 'ورود' : 'عضویت'}
          </button>

          <div className="mode-switch">
            {isLoginMode ? (
              <p>
                حساب کاربری ندارید؟{' '}
                <button type="button" onClick={() => setIsLoginMode(false)}>
                  عضو شوید
                </button>
              </p>
            ) : (
              <p>
                قبلاً عضو شده‌اید؟{' '}
                <button type="button" onClick={() => setIsLoginMode(true)}>
                  وارد شوید
                </button>
              </p>
            )}
          </div>
        </form>
      </div>
    </div>
  );
};

export default AuthModal;