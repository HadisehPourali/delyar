import React, { useState, useEffect, useRef } from 'react';
import axios from 'axios';
import ReactMarkdown from 'react-markdown';
import { useNavigate } from 'react-router-dom';
import { Mic, MicOff, X as CloseIcon } from 'lucide-react';
import './ChatPage.css';

const API_URL = process.env.REACT_APP_API_URL || 'http://127.0.0.1:5000';
const STT_API_URL = "https://partai.gw.isahab.ir/speechRecognition/v1/base64";
const STT_API_TOKEN = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzeXN0ZW0iOiJzYWhhYiIsImNyZWF0ZVRpbWUiOiIxNDAzMDgwNzEwMDE0NDQ1MCIsInVuaXF1ZUZpZWxkcyI6eyJ1c2VybmFtZSI6IjcxY2Q2NDY0LTUzZDQtNDM1NC05MmVmLWY5YjgxMWMzODE4NSJ9LCJkYXRhIjp7InNlcnZpY2VJRCI6IjlmMjE1NjVjLTcxZmEtNDViMy1hZDQwLTM4ZmY2YTZjNWM2OCIsInJhbmRvbVRleHQiOiJOakg5SSJ9LCJncm91cE5hbWUiOiI0ZTk1YmQ3YjI3ZDQ3Y2FlNGMwNzBkZWIwZTM5Zjc4MSJ9.84iz0OQaxTjLs_x3WIm-jbJoVpdaQcIvcdU4BuSXl0k";

const NotificationBox = ({ message, onClose }) => {
  return (
    <div
      style={{
        position: 'fixed',
        bottom: '25%', // Changed from '20px' to '25%' to position it 75% down the page
        left: '50%',
        transform: 'translateX(-50%)',
        backgroundColor: '#9ecedb',
        padding: '12px 24px',
        borderRadius: '8px',
        boxShadow: '0 2px 10px rgba(0, 0, 0, 0.1)',
        display: 'flex',
        alignItems: 'center',
        gap: '12px',
        zIndex: 1000,
        fontFamily: 'Vazirmatn',
        direction: 'rtl',
        animation: 'slideIn 0.3s ease-out' // Added smooth entrance animation
      }}
    >
      <span style={{ color: '#19386a' }}>{message}</span>
      <button
        onClick={onClose}
        style={{
          background: 'none',
          border: 'none',
          padding: '4px',
          cursor: 'pointer',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center'
        }}
      >
        <CloseIcon size={18} color="#19386a" />
      </button>
    </div>
  );
};

const styleTag = document.createElement('style');
styleTag.textContent = `
  @keyframes slideIn {
    from {
      opacity: 0;
      transform: translate(-50%, 20px);
    }
    to {
      opacity: 1;
      transform: translate(-50%, 0);
    }
  }
`;
document.head.appendChild(styleTag);

const MessageBubble = ({ content, sender }) => {

  return (
    <div 
      className={`message-bubble ${sender}`}
      style={{ 
        fontFamily: 'Vazirmatn', 
        textAlign: 'right', 
        direction: 'rtl'
      }}
    >
      <ReactMarkdown
        components={{
          p: ({ node, ...props }) => (
            <p style={{ margin: '0.5em 0' }} {...props} />
          ),
          strong: ({ node, ...props }) => (
            <strong style={{ fontWeight: 'bold' }} {...props} />
          ),
          em: ({ node, ...props }) => (
            <em style={{ fontStyle: 'italic' }} {...props} />
          ),
          br: () => <br />,
        }}
      >
        {content}
      </ReactMarkdown>
    </div>
    
  );
};

const ChatPage = () => {
  const navigate = useNavigate();
  const [messages, setMessages] = useState([]);
  const [sttTriggered, setSttTriggered] = useState(false);
  const [userInput, setUserInput] = useState("");
  const [isRecording, setIsRecording] = useState(false);
  const [sessionId, setSessionId] = useState(null);
  const [showRecordingText, setShowRecordingText] = useState(false);
  const [hasShownFilterWarning, setHasShownFilterWarning] = useState(false);
  const [showNotification, setShowNotification] = useState(false);
  const mediaRecorderRef = useRef(null);
  const audioChunksRef = useRef([]);
  const botId = '7783af83-6fbf-404c-93e6-89c01daaa9f9';
  const chatBoxRef = useRef(null);
  const messagesEndRef = useRef(null);


  useEffect(() => {
    const userData = localStorage.getItem('userData');
    if (!userData) {
      navigate('/');
      return;
    }

    // Check if we've shown the filter warning before
    const hasShownWarning = localStorage.getItem('hasShownFilterWarning');
    setHasShownFilterWarning(!!hasShownWarning);

    const createSession = async () => {
      try {
        const userData = JSON.parse(localStorage.getItem('userData') || '{}');
        const response = await axios.post(`${API_URL}/create-session`, { botId, username: userData.username || null });
        setSessionId(response.data.id);
      } catch (error) {
        console.error('Error creating session:', error);
        navigate('/');
      }
    };
    createSession();
  }, [navigate]);

  useEffect(() => {
    if (sttTriggered && userInput.trim() !== "") {
      sendMessage();
      setSttTriggered(false);
    }
  }, [userInput, sttTriggered]);

  const handleLogout = () => {
    localStorage.removeItem('userData');
    navigate('/');
  };

  const streamBotResponse = (botResponse) => {
    let index = -1;
    const streamInterval = setInterval(() => {
      if (index < botResponse.length - 1) {
        setMessages(prevMessages => [
          ...prevMessages.slice(0, -1),
          { sender: 'bot', content: prevMessages[prevMessages.length - 1].content + botResponse[index] }
        ]);
        index += 1;
      } else {
        clearInterval(streamInterval);
      }
    }, 25);
  };

  const sendMessage = async () => {
    if (!userInput.trim() || !sessionId) return;
    const newMessages = [...messages, { sender: 'user', content: userInput.trim() }];
    setMessages([...newMessages, { sender: 'bot', content: '' }]);
    setUserInput('');

    try {
      const userData = JSON.parse(localStorage.getItem('userData') || '{}');
      const response = await axios.post(`${API_URL}/respond`, { 
        sessionId, 
        content: userInput.trim(), 
        username: userData.username || null 
      });
      streamBotResponse(response.data.content);
    } catch (error) {
      console.error('Error sending message:', error);
    }
  };

  const handleKeyDown = (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      sendMessage();
    }
  };

  const startRecording = async () => {
    try {
      console.log('Starting recording...');
      setIsRecording(true);
      setShowRecordingText(true);
      
      // Show filter warning if it's the first time
      if (!hasShownFilterWarning) {
        setShowNotification(true);
        localStorage.setItem('hasShownFilterWarning', 'true');
        setHasShownFilterWarning(true);
      }

      audioChunksRef.current = [];
      
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      mediaRecorderRef.current = new MediaRecorder(stream);
      
      mediaRecorderRef.current.ondataavailable = (event) => {
        audioChunksRef.current.push(event.data);
      };

      mediaRecorderRef.current.onstop = async () => {
        const audioBlob = new Blob(audioChunksRef.current, { type: 'audio/wav' });
        const base64Audio = await convertBlobToBase64(audioBlob);
        sendAudioToSTT(base64Audio);
        
        stream.getTracks().forEach(track => track.stop());
      };
      
      mediaRecorderRef.current.start();
    } catch (error) {
      console.error('Error starting recording:', error);
      setIsRecording(false);
      setShowRecordingText(false);
    }
  };


  const stopRecording = () => {
    if (mediaRecorderRef.current && isRecording) {
      setIsRecording(false);
      setShowRecordingText(false);
      mediaRecorderRef.current.stop();
    }
  };

  const convertBlobToBase64 = (blob) => {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.readAsDataURL(blob);
      reader.onloadend = () => resolve(reader.result.split(",")[1]);
      reader.onerror = (error) => reject(error);
    });
  };

  const sendAudioToSTT = async (base64Audio) => {
    try {
      const payload = {
        language: "fa",
        data: base64Audio
      };
      const headers = {
        'gateway-token': STT_API_TOKEN,
        'Content-Type': 'application/json'
      };
      
      console.log('Sending request to STT API...');
      const response = await axios.post(STT_API_URL, payload, { headers });
      console.log("Full response data:", response.data);
      
      const resultText = response.data.data?.data?.result;
      console.log("Transcription Result:", resultText);
      
      if (resultText) {
        setUserInput(resultText);
        setSttTriggered(true);
      }
    } catch (error) {
      console.error("Error in STT API:", error);
    }
  };

  useEffect(() => {
    if (messagesEndRef.current) {
      messagesEndRef.current.scrollIntoView({ behavior: 'smooth' });
    }
  }, [messages]);

  return (
    <div className="chat-page">
      <div className="chat-header">
        <button onClick={handleLogout} className="logout-button" style={{
          position: 'absolute', 
          top: '1rem', 
          left: '1rem', 
          padding: '0.5rem 1rem',
          backgroundColor: '#9ecedb', 
          border: 'none', 
          borderRadius: '20px', 
          cursor: 'pointer', 
          fontFamily: 'Vazirmatn'
        }}>
          خروج
        </button>
      </div>
      <div className="chat-container">
        <div className="chat-box" ref={chatBoxRef}>
          {messages.map((msg, index) => (
            <div key={index} className={`message-container ${msg.sender}-container`}>
              <MessageBubble content={msg.content} sender={msg.sender} />
            </div>
          ))}
          <div ref={messagesEndRef} />
        </div>
        <div className="input-section">
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
            <button 
              onClick={isRecording ? stopRecording : startRecording}
              className="record-button"
              style={{
                color: '#19386a',
                background: 'none',
                border: 'none',
                cursor: 'pointer',
                padding: '8px',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                borderRadius: '50%',
                backgroundColor: isRecording ? '#1dbd72' : 'transparent',
                transition: 'all 0.3s ease'
              }}
            >
              {isRecording ? (
                <MicOff className="w-6 h-6 text-white" />
              ) : (
                <Mic className="w-6 h-6 text-gray-600 hover:text-gray-800" />
              )}
            </button>
            {showRecordingText && (
              <span style={{ 
                color: '#1dbd72', 
                fontSize: '12px', 
                marginTop: '4px',
                fontFamily: 'Vazirmatn'
              }}>
                در حال ضبط...
              </span>
            )}
          </div>
          <input
            style={{ 
              fontFamily: 'Vazirmatn', 
              textAlign: 'right', 
              direction: 'rtl'
            }}
            type="text"
            value={userInput}
            onChange={(e) => setUserInput(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="پیام به دلیار"
          />
          <button 
            onClick={sendMessage} 
            style={{ fontFamily: 'Vazirmatn' }}
          >
            ارسال
          </button>
        </div>
      </div>
      {showNotification && (
        <NotificationBox 
          message="لطفا فیلترشکن خود را خاموش کنید"
          onClose={() => setShowNotification(false)}
        />
      )}
    </div>
  );
};

export default ChatPage;