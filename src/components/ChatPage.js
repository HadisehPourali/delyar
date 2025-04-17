import React, { useState, useEffect, useRef, useCallback } from 'react';
import axios from 'axios';
import ReactMarkdown from 'react-markdown';
import { useNavigate, useLocation } from 'react-router-dom';
import { Mic, MicOff, Send } from 'lucide-react';
import './ChatPage.css';
import './PaymentModal.css';

const API_URL = process.env.REACT_APP_API_URL;

const MessageBubble = ({ content, sender, type }) => {
  if (type === 'SYSTEM' || type === 'NAMING_PROMPT') return null;
  
  // Handle content more carefully
  // Don't manipulate content unless absolutely necessary
  const displayContent = sender === 'user'
    ? (content || '').replace(/\[یادداشت سیستمی:.*?\]\n\nپیام کاربر:\s*/, '')
    : (content || '');
    
  // Only return null if there's truly nothing to display
  if (!displayContent && displayContent !== 0) return null;
  
  return (
    <div className={`message-container ${sender}-container`}>
      <div className={`message-bubble ${sender}`} style={{ fontFamily: 'Vazirmatn', textAlign: 'right', direction: 'rtl' }}>
        <ReactMarkdown>{String(displayContent)}</ReactMarkdown>
      </div>
    </div>
  );
};

const ChatPage = () => {
  const navigate = useNavigate();
  const location = useLocation();

  // --- State ---
  const [messages, setMessages] = useState([]);
  const [userInput, setUserInput] = useState('');
  const [sessionId, setSessionId] = useState(location.state?.sessionId || null);
  const [isWaitingForResponse, setIsWaitingForResponse] = useState(false);
  const [remainingTime, setRemainingTime] = useState(0);
  const [walletBalance, setWalletBalance] = useState(0);
  const [isPurchaseModalOpen, setIsPurchaseModalOpen] = useState(false);
  const [message, setMessage] = useState(null);
  const [isRecording, setIsRecording] = useState(false);
  const [showRecordingText, setShowRecordingText] = useState(false);
  const [availableMinutes, setAvailableMinutes] = useState(0); // New state for purchased minutes
  const [showNextSessionPrompt, setShowNextSessionPrompt] = useState(false); // Prompt for next session

  // --- Refs ---
  const chatBoxRef = useRef(null);
  const inputRef = useRef(null);
  const messageTimeoutRef = useRef(null);
  const userHasScrolledUpRef = useRef(false);
  const intervalRef = useRef(null);
  const mediaRecorderRef = useRef(null);
  const audioChunksRef = useRef([]);
  const isInitialMount = useRef(true);
  const streamingIntervalRef = useRef(null);

  const SESSION_PRICE = parseInt(process.env.REACT_APP_SESSION_PRICE, 10) || 39000;

  // --- Helper Functions ---
  const showStatusMessage = useCallback((msg, duration = 4000, type = 'info') => {
    setMessage({ text: msg, type });
    if (messageTimeoutRef.current) clearTimeout(messageTimeoutRef.current);
    messageTimeoutRef.current = setTimeout(() => setMessage(null), duration);
  }, []);

  const filterMessages = (msgs) => {
    const promptStart = 'با توجه به متن گفتگوی زیر، یک عنوان کوتاه و مناسب';
    const systemNotePattern = /\[یادداشت سیستمی برای دلیار:.*?\]\n\nپیام کاربر:\s*/;
    const filtered = [];
    for (let i = 0; i < msgs.length; i++) {
      const currentMsg = msgs[i];
      const isNamingPrompt = currentMsg.type === 'NAMING_PROMPT' || (currentMsg.content && currentMsg.content.startsWith(promptStart));
      if (isNamingPrompt) continue;
      const isTitleResponse = currentMsg.type === 'AI' && i + 1 < msgs.length && (msgs[i + 1].type === 'NAMING_PROMPT' || (msgs[i + 1].content && msgs[i + 1].content.startsWith(promptStart)));
      if (isTitleResponse) continue;
      if (currentMsg.type === 'USER' && systemNotePattern.test(currentMsg.content)) {
        const userContent = currentMsg.content.replace(systemNotePattern, '').trim();
        filtered.push({ ...currentMsg, content: userContent });
        continue;
      }
      filtered.push(currentMsg);
    }
    return filtered;
  };

  const handleInputChange = (e) => {
    // Store input value exactly as entered
    const inputValue = e.target.value;
    setUserInput(inputValue);
  };

  const scrollToBottom = () => {
    if (chatBoxRef.current) {
      chatBoxRef.current.scrollTo({ top: chatBoxRef.current.scrollHeight, behavior: 'smooth' });
    }
  };

  const hasScrolledUp = () => {
    if (!chatBoxRef.current) return false;
    const { scrollTop, scrollHeight, clientHeight } = chatBoxRef.current;
    return scrollHeight - scrollTop - clientHeight > 100;
  };

  const simulateResponseStreaming = useCallback((botMessageId, fullResponse) => {
    let currentIndex = 0;
    const chunkSize = 1; // Number of characters per chunk
    const streamingDelay = 35; // Milliseconds between chunks
    
    const streamInterval = setInterval(() => {
      if (currentIndex < fullResponse.length) {
        // Calculate next chunk end position
        const nextIndex = Math.min(currentIndex + chunkSize, fullResponse.length);
        const currentContent = fullResponse.substring(0, nextIndex);
        
        // Update message with current chunk
        setMessages(prevMessages => {
          return prevMessages.map(msg => 
            msg.id === botMessageId 
              ? { ...msg, content: currentContent }
              : msg
          );
        });
        
        currentIndex = nextIndex;
      } else {
        // Streaming complete
        clearInterval(streamInterval);
      }
    }, streamingDelay);
    
    // Store interval reference to clear it if needed
    return streamInterval;
  }, []);

  // Update the sendMessage function with improved content handling
  const sendMessage = useCallback(async (contentOverride = null) => {
    // Create a stable copy of the message content immediately
    const textToSend = contentOverride !== null ? String(contentOverride).trim() : String(userInput);
    
    console.log(`sendMessage called: text='${textToSend}', sessionId='${sessionId}', remainingTime=${remainingTime}`);
  
    if (!textToSend || !sessionId) {
        console.log('sendMessage aborted: Missing text or sessionId');
        if (contentOverride && isWaitingForResponse) setIsWaitingForResponse(false);
        return;
    }
  
    if (remainingTime <= 0 && !contentOverride) {
        showStatusMessage("زمان شما تمام شده.", 4000, 'error');
        console.log('sendMessage aborted: Time up for manual message');
        return;
    }
  
    // Store exact content in a stable variable to ensure consistency
    const exactUserMessage = textToSend;
    
    setIsWaitingForResponse(true);
    
    // Create user message with the exact content
    const newUserMessage = { 
        sender: 'user', 
        content: exactUserMessage,
        type: 'USER',
        timestamp: new Date().toISOString()
    };
    
    // Update messages state with complete user message
    setMessages(prevMessages => [...prevMessages, newUserMessage]);
    
    // Add bot message with empty content to start streaming
    const botMessageId = `bot-${Date.now()}`;
    setMessages(prevMessages => [...prevMessages, { 
        id: botMessageId,
        sender: 'bot', 
        content: '', 
        type: 'AI', 
        timestamp: new Date().toISOString()
    }]);
    
    // Clear input only after message is added to state
    if (!contentOverride) setUserInput('');
    userHasScrolledUpRef.current = false;
  
    try {
        const firstUserMessage = messages.filter(msg => msg.type === 'USER').length === 0;
        
        // Use the exact stored message in the API call
        const response = await axios.post(`${API_URL}/respond`, {
          sessionId,
          content: exactUserMessage,
          isFirstMessage: firstUserMessage,
          messageType: 'USER'
      });
  
        if (streamingIntervalRef.current) {
            clearInterval(streamingIntervalRef.current);
        }
        streamingIntervalRef.current = simulateResponseStreaming(botMessageId, response.data.content);

    } catch (error) {
        console.error('Error sending message:', error.response?.data || error.message);
        const errorData = error.response?.data;
        showStatusMessage(errorData?.error || 'خطا در ارسال پیام', 5000, 'error');
        
        // Remove bot message on error
        setMessages(prevMessages => 
            prevMessages.filter(msg => msg.id !== botMessageId)
        );
  
        if (errorData?.session_ended) {
            setRemainingTime(0);
            if (intervalRef.current) {
                clearInterval(intervalRef.current);
                intervalRef.current = null;
            }
        }
    } finally {
        setIsWaitingForResponse(false);
    }
  }, [sessionId, showStatusMessage, API_URL, remainingTime, messages, userInput]);

  // --- New Function: Check and Start Next Session ---
  const handleStartNextSession = async () => {
    setShowNextSessionPrompt(false);
    try {
      const response = await axios.post(`${API_URL}/api/chat/start-session`);
      const data = response.data;
      if (data.remaining_time > 0) {
        setRemainingTime(data.remaining_time);
        setAvailableMinutes(prev => prev - 20); // Assume 20-minute session
        showStatusMessage('جلسه جدید شما آغاز شد.', 4000, 'success');

        // Restart the timer
        if (intervalRef.current) clearInterval(intervalRef.current);
        intervalRef.current = setInterval(() => {
          setRemainingTime(prev => {
            if (prev <= 1) {
              clearInterval(intervalRef.current);
              intervalRef.current = null;
              checkForNextSession();
              return 0;
            }
            return prev - 1;
          });
        }, 1000);
      } else {
        showStatusMessage(data.error || 'خطا در شروع جلسه جدید', 5000, 'error');
      }
    } catch (error) {
      console.error('Error starting next session:', error.response?.data || error.message);
      showStatusMessage(error.response?.data?.error || 'خطا در شروع جلسه جدید', 5000, 'error');
    }
  };

  // --- New Function: Check Available Sessions ---
  const checkForNextSession = useCallback(async () => {
    try {
      const response = await axios.get(`${API_URL}/api/chat/check-access`);
      const data = response.data;
      setAvailableMinutes(data.available_minutes || 0);
      if (data.remaining_time <= 0 && data.available_minutes >= 20) {
        setShowNextSessionPrompt(true);
      } else if (data.remaining_time <= 0) {
        showStatusMessage('زمان چت شما به پایان رسیده و جلسه دیگری در دسترس نیست.', 6000, 'warning');
      }
    } catch (error) {
      console.error('Error checking access:', error);
      showStatusMessage('خطا در بررسی وضعیت جلسه', 5000, 'error');
    }
  }, [navigate, showStatusMessage]);

  // --- Initialization and Timer Effect ---
  useEffect(() => {
    console.log("--- ChatPage Initialization useEffect ---");
    const currentSessionId = location.state?.sessionId;
    const initialTimeFromLocation = isInitialMount.current ? location.state?.initialRemainingTime : undefined;

    if (!currentSessionId) {
      showStatusMessage("خطای جلسه...", 5000, 'error');
      setTimeout(() => navigate('/start'), 2500);
      return;
    }
    setSessionId(currentSessionId);

    const fetchBalanceAndHistory = async () => {
      try {
        const balanceRes = await axios.get(`${API_URL}/api/wallet/balance`);
        setWalletBalance(balanceRes.data.balance);
        const accessRes = await axios.get(`${API_URL}/api/chat/check-access`);
        setAvailableMinutes(accessRes.data.available_minutes || 0);
      } catch (e) { console.error('Error fetching balance/access:', e); }
      try {
        const res = await axios.get(`${API_URL}/api/chat/sessions/${currentSessionId}`);
        if (res.data?.messages?.length) {
          setMessages(filterMessages(res.data.messages).sort((a, b) => new Date(a.timestamp) - new Date(b.timestamp)).map(msg => ({
            sender: msg.type?.toLowerCase() === 'user' ? 'user' : 'bot',
            content: msg.content || '',
            type: msg.type || (msg.sender === 'user' ? 'USER' : 'AI')
          })));
        } else {
          setMessages([]);
        }
      } catch (e) {
        console.error('Error fetching history:', e);
        showStatusMessage('خطا بارگذاری تاریخچه', 5000, 'error');
      }
    };

    const checkAccessAndSetupTimer = async () => {
      let timeToStart = 0;
      if (isInitialMount.current && initialTimeFromLocation !== undefined && initialTimeFromLocation > 0) {
        timeToStart = initialTimeFromLocation;
        setRemainingTime(timeToStart);
      } else {
        try {
          const response = await axios.get(`${API_URL}/api/chat/check-access`);
          if (response.data.access && response.data.session_active) {
            timeToStart = response.data.remaining_time;
            setRemainingTime(timeToStart);
            setAvailableMinutes(response.data.available_minutes || 0);
          } else {
            setRemainingTime(0);
            setAvailableMinutes(response.data.available_minutes || 0);
            if (!isInitialMount.current) {
              showStatusMessage(response.data.message || "جلسه فعال نیست.", 8000, 'warning');
            }
          }
        } catch (error) {
          console.error("Error checking access:", error);
          setRemainingTime(0);
          if (error.response?.status === 401) navigate('/');
          else showStatusMessage("خطا در بررسی وضعیت جلسه.", 5000, 'error');
        }
      }

      if (intervalRef.current) clearInterval(intervalRef.current);
      if (timeToStart > 0) {
        intervalRef.current = setInterval(() => {
          setRemainingTime(prev => {
            if (prev <= 1) {
              clearInterval(intervalRef.current);
              intervalRef.current = null;
              checkForNextSession();
              return 0;
            }
            console.log('Timer tick, remainingTime:', prev - 1);
            return prev - 1;
          });
        }, 1000);
      } else {
        checkForNextSession(); // Check immediately if no time
      }
    };

    fetchBalanceAndHistory();
    checkAccessAndSetupTimer();

    isInitialMount.current = false;

    return () => {
      console.log("--- ChatPage Cleanup ---");
      if (intervalRef.current) clearInterval(intervalRef.current);
      if (messageTimeoutRef.current) clearTimeout(messageTimeoutRef.current);
      if (streamingIntervalRef.current) clearInterval(streamingIntervalRef.current);
    };
  }, [location.state?.sessionId, navigate, showStatusMessage, checkForNextSession]);

  useEffect(() => {
    const handleScroll = () => { userHasScrolledUpRef.current = hasScrolledUp(); };
    const chatBox = chatBoxRef.current;
    if (chatBox) chatBox.addEventListener('scroll', handleScroll);
    return () => { if (chatBox) chatBox.removeEventListener('scroll', handleScroll); };
  }, []);

  useEffect(() => {
    if (!chatBoxRef.current) return;
    const lastMessage = messages[messages.length - 1];
    const isUserMessage = lastMessage?.sender === 'user';
    if (isUserMessage || !userHasScrolledUpRef.current) {
      requestAnimationFrame(scrollToBottom);
    }
    if (!isWaitingForResponse && inputRef.current && remainingTime > 0 && !isRecording) {
      inputRef.current.focus();
    }
  }, [messages, isWaitingForResponse, remainingTime, isRecording]);

  const handleConfirmPurchase = async () => {
    setMessage('');
    setIsPurchaseModalOpen(false);
    setIsWaitingForResponse(true);
    try {
      const response = await axios.post(`${API_URL}/api/chat/purchase-session`);
      showStatusMessage(response.data.message, 5000, 'success');
      setWalletBalance(response.data.balance);
      setAvailableMinutes(response.data.available_minutes || 0);
      if (remainingTime <= 0) checkForNextSession(); // Check if we can prompt now
    } catch (error) {
      console.error('Purchase error:', error);
      showStatusMessage(error.response?.data?.error || 'خطا در خرید جلسه', 5000, 'error');
    } finally {
      setIsWaitingForResponse(false);
    }
  };

  const handleTopUpRedirect = () => {
    showStatusMessage("به صفحه شروع هدایت می‌شوید...", 3000);
    navigate('/start', { state: { openPaymentModal: true } });
  };

  const sendAudioToBackend = useCallback(async (audioBlob) => {
    try {
      const formData = new FormData();
      formData.append('file', audioBlob, 'recording.wav');
      const response = await axios.post(`${API_URL}/api/stt/transcribe`, formData, {
        withCredentials: true,
        headers: { 'Content-Type': 'multipart/form-data' },
        timeout: 60000
      });
      const transcription = response.data.transcription;
      if (transcription) {
        showStatusMessage('متن دریافت شد، در حال ارسال...', 2000, 'success');
        await sendMessage(transcription);
      } else {
        showStatusMessage('متن قابل تشخیصی دریافت نشد.', 4000, 'warning');
        setIsWaitingForResponse(false);
      }
    } catch (error) {
      console.error('Error in STT request:', error);
      showStatusMessage(error.response?.data?.error || 'خطا در پردازش فایل صوتی', 5000, 'error');
      setIsWaitingForResponse(false);
    } finally {
      audioChunksRef.current = [];
    }
  }, [API_URL, showStatusMessage, sendMessage]);

  const startRecording = useCallback(async () => {
    if (isWaitingForResponse || remainingTime <= 0) return;
    try {
      setIsRecording(true);
      setShowRecordingText(true);
      audioChunksRef.current = [];
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const options = { mimeType: 'audio/webm' };
      if (!MediaRecorder.isTypeSupported(options.mimeType)) delete options.mimeType;
      mediaRecorderRef.current = new MediaRecorder(stream, options);
      mediaRecorderRef.current.ondataavailable = (event) => {
        if (event.data.size > 0) audioChunksRef.current.push(event.data);
      };
      mediaRecorderRef.current.onstop = () => {
        stream.getTracks().forEach((track) => track.stop());
        if (audioChunksRef.current.length === 0) {
          showStatusMessage('هیچ صدایی ضبط نشد.', 3000, 'warning');
          setIsWaitingForResponse(false);
          return;
        }
        const audioBlob = new Blob(audioChunksRef.current, { type: mediaRecorderRef.current.mimeType || 'audio/wav' });
        sendAudioToBackend(audioBlob);
      };
      mediaRecorderRef.current.start();
    } catch (error) {
      console.error('Error starting recording:', error);
      setIsRecording(false);
      setShowRecordingText(false);
      showStatusMessage('خطا در شروع ضبط صدا: ' + error.message, 5000, 'error');
      setIsWaitingForResponse(false);
    }
  }, [isWaitingForResponse, remainingTime, showStatusMessage, sendAudioToBackend]);

  const stopRecording = useCallback(() => {
    if (mediaRecorderRef.current && isRecording) {
      setIsWaitingForResponse(true);
      mediaRecorderRef.current.stop();
      setIsRecording(false);
      setShowRecordingText(false);
      showStatusMessage('در حال پردازش فایل صوتی...', 4000, 'info');
    }
  }, [isRecording, showStatusMessage]);

  const handleKeyDown = (e) => {
    if (e.key === 'Enter' && !e.shiftKey && !isWaitingForResponse && remainingTime > 0 && userInput.trim() && !isRecording) {
      e.preventDefault();
      sendMessage();
    }
  };

  const getMessageClass = (type) => {
    switch (type) {
      case 'error': return 'message-display error';
      case 'success': return 'message-display success';
      case 'warning': return 'message-display warning';
      default: return 'message-display info';
    }
  };

  return (
    <div className="chat-page">
      <div className="chat-header">
        <div className="wallet-info">
          <span className="wallet-balance" title="موجودی کیف پول">موجودی: {walletBalance?.toLocaleString() || 0} تومان</span>
          <button className="topup-button" onClick={handleTopUpRedirect} title="شارژ کیف پول">شارژ کیف پول</button>
          <button className="purchase-session-button topup-button" onClick={() => setIsPurchaseModalOpen(true)} title="خرید جلسه">خرید جلسه</button>
        </div>
      </div>
      {message && (
        <div id="status-message-display" className={getMessageClass(message.type)}>
          {message.text}
        </div>
      )}
      <div className="session-info">
        <p>زمان باقی‌مانده: {Math.floor(remainingTime / 60)}:{(remainingTime % 60).toString().padStart(2, '0')}</p>
        {availableMinutes > 0 && (
          <p>دقایق موجود: {availableMinutes}</p>
        )}
      </div>
      {isPurchaseModalOpen && (
        <>
          <div className="modal-overlay" onClick={() => { if (!isWaitingForResponse) setIsPurchaseModalOpen(false) }} />
          <div className="modal purchase-modal payment-modal" onClick={(e) => e.stopPropagation()}>
            <h3>تأیید خرید جلسه</h3>
            <p>آیا مایل به خرید یک جلسه ۲۰ دقیقه‌ای با کسر مبلغ <strong style={{ color: '#19386a' }}>{SESSION_PRICE.toLocaleString()} تومان</strong> از کیف پول هستید؟</p>
            <p style={{ fontSize: '0.9em', color: '#555' }}>(موجودی فعلی: {walletBalance.toLocaleString()} تومان)</p>
            <div className="modal-actions" style={{ marginTop: '20px' }}>
              <button onClick={() => { if (!isWaitingForResponse) setIsPurchaseModalOpen(false) }} className="cancel-button" disabled={isWaitingForResponse}>انصراف</button>
              <button onClick={handleConfirmPurchase} className="confirm-button" disabled={walletBalance < SESSION_PRICE || isWaitingForResponse}>
                {isWaitingForResponse ? '...' : (walletBalance < SESSION_PRICE ? 'موجودی کافی نیست' : 'بله، کسر کن')}
              </button>
            </div>
          </div>
        </>
      )}
      {showNextSessionPrompt && (
        <>
          <div className="modal-overlay" onClick={() => setShowNextSessionPrompt(false)} />
          <div className="modal confirm-modal" onClick={(e) => e.stopPropagation()}>
            <h3>شروع جلسه بعدی</h3>
            <p>زمان جلسه فعلی شما به پایان رسیده است.</p>
            <p>شما هنوز {availableMinutes} دقیقه گفتگوی خریداری‌شده دارید. آیا می‌خواهید هم‌اکنون جلسه بعدی را شروع کنید؟</p>
            <div className="modal-actions">
              <button onClick={() => { setShowNextSessionPrompt(false); navigate('/start'); }} className="cancel-button">خیر، بعداً</button>
              <button onClick={handleStartNextSession} className="confirm-button">بله، الان شروع کن</button>
            </div>
          </div>
        </>
      )}
      <div className="chat-container">
        <div className="chat-box" ref={chatBoxRef}>
          {messages.map((msg, index) => (
            <MessageBubble key={`${sessionId}-${index}`} content={msg.content} sender={msg.sender} type={msg.type} />
          ))}
          {isWaitingForResponse && messages[messages.length - 1]?.isLoading && (
            <div className="message-container bot-container">
              <div className="message-bubble bot typing-indicator">
                <div className="dot"></div><div className="dot"></div><div className="dot"></div>
              </div>
            </div>
          )}
        </div>
        <div className="input-section">
          <div className="record-button-wrapper">
            <button
              onClick={isRecording ? stopRecording : startRecording}
              className={`record-button ${isRecording ? 'recording' : ''}`}
              disabled={isWaitingForResponse || remainingTime <= 0}
              title={isRecording ? "پایان ضبط" : "ضبط صدا"}
            >
              {isRecording ? <MicOff size={20} /> : <Mic size={20} />}
            </button>
            {showRecordingText && <span className="recording-text">ضبط...</span>}
          </div>
          <input
            ref={inputRef}
            type="text"
            value={userInput}
            onChange={handleInputChange}
            onKeyDown={handleKeyDown}
            placeholder={
              remainingTime <= 0 ? 'زمان شما تمام شده.' :
              isWaitingForResponse ? 'لطفا منتظر پاسخ بمانید...' :
              isRecording ? 'در حال ضبط صدا...' :
              'پیام خود را بنویسید...'
            }
            disabled={isWaitingForResponse || remainingTime <= 0 || isRecording}
            style={{ fontFamily: 'Vazirmatn', direction: 'rtl' }}
            aria-label="متن پیام"
          />
          <button
            onClick={() => sendMessage()}
            className="send-button"
            disabled={isWaitingForResponse || remainingTime <= 0 || !userInput.trim() || isRecording}
            title="ارسال پیام"
          >
            <Send size={18} />
          </button>
        </div>
      </div>
    </div>
  );
};

export default ChatPage;