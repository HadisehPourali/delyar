import React, { useState, useEffect, useRef, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
// Removed AuthModal import as logic is now inline/within this component
import './StartPage.css'; // Main styles
import PaymentModal from './PaymentModal'; // <-- ADD THIS LINE
import './PaymentModal.css'; // Styles for payment/confirm modals reusing PaymentModal.css structure
import EmergencyContact from './EmergencyContact';
import ChatSidebar from './ChatSidebar';
import { Menu, LogOut, Send, MessageSquare, Star, User, LogIn, ClipboardList } from 'lucide-react';
import axios from 'axios';

// Ensure Axios is configured for credentials
axios.defaults.withCredentials = true;
// Optional: Set base URL if not done globally elsewhere
// axios.defaults.baseURL = process.env.REACT_APP_API_URL;

const API_URL = process.env.REACT_APP_API_URL; // Still useful for non-axios fetches or reference

const StartPage = () => {
  const navigate = useNavigate();

  // --- State Variables ---
  // Auth State
  const [isLoggedIn, setIsLoggedIn] = useState(false);
  const [userData, setUserData] = useState(null); // Stores { phone_number, balance, etc. }
  const [authError, setAuthError] = useState('');
  const [showOtpInput, setShowOtpInput] = useState(false);
  const [phoneNumber, setPhoneNumber] = useState('');
  const [otp, setOtp] = useState('');
  const [isAuthLoading, setIsAuthLoading] = useState(false);
  const [showAuthForm, setShowAuthForm] = useState(false); // Controls visibility of the auth modal/form

  // Sidebar State
  const [isSidebarOpen, setIsSidebarOpen] = useState(false);
  const sidebarRef = useRef(null); // For closing sidebar on outside click

  // Wallet & Payment State
  const [walletBalance, setWalletBalance] = useState(0);
  const [sessionCount, setSessionCount] = useState(1); // Default sessions for payment modal
  const [isPaymentModalOpen, setIsPaymentModalOpen] = useState(false); // Top-up selection modal
  const [isConfirmModalOpen, setIsConfirmModalOpen] = useState(false); // Zarinpal payment confirmation
  const [isPurchaseModalOpen, setIsPurchaseModalOpen] = useState(false); // Direct purchase from wallet confirmation
  const [isStartSessionModalOpen, setIsStartSessionModalOpen] = useState(false); // Confirm starting a chat session

  // Feedback State
  const [showFeedbackForm, setShowFeedbackForm] = useState(false);
  const [feedbackComment, setFeedbackComment] = useState('');
  const [feedbackRating, setFeedbackRating] = useState(0); // 0 for no rating
  const [isFeedbackLoading, setIsFeedbackLoading] = useState(false);

  // Profile State (for update form - initially hidden)
  const [showProfileForm, setShowProfileForm] = useState(false);
  const [profileData, setProfileData] = useState({ gender: '', age: '', education: '', job: '', disorder: '' });
  const [isProfileLoading, setIsProfileLoading] = useState(false);
  const [profileError, setProfileError] = useState('');

  // General Message State
  const [message, setMessage] = useState(''); // For status messages (payment, errors, etc.)
  const messageTimeoutRef = useRef(null); // To auto-clear messages

  const SESSION_PRICE = parseInt(process.env.REACT_APP_SESSION_PRICE, 10) || 39000;

  const [discountCode, setDiscountCode] = useState('');
  const [discountApplied, setDiscountApplied] = useState(false);
  const [discountedAmount, setDiscountedAmount] = useState(null);
  // --- Helper Functions ---

  // Function to display messages and auto-clear them
  const showStatusMessage = useCallback((msg, duration = 5000, type = 'info') => {
    setMessage({ text: msg, type }); // Store type for potential styling
    clearTimeout(messageTimeoutRef.current);
    messageTimeoutRef.current = setTimeout(() => {
      setMessage(null); // Clear message object
    }, duration);
  }, []);

  // --- Effects ---

  // Check login status on initial mount and handle payment redirects
  const [availableMinutes, setAvailableMinutes] = useState(0);

  const checkLoginStatus = useCallback(async (showWelcome = false) => {
    try {
      const response = await axios.get(`${API_URL}/api/auth/status`);
      if (response.data.logged_in) {
        const user = response.data.user;
        setIsLoggedIn(true);
        setUserData(user);
        setWalletBalance(user.wallet_balance || 0);
        // --- Set available minutes from user data ---
        setAvailableMinutes(user.available_session_minutes || 0);
        // --- End ---
        setProfileData({ /* ... */ });
        if (showWelcome) { /* ... */ }

        // Optionally, call check-access here too to get the absolute latest state
        // const accessRes = await axios.get('http://localhost:5000/api/chat/check-access');
        // console.log("Initial Access State:", accessRes.data);
        // You could update state based on accessRes.data if needed (e.g., show specific buttons)

      } else {
        setIsLoggedIn(false);
        setUserData(null);
        setWalletBalance(0);
        // --- Reset available minutes on logout ---
        setAvailableMinutes(0);
        // --- End ---
        setProfileData({ /* ... */ });
      }
    } catch (error) {
      console.error('Error checking login status:', error);
      setIsLoggedIn(false);
      setUserData(null);
      setWalletBalance(0);
       // --- Reset available minutes on error ---
      setAvailableMinutes(0);
       // --- End ---
      setProfileData({ /* ... */ });
    }
// }, [showStatusMessage]); // Keep original dependencies
}, [showStatusMessage]); // Add other state setters if needed by ESLint

  useEffect(() => {
    checkLoginStatus(); // Check status on mount

    // Handle payment status from URL redirect
    const urlParams = new URLSearchParams(window.location.search);
    const paymentStatus = urlParams.get('status');
    const refId = urlParams.get('refid');
    const reason = urlParams.get('reason');
    const code = urlParams.get('code');

    if (paymentStatus) {
      let statusMsg = '';
      let msgType = 'info';
      switch (paymentStatus) {
        case 'success':
          statusMsg = `پرداخت با موفقیت انجام شد. کد رهگیری: ${refId}`;
          msgType = 'success';
          checkLoginStatus(); // Re-fetch user data to update balance/session
          break;
        case 'cancelled':
          statusMsg = 'پرداخت توسط شما لغو شد.';
          msgType = 'warning';
          break;
        case 'failed':
          statusMsg = `پرداخت ناموفق بود. ${reason ? `علت: ${reason}` : ''} ${code ? `(کد خطا: ${code})` : ''} ${refId ? `(کد رهگیری: ${refId})` : ''}`;
           if (reason === 'user_sync_error' || reason === 'db_update_failed') {
              statusMsg += " لطفا با پشتیبانی تماس بگیرید.";
          }
          msgType = 'error';
          break;
        case 'already_verified':
          statusMsg = `این پرداخت قبلاً تأیید شده است. ${refId ? `(کد رهگیری: ${refId})` : ''}`;
          msgType = 'info';
           checkLoginStatus(); // Refresh data just in case
          break;
        case 'already_verified_or_invalid':
           statusMsg = 'تراکنش قبلا تایید شده یا درخواست نامعتبر است.';
           msgType = 'warning';
           break;
        default:
          statusMsg = `وضعیت پرداخت نامشخص: ${paymentStatus}`;
          msgType = 'warning';
          break;
      }
      showStatusMessage(statusMsg, 8000, msgType); // Show longer for payment status
      // Clean the URL after processing
      window.history.replaceState({}, document.title, '/start');
    }

     // Cleanup timeout on unmount
     return () => clearTimeout(messageTimeoutRef.current);
  }, [checkLoginStatus, showStatusMessage]); // Add dependencies


  // Sidebar click outside handler
  useEffect(() => {
    function handleClickOutside(event) {
      // Close sidebar if click is outside sidebar and not on the menu button
      if (isSidebarOpen &&
          sidebarRef.current &&
          !sidebarRef.current.contains(event.target) &&
          !event.target.closest('.menu-button')) {
        setIsSidebarOpen(false);
      }
      // Close auth form if click is outside the form itself
      if (showAuthForm && !event.target.closest('.auth-modal')) {
         // Don't close immediately if loading, might interfere
         if (!isAuthLoading) {
            // setShowAuthForm(false);
            // resetAuthForm(); // Also reset form state on close
         }
      }
      // Close profile form if click is outside
       if (showProfileForm && !event.target.closest('.profile-modal')) {
          if (!isProfileLoading) {
              // setShowProfileForm(false);
              // setProfileError('');
          }
       }

       // Add similar logic for other modals if needed
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  // }, [isSidebarOpen, showAuthForm, isAuthLoading, showProfileForm, isProfileLoading]);
  }, [isSidebarOpen, showAuthForm, isAuthLoading]); // Simplified dependencies for now

  // --- Event Handlers ---

  // Close All Modals helper
  const closeAllModals = () => {
     setShowAuthForm(false);
     setIsPaymentModalOpen(false);
     setIsConfirmModalOpen(false);
     setIsPurchaseModalOpen(false);
     setIsStartSessionModalOpen(false);
     setShowFeedbackForm(false);
     setShowProfileForm(false);
     // Reset relevant errors
     setAuthError('');
     setProfileError('');
  }

  // Reset Auth Form State
  const resetAuthForm = () => {
    setPhoneNumber('');
    setOtp('');
    setShowOtpInput(false);
    setAuthError('');
    setIsAuthLoading(false);
  };

  // Authentication Handlers
  const handleRequestOtp = async (e) => {
    e.preventDefault();
    setAuthError('');
    setIsAuthLoading(true);
    try {
      // Basic client-side validation (backend does thorough validation)
      if (!phoneNumber.match(/^09\d{9}$/)) {
          throw new Error("شماره موبایل وارد شده صحیح نیست.");
      }

      await axios.post(`${API_URL}/api/auth/request-otp`, { phone_number: phoneNumber });
      setShowOtpInput(true);
      //showStatusMessage('کد یکبار مصرف ارسال شد.', 5000, 'success');
    } catch (error) {
      console.error('OTP Request error:', error.response?.data || error.message);
      const errorMsg = error.response?.data?.error || error.message || 'خطا در ارسال کد';
      setAuthError(errorMsg);
      //showStatusMessage(errorMsg, 5000, 'error');
      setShowOtpInput(false); // Ensure OTP input is hidden on error
    } finally {
      setIsAuthLoading(false);
    }
  };

  const handleVerifyOtp = async (e) => {
    e.preventDefault();
    setAuthError('');
    setIsAuthLoading(true);
    try {
      const response = await axios.post(`${API_URL}/api/auth/verify-otp`, { phone_number: phoneNumber, otp });
      const user = response.data.user;
      console.log("Verify OTP Success. Received user:", user);
      console.log("Current isLoggedIn state:", isLoggedIn);
      setIsLoggedIn(true);
      setUserData(response.data.user);
      setWalletBalance(response.data.user.wallet_balance || 0);
      setProfileData({
        name: user.name || '',
        gender: user.gender || '',
        age: user.age || '',
        education: user.education || '',
        job: user.job || '',
        disorder: user.disorder || '',
    });
      setShowAuthForm(false); // Close auth form
      resetAuthForm();
      const welcomeName = user.name || user.phone_number;
      showStatusMessage(response.data.message || `ورود موفقیت آمیز بود ${welcomeName}`, 5000, 'success');
       // Check if new user and prompt profile completion
       if (response.data.is_new_user && !response.data.user.profile_complete) {
           showStatusMessage('ثبت نام شما با موفقیت انجام شد. لطفا پروفایل خود را تکمیل کنید.', 8000);
           // Automatically open profile form for new users?
           // setShowProfileForm(true);
       }
    } catch (error) {
      console.error('OTP Verify error:', error.response?.data || error.message);
      const errorMsg = error.response?.data?.error || 'خطا در تایید کد';
      setAuthError(errorMsg);
      //showStatusMessage(errorMsg, 5000, 'error');
      setOtp(''); // Clear OTP field on error, keep phone number
    } finally {
      setIsAuthLoading(false);
    }
  };

  const handleLogout = async () => {
    closeAllModals(); // Close any open modals on logout
    try {
      await axios.post(`${API_URL}/api/auth/logout`);
      // Don't rely solely on backend success, force state update
    } catch (error) {
      console.error('Logout error:', error);
      // Still proceed with client-side logout even if backend fails
    } finally {
        setIsLoggedIn(false);
        setUserData(null);
        setWalletBalance(0);
        setIsSidebarOpen(false); // Ensure sidebar is closed
        resetAuthForm(); // Clear any lingering auth form state
        showStatusMessage('شما با موفقیت خارج شدید.', 3000);
    }
  };

  // Payment Handlers
  const initiatePayment = async () => {
    if (!isLoggedIn) {
      showStatusMessage('لطفاً ابتدا وارد شوید.', 4000, 'warning');
      setShowAuthForm(true);
      setIsConfirmModalOpen(false);
      return;
    }
    setMessage('');
    setIsConfirmModalOpen(false);
    setIsAuthLoading(true);

    try {
      const totalAmount = sessionCount * SESSION_PRICE;
      const response = await axios.post(`${API_URL}/api/payment/request`, {
        amount: totalAmount,
        sessionCount,
        discountCode: discountCode || null,
      });

      if (response.data.status === 200 && response.data.payment_amount === 0) {
        // 100% discount applied
        showStatusMessage(response.data.message || 'کیف پول با موفقیت شارژ شد!', 5000, 'success');
        setWalletBalance(response.data.wallet_balance);
        setUserData(prev => ({ ...prev, wallet_balance: response.data.wallet_balance }));
        setDiscountCode('');
        setDiscountApplied(false);
        setDiscountedAmount(null);
      } else if (response.data.status === 100 && response.data.payment_url) {
        showStatusMessage('در حال انتقال به درگاه پرداخت...', 10000);
        setDiscountCode('');
        setDiscountApplied(false);
        setDiscountedAmount(null);
        window.location.href = response.data.payment_url;
      } else {
         showStatusMessage(response.data.error || 'خطا در ایجاد درخواست پرداخت', 5000, 'error');
      }
    } catch (error) {
      console.error('Payment Request error:', error.response?.data || error.message);
      showStatusMessage(error.response?.data?.error || 'خطا در اتصال به درگاه پرداخت', 5000, 'error');
    } finally {
      setIsAuthLoading(false);
    }
  };

  // In StartPage.jsx, update handlePurchaseTopUp message for clarity
  const handlePurchaseTopUp = () => {
    if (!isLoggedIn) {
        showStatusMessage('لطفاً ابتدا وارد شوید.', 4000, 'warning');
        setShowAuthForm(true);
        return;
    }
    setMessage('');
    setIsPaymentModalOpen(false);
    setIsConfirmModalOpen(true); // Opens Zarinpal confirmation
    // Optional: Add a preparatory message
    showStatusMessage(`در حال آماده‌سازی شارژ کیف پول برای ${sessionCount} جلسه...`, 3000);
  };

  // Direct Purchase from Wallet Handler
  const handleConfirmDirectPurchase = async () => {
    if (!isLoggedIn) {
        showStatusMessage('لطفاً ابتدا وارد شوید.', 4000, 'warning');
        setShowAuthForm(true);
        setIsPurchaseModalOpen(false);
        return;
    }
    setMessage('');
    setIsPurchaseModalOpen(false);
    setIsAuthLoading(true); // Indicate loading
    try {
        const response = await axios.post(`${API_URL}/api/chat/purchase-session`);
        showStatusMessage(response.data.message, 5000, 'success');
        setWalletBalance(response.data.balance);
        // Optionally update remaining time if needed on StartPage
        // Update userData if backend sends updated user object
        if(response.data.user) {
            setUserData(response.data.user);
        } else {
            // Manually update balance in existing userData if full object not returned
             setUserData(prev => ({...prev, wallet_balance: response.data.balance}));
        }

    } catch (error) {
        console.error('Direct purchase error:', error.response?.data || error.message);
        showStatusMessage(error.response?.data?.error || 'خطا در خرید جلسه', 5000, 'error');
    } finally {
        setIsAuthLoading(false);
    }
};


  // Chat Handling
    // Chat Handling
    const handleChatStartRequest = async () => {
      if (!isLoggedIn) {
          showStatusMessage('لطفاً برای ادامه وارد شوید.', 4000, 'warning');
          setShowAuthForm(true);
          return;
      }
  
      setMessage(''); // Clear previous messages
      setIsAuthLoading(true); // Show loading indicator
  
      try {
          // First, check general access (active session, purchased minutes, or free available)
          const accessResponse = await axios.get(`${API_URL}/api/chat/check-access`);
          const accessData = accessResponse.data;
  
          console.log("Check Access Response:", accessData); // Debugging
  
          if (accessData.access) {
              // Option 1: Session is already active, navigate directly
              if (accessData.session_active) {
                  showStatusMessage('ورود به جلسه فعال...', 2000);
                  // Need a session ID. How do we get the *current* active session ID?
                  // This requires a way to fetch the latest/active session ID if one exists.
                  // For now, assume we create a new one or use one from sidebar.
                  // Let's modify to *always* try and create/get a session ID first,
                  // then navigate. The backend will handle the time.
                  // *** SIMPLIFIED APPROACH: Always try to START/ENSURE session is active ***
                  // *** Then create Metis session ID, then navigate ***
  
                  // Call start-session to ensure time is activated if needed, or confirm active time
                  const startResponse = await axios.post(`${API_URL}/api/chat/start-session`);
                  const startData = startResponse.data;
  
                  if (startData.remaining_time > 0) {
                     // Now create or get the MetisAI session ID
                     const sessionResponse = await axios.post(`${API_URL}/create-session`);
                     if (sessionResponse.data && sessionResponse.data.id) {
                         showStatusMessage('در حال ورود به گفتگو...', 2000);
                         // Pass the confirmed remaining time to the chat page
                         navigate('/chat', {
                             state: {
                                 sessionId: sessionResponse.data.id,
                                 initialRemainingTime: startData.remaining_time // Pass the initial time
                             }
                         });
                     } else {
                         throw new Error("Failed to get session ID from backend.");
                     }
                  } else {
                       // This case shouldn't happen if check-access was positive, but handle defensively
                       showStatusMessage(startData.error || 'خطا در فعال سازی جلسه', 5000, 'error');
                       if (startData.needs_purchase) setIsPurchaseModalOpen(true);
                  }
  
              } else if (accessData.needs_start) {
                   // Option 2: Access granted, but needs explicit start (purchased or free)
                   showStatusMessage('در حال فعال سازی جلسه شما...', 3000);
                   const startResponse = await axios.post(`${API_URL}/api/chat/start-session`);
                   const startData = startResponse.data;
  
                   if (startData.remaining_time > 0) {
                       // Session activated, now create the Metis session
                       const sessionResponse = await axios.post(`${API_URL}/create-session`);
                       if (sessionResponse.data && sessionResponse.data.id) {
                           showStatusMessage('جلسه فعال شد، در حال ورود...', 2000);
                           // Pass the initial remaining time
                            navigate('/chat', {
                              state: {
                                  sessionId: sessionResponse.data.id,
                                  initialRemainingTime: startData.remaining_time
                              }
                            });
                       } else {
                           throw new Error("Failed to get session ID from backend.");
                       }
                   } else {
                       // Failed to activate (e.g., race condition, error)
                       showStatusMessage(startData.error || 'خطا در فعال سازی جلسه', 5000, 'error');
                        if (startData.needs_purchase) setIsPurchaseModalOpen(true); // Prompt purchase if activation failed due to lack of credit
                   }
              } else {
                   // Fallback: Access true but neither active nor needs_start? Should not happen with current backend logic.
                   console.error("Unexpected state from /check-access:", accessData);
                   showStatusMessage('وضعیت دسترسی نامشخص، لطفا دوباره تلاش کنید.', 5000, 'warning');
              }
          } else {
              // No access (needs purchase)
              showStatusMessage(accessData.message || 'زمان چت شما به پایان رسیده یا اعتبار ندارید.', 6000, 'warning');
              // Prompt purchase modal directly
              setIsPurchaseModalOpen(true);
          }
      } catch (error) {
          console.error('Chat start request error:', error.response?.data || error.message);
          const errorMsg = error.response?.data?.error || 'خطا در بررسی یا شروع جلسه چت';
          showStatusMessage(errorMsg, 5000, 'error');
          // If error specifically indicates needing purchase, show modal
          if (error.response?.data?.needs_purchase) {
             setIsPurchaseModalOpen(true);
          }
      } finally {
          setIsAuthLoading(false); // Stop loading indicator
      }
  };
  

  // Confirms starting the chat session (free or paid)
  const handleConfirmStartSession = async () => {
    setIsStartSessionModalOpen(false);
    setMessage('');
    setIsAuthLoading(true);
    try {
       // Call backend to potentially activate free session time if needed
       await axios.post(`${API_URL}/api/chat/start-session`);

       // Create a new chat session in MetisAI via our backend
      const sessionResponse = await axios.post(`${API_URL}/create-session`); // Backend uses user session

      if (sessionResponse.data && sessionResponse.data.id) {
        // Navigate to ChatPage with the new session ID
        navigate('/chat', { state: { sessionId: sessionResponse.data.id } });
      } else {
          throw new Error("Failed to get session ID from backend.");
      }

    } catch (error) {
      console.error('Error starting/creating session:', error.response?.data || error.message);
      const errorMsg = error.response?.data?.error || 'خطا در ایجاد یا شروع جلسه چت';
      showStatusMessage(errorMsg, 5000, 'error');
       // If error indicates needing purchase, prompt it
       if (error.response?.data?.needs_purchase) {
           setIsPurchaseModalOpen(true);
       }
    } finally {
        setIsAuthLoading(false);
    }
  };

  // Handles selecting an existing chat from the sidebar
  const handleSelectChat = (chatData) => {
    setIsSidebarOpen(false); // Close sidebar
    navigate('/chat', { state: { sessionId: chatData.id } }); // Navigate to chat page
  };

  // Feedback Handlers
  const handleFeedbackSubmit = async (e) => {
    e.preventDefault();
    if (!feedbackComment.trim()) {
      showStatusMessage('لطفا نظر خود را بنویسید.', 4000, 'warning');
      return;
    }
    if (!isLoggedIn) {
       showStatusMessage('لطفا برای ارسال نظر وارد شوید.', 4000, 'warning');
       setShowAuthForm(true);
       return;
    }

    setIsFeedbackLoading(true);
    setMessage('');
    try {
      await axios.post(`${API_URL}/api/feedback`, {
        comment: feedbackComment,
        rating: feedbackRating > 0 ? feedbackRating : null,
      });
      showStatusMessage('از بازخورد شما متشکریم!', 5000, 'success');
      setFeedbackComment('');
      setFeedbackRating(0);
      setShowFeedbackForm(false); // Hide form on success
    } catch (error) {
      console.error('Feedback submit error:', error.response?.data || error.message);
      showStatusMessage(error.response?.data?.error || 'خطا در ارسال بازخورد', 5000, 'error');
    } finally {
      setIsFeedbackLoading(false);
    }
  };

  // Profile Update Handlers
   const handleProfileInputChange = (e) => {
    const { name, value } = e.target;
    setProfileData(prev => ({ ...prev, [name]: value }));
   };

   const handleProfileSubmit = async (e) => {
      e.preventDefault();
      setProfileError('');
      setIsProfileLoading(true);
      try {
          const response = await axios.put(`${API_URL}/api/user/profile`, profileData);
          setUserData(response.data.user); // Update user data state

          showStatusMessage('پروفایل با موفقیت به روز شد.', 5000, 'success');
          setShowProfileForm(false); // Close form on success
      } catch (error) {
          console.error('Profile update error:', error.response?.data || error.message);
          const errorMsg = error.response?.data?.error || 'خطا در به‌روزرسانی پروفایل';
          setProfileError(errorMsg);
          showStatusMessage(errorMsg, 5000, 'error');
      } finally {
          setIsProfileLoading(false);
      }
   };


  // --- Render Logic ---

  // Star rating component for feedback form
  const renderStars = () => {
    return [1, 2, 3, 4, 5].map((star) => (
      <Star
        key={star}
        size={28} // Slightly larger stars
        color={star <= feedbackRating ? '#ffc107' : '#e0e0e0'} // Gold / Light Gray
        fill={star <= feedbackRating ? '#ffc107' : 'currentColor'} // Fill selected, use text color for outline
        onClick={() => setFeedbackRating(star)}
        style={{ cursor: 'pointer', margin: '0 4px', transition: 'transform 0.1s ease' }}
        onMouseEnter={(e) => e.currentTarget.style.transform = 'scale(1.1)'}
        onMouseLeave={(e) => e.currentTarget.style.transform = 'scale(1)'}
      />
    ));
  };

  // Dynamic class for message display based on type
  const getMessageClass = (type) => {
    switch (type) {
      case 'error': return 'message-display error';
      case 'success': return 'message-display success';
      case 'warning': return 'message-display warning';
      default: return 'message-display info';
    }
  };

      // --- Start of return statement (JSX) ---
      return (
        <div className="start-page">
    
          {/* ==================== Header ==================== */}
          <div className="header">
            {isLoggedIn && (
               <button
                 className="menu-button"
                 onClick={() => setIsSidebarOpen(!isSidebarOpen)}
                 title="تاریخچه گفتگوها"
                >
                 <Menu size={24} />
               </button>
            )}
            <div className="wallet-info">
              {isLoggedIn ? (
                <>
                   {/* Profile Button */}
                   <button
                    className="profile-button topup-button"
                    onClick={() => {
                      // Populate profileData with current userData before opening the modal
                      setProfileData({
                        name: userData?.name || '',
                        gender: userData?.gender || '',
                        age: userData?.age || '',
                        education: userData?.education || '',
                        job: userData?.job || '',
                        disorder: userData?.disorder || ''
                      });
                      setShowProfileForm(true); // Then open the modal
                    }}
                    title="مشاهده و ویرایش پروفایل"
                    style={{ marginLeft: '10px' }}
                  >
                    <User size={16} style={{ marginRight: '5px' }} />
                    پروفایل
                    {userData && !userData.profile_complete && <span className="incomplete-indicator">*</span>}
                  </button>
    
                  {/* Wallet Balance Display */}
                  <span className="wallet-balance" title="موجودی کیف پول شما">
                    موجودی: {walletBalance?.toLocaleString() || 0} ت
                  </span>

                  {availableMinutes > 0 && (
                      <span className="available-minutes-display" title="دقایق گفتگوی خریداری شده شما">
                          دقایق موجود: {availableMinutes}
                      </span>
                  )}

                  {/* Top-up Button (Zarinpal) */}
                  <button
                    className="topup-button"
                    onClick={() => setIsPaymentModalOpen(true)} // Opens the specific payment modal
                    title="شارژ کیف پول از طریق درگاه پرداخت"
                  >
                    شارژ کیف پول
                  </button>
    
                  {/* Direct Purchase Button (from Wallet) */}
                   <button
                      className="purchase-session-button topup-button" // Reusing button style
                      onClick={() => setIsPurchaseModalOpen(true)} // Opens purchase confirmation
                      title="خرید جلسه با استفاده از موجودی کیف پول"
                    >
                      خرید جلسه
                   </button>
                </>
              ) : (
                // Login/Signup Button in Header (if not logged in)
                 <button
                   className="auth-button-header topup-button" // Reusing button style
                   onClick={() => setShowAuthForm(true)}
                  >
                   <LogIn size={16} style={{marginRight: '5px'}}/> {/* Icon */}
                   ورود / عضویت
                 </button>
              )}
            </div>
          </div> {/* End Header */}
    
          {/* ==================== General Status Message Display ==================== */}
          {message && (
              <div id="status-message-display" className={getMessageClass(message.type)}>
                  {message.text}
              </div>
           )}
    
          {/* ==================== Authentication Form Modal ==================== */}
           {showAuthForm && !isLoggedIn && (
            // Using base modal overlay style from StartPage.css
            <div className="modal-overlay" onClick={() => { if (!isAuthLoading) { setShowAuthForm(false); resetAuthForm(); } }}>
              {/* Using base modal style + specific auth-modal class */}
              <div className="modal auth-modal" onClick={(e) => e.stopPropagation()}>
                {/* Use modal-content wrapper for scrolling */}
                <div className="modal-content">
                    <h3>ورود یا ثبت نام</h3>
                    <p>برای استفاده از دلیار، لطفا شماره موبایل خود را وارد کنید.</p>
                    <form id="auth-form" onSubmit={showOtpInput ? handleVerifyOtp : handleRequestOtp}>
                        {/* ... input fields remain the same ... */}
                        <div className="form-group">
                            <label htmlFor="phone">شماره موبایل</label>
                            <input type="tel" id="phone" value={phoneNumber} onChange={(e) => setPhoneNumber(e.target.value)} placeholder="مثال: 09123456789" required disabled={showOtpInput || isAuthLoading} autoComplete="tel"/>
                        </div>
                        {showOtpInput && (
                            <div className="form-group">
                                <label htmlFor="otp">کد تایید</label>
                                <input type="text" id="otp" value={otp} onChange={(e) => setOtp(e.target.value)} placeholder="کد ۴  رقمی" required disabled={isAuthLoading} inputMode="numeric" pattern="\d*" maxLength="6" autoComplete="one-time-code"/>
                            </div>
                        )}
                        {authError && <p className="error-message">{authError}</p>}
                    {/* Actions are outside the scrolling content, but the form needs the ID */}
                    </form>
                </div>
                {/* Button Container - outside modal-content */}
                <div className="modal-actions auth-actions">
                    <button type="button" onClick={() => { setShowAuthForm(false); resetAuthForm(); }} className="cancel-button" disabled={isAuthLoading}>بستن</button>
                    {/* Submit button associated with the form */}
                    <button
                    type="submit"
                    form="auth-form" // <-- ALWAYS set the form ID
                    disabled={isAuthLoading}
                    className="confirm-button"
                  >
                    {isAuthLoading ? '...' : (showOtpInput ? 'تایید و ورود' : 'ارسال کد')}
                  </button>
           </div>
                {showOtpInput && (<button type="button" onClick={() => { setShowOtpInput(false); setOtp(''); setAuthError(''); }} disabled={isAuthLoading} className="edit-phone-button">ویرایش شماره موبایل؟</button>)}
              </div>
            </div>
           )} {/* End Auth Modal */}
    
          {/* ==================== Chat Sidebar ==================== */}
          {isLoggedIn && (
            <ChatSidebar
              ref={sidebarRef}
              isOpen={isSidebarOpen}
              toggleSidebar={() => setIsSidebarOpen(!isSidebarOpen)}
              onNewChat={handleChatStartRequest}
              onSelectChat={handleSelectChat}
              currentUserData={userData}
            />
          )}
    
          {/* ==================== Main Page Content ==================== */}
          <img src="/images/avatar3.png" alt="avatar" className="avatar-image" />
    
          {/* Welcome Message */}
          {isLoggedIn && userData && (
            <div className="welcome-message">
              <p className="welcome-text">
                {`سلام ${userData.name || userData.phone_number}`} <br /> خوشحالم که اینجایی! دلیار همیشه آماده‌ی شنیدن حرف‌هات هست
              </p>
            </div>
          )}
    
          {/* Start Chat / Login Buttons */}
          <button className="continue-button" onClick={handleChatStartRequest} disabled={isAuthLoading} title={isLoggedIn ? "میتونی از اینجا شروع کنی" : "برای شروع گفتگو وارد شوید"}>
              {isAuthLoading ? '...' : (isLoggedIn ? "میتونی از اینجا شروع کنی" : 'برای شروع وارد شوید')}
          </button>
          {!isLoggedIn && ( <button className="auth-button continue-button" onClick={() => setShowAuthForm(true)} style={{marginTop: '15px'}}> <LogIn size={18} style={{marginRight: '8px'}}/> ورود / عضویت </button> )}
    
          {/* Info Box */}
           <div className="info-box"> <img src="/images/icon2.png" alt="icon" className="info-icon" /> <p className="info-text"> هر زمان که به آرامش نیاز داشتی دلیار کنارته<br /> بدون قضاوت بهت گوش میدم<br /> (: و کمکت میکنم حالت بهتر شه </p> </div>
    
          {/* Feedback Trigger */}
           {isLoggedIn && ( <div className="feedback-section"> <button className="feedback-toggle-button" onClick={() => setShowFeedbackForm(true)} title="نظر خود را در مورد دلیار ثبت کنید"> <MessageSquare size={18} style={{marginRight: '8px' }}/> ثبت نظر </button> </div> )}
            
           <div className="footer-info">
           <div className="survey-link-section">
              <a 
                href="https://survey.porsline.ir/s/u8eZtZ2T" 
                target="_blank" 
                rel="noopener noreferrer" 
                className="survey-link-button"
                title="با پاسخ به چند سوال ساده، در ساخت نسخه‌ای بهتر از دلیار سهیم باشید"
              >
                <ClipboardList size={18} style={{ marginRight: '8px' }}/> 
                در ساخت دلیار، با ما همراه شوید
              </a>
              <p className="survey-link-description">
                با چند دقیقه زمان و پاسخ به پرسشنامه، به ما کمک می‌کنید تا دلیار را بهتر، دقیق‌تر و متناسب‌تر با نیازهای شما بسازیم. 
                نظرات شما برای ما باارزش است 🌱
              </p>
            </div>
            <p className="support-email">
              پشتیبانی: <a href="mailto:h.pourali.a@gmail.com">h.pourali.a@gmail.com</a>
            </p>
          </div>
          {/* Logout Button */}
          {isLoggedIn && ( <button className="logout-button" onClick={handleLogout} title="خروج از حساب کاربری" > <LogOut size={16} /> خروج </button> )}

          {/* ==================== Other Modals ==================== */}
    
           {/* --- Payment Modal (Uses PaymentModal.js Component) --- */}
           {/* Note: We pass props to the dedicated component */}
           <PaymentModal
              isOpen={isPaymentModalOpen}
              onClose={() => setIsPaymentModalOpen(false)}
              onConfirm={handlePurchaseTopUp} // Triggers the Zarinpal confirmation
              selectedSessions={sessionCount}
              setSelectedSessions={setSessionCount}
           />
    
           {/* --- Zarinpal Confirmation Modal (Uses base styles) --- */}
           {isConfirmModalOpen && (
            <>
              <div className="modal-overlay" onClick={() => setIsConfirmModalOpen(false)} />
              <div className="modal confirm-modal">
                <div className="modal-content">
                  <h3>تأیید شارژ کیف پول</h3>
                  <p>
                    شما در حال شارژ کیف پول خود به مبلغ{' '}
                    <strong style={{color: '#19386a'}}>{(sessionCount * SESSION_PRICE).toLocaleString()} تومان</strong> هستید.
                  </p>
                  {discountedAmount && discountApplied ? (
                    <p>
                      با اعمال کد تخفیف، مبلغ قابل پرداخت:{' '}
                      <strong style={{color: '#28a745'}}>{discountedAmount.toLocaleString()} تومان</strong>
                    </p>
                  ) : null}
                  <div className="form-group" style={{marginTop: '15px'}}>
                    <label htmlFor="discountCode">کد تخفیف (اختیاری)</label>
                    <input
                      type="text"
                      id="discountCode"
                      value={discountCode}
                      onChange={(e) => setDiscountCode(e.target.value)}
                      placeholder="مثال: SAVE50"
                      disabled={isAuthLoading}
                      style={{width: '100%', padding: '8px', marginTop: '5px'}}
                    />
                  </div>
                  <p>برای تکمیل فرآیند به درگاه پرداخت زرین‌پال هدایت خواهید شد.</p>
                </div>
                <div className="modal-actions">
                  <button onClick={() => {
                    setIsConfirmModalOpen(false);
                    setDiscountCode('');
                    setDiscountApplied(false);
                    setDiscountedAmount(null);
                  }} className="cancel-button">
                    انصراف
                  </button>
                  <button onClick={initiatePayment} className="confirm-button" disabled={isAuthLoading}>
                    {isAuthLoading ? '...' : 'تایید و انتقال به درگاه'}
                  </button>
                </div>
              </div>
            </>
          )}
    
           {/* --- Direct Purchase Confirmation Modal (Uses base styles) --- */}
           {isPurchaseModalOpen && (
              <div className="modal-overlay" onClick={() => {if (!isAuthLoading) setIsPurchaseModalOpen(false)}}>
                <div className="modal confirm-modal" onClick={(e) => e.stopPropagation()}>
                  <div className="modal-content">
                    <h3>تأیید خرید جلسه</h3>
                    <p>آیا مایل به خرید یک جلسه ۲۰ دقیقه‌ای با کسر مبلغ <strong style={{color: '#19386a'}}>{SESSION_PRICE.toLocaleString()} تومان</strong> از کیف پول خود هستید؟</p>
                    <p style={{fontSize: '0.9em', color: '#555'}}>(موجودی فعلی: {walletBalance.toLocaleString()} تومان)</p>
                  </div>
                  <div className="modal-actions">
                    <button 
                      onClick={() => {if (!isAuthLoading) setIsPurchaseModalOpen(false)}} 
                      className="cancel-button" 
                      disabled={isAuthLoading}
                    >
                      انصراف
                    </button>
                    <button 
                      onClick={handleConfirmDirectPurchase} 
                      className="confirm-button" 
                      disabled={walletBalance < SESSION_PRICE || isAuthLoading}
                    >
                      {isAuthLoading ? '...' : (walletBalance < SESSION_PRICE ? 'موجودی کافی نیست' : 'بله، کسر کن')}
                    </button>
                  </div>
                </div>
              </div>
            )}
    
          {/* --- Start Session Confirmation Modal (Uses base styles) --- */}
          {isStartSessionModalOpen && (
            <>
              <div className="modal-overlay" onClick={() => {if (!isAuthLoading) setIsStartSessionModalOpen(false)}} />
              <div className="modal confirm-modal" onClick={(e) => e.stopPropagation()}>
                <div className="modal-content">
                    <h3>شروع جلسه گفتگو</h3>
                    <p>شما دارای زمان مکالمه هستید یا می‌توانید از چت رایگان استفاده کنید.</p>
                    <p>آیا مایلید یک جلسه جدید را شروع کنید؟</p>
                </div>
                <div className="modal-actions">
                     <button onClick={() => {if (!isAuthLoading) setIsStartSessionModalOpen(false)}} className="cancel-button" disabled={isAuthLoading}> فعلا نه </button>
                     <button onClick={handleConfirmStartSession} className="confirm-button" disabled={isAuthLoading}> {isAuthLoading ? '...' : 'بله، شروع کن'} </button>
                </div>
              </div>
            </>
          )}
    
           {/* --- Feedback Form Modal (Uses base styles + specific class) --- */}
           {showFeedbackForm && (
              <div className="modal-overlay" onClick={() => {if (!isFeedbackLoading) setShowFeedbackForm(false)}}>
                <div className="modal feedback-form-container" onClick={(e) => e.stopPropagation()}>
                    <div className="modal-content">
                      <h3>نظر شما در مورد دلیار</h3>
                      <p>نظرات شما به ما در بهبود دلیار کمک می‌کند.</p>
                      <form id="feedbackForm" onSubmit={handleFeedbackSubmit}>
                        <div className="star-rating"> {renderStars()} </div>
                        <textarea value={feedbackComment} onChange={(e) => setFeedbackComment(e.target.value)} placeholder="نظر خود را اینجا بنویسید..." rows="5" required disabled={isFeedbackLoading} />
                      </form>
                    </div>
                    <div className="modal-actions">
                      <button type="button" onClick={() => {if (!isFeedbackLoading) {setShowFeedbackForm(false); setFeedbackComment(''); setFeedbackRating(0);}}} disabled={isFeedbackLoading} className="cancel-button"> انصراف </button>
                      {/* Submit button triggers the form */}
                      <button type="submit" form="feedbackForm" disabled={isFeedbackLoading} className="confirm-button" style={{backgroundColor: '#28a745'}}> {isFeedbackLoading ? '...' : 'ارسال نظر'} </button>
                    </div>
                </div>
              </div>
           )}
    
           {/* --- Profile Update Modal (Uses base styles + specific class) --- */}
           {showProfileForm && isLoggedIn && (
                <div className="modal-overlay" onClick={() => { if (!isProfileLoading) { setShowProfileForm(false); setProfileError(''); } }}>
                    <div className="modal profile-modal" onClick={(e) => e.stopPropagation()}>
                      <div className="modal-content">
                        <h3>تکمیل / ویرایش پروفایل</h3>
                        <p>ارائه این اطلاعات به دلیار کمک می‌کند تا شما را بهتر درک کند.</p>
                        <form id="profileForm" onSubmit={handleProfileSubmit}>
                            <div className="form-group"> <label htmlFor="name">نام (اختیاری)</label> <input type="text" id="name" name="name" value={profileData.name} onChange={handleProfileInputChange} placeholder="نامی که دوست دارید دلیار شما را صدا بزند" disabled={isProfileLoading} maxLength="100"/> </div>
                            <div className="form-group"> <label htmlFor="gender">جنسیت (اختیاری)</label> <select id="gender" name="gender" value={profileData.gender} onChange={handleProfileInputChange} disabled={isProfileLoading}> <option value="">انتخاب کنید...</option> <option value="زن">زن</option> <option value="مرد">مرد</option> <option value="ترجیح می‌دهم نگویم">ترجیح می‌دهم نگویم</option> <option value="دیگر">دیگر</option> </select> </div>
                            <div className="form-group"> <label htmlFor="age">سن (اختیاری)</label> <input type="text" id="age" name="age" value={profileData.age} onChange={handleProfileInputChange} placeholder="مثال: 32" disabled={isProfileLoading} /> </div>
                            <div className="form-group"> <label htmlFor="education">تحصیلات (اختیاری)</label> <input type="text" id="education" name="education" value={profileData.education} onChange={handleProfileInputChange} placeholder="مثال: کارشناسی روانشناسی" disabled={isProfileLoading} /> </div>
                            <div className="form-group"> <label htmlFor="job">شغل (اختیاری)</label> <input type="text" id="job" name="job" value={profileData.job} onChange={handleProfileInputChange} placeholder="مثال: دانشجو، کارمند، ..." disabled={isProfileLoading} /> </div>
                            <div className="form-group"> <label htmlFor="disorder">ملاحظات سلامتی/روانی (اختیاری)</label> <textarea id="disorder" name="disorder" value={profileData.disorder} onChange={handleProfileInputChange} rows="3" placeholder="اگر نکته خاصی در مورد سلامت جسمی یا روانی خود دارید که مایلید دلیار بداند..." disabled={isProfileLoading}></textarea> </div>
                            {profileError && <p className="error-message">{profileError}</p>}
                        </form>
                      </div>
                      <div className="modal-actions">
                        <button type="button" onClick={() => { if (!isProfileLoading) { setShowProfileForm(false); setProfileError(''); } }} className="cancel-button" disabled={isProfileLoading}> بستن </button>
                        <button type="submit" form="profileForm" disabled={isProfileLoading} className="confirm-button"> {isProfileLoading ? 'در حال ذخیره...' : 'ذخیره تغییرات'} </button>
                      </div>
                    </div>
                </div>
            )} {/* End Profile Modal */}
    
          {/* --- Emergency Contact (SOS Button) --- */}
          <EmergencyContact />
    
        </div> // End start-page div
      );
      // --- End of return statement ---
    };
    

export default StartPage;