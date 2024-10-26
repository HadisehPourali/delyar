import React, { useState, useEffect, useRef } from 'react';
import axios from 'axios';
import './ChatPage.css';

const API_URL = process.env.REACT_APP_API_URL || 'http://127.0.0.1:5000';

const ChatPage = () => {
  const [messages, setMessages] = useState([]);
  const [userInput, setUserInput] = useState('');
  const [sessionId, setSessionId] = useState(null);
  const botId = '2f4a8ee0-b5d0-41af-918b-6c27762d6858';
  const chatBoxRef = useRef(null);
  const messagesEndRef = useRef(null);

  useEffect(() => {
    const createSession = async () => {
      try {
        const userData = JSON.parse(localStorage.getItem('userData') || '{}');
        
        const response = await axios.post(`${API_URL}/create-session`, {
          botId: botId,
          username: userData.username || null
        });
        
        setSessionId(response.data.id);
      } catch (error) {
        console.error('Error creating session:', error);
      }
    };
    createSession();
  }, []);

  const sendMessage = async () => {
    if (!userInput.trim() || !sessionId) return;

    const newMessages = [...messages, { sender: 'user', content: userInput.trim() }];
    setMessages(newMessages);
    setUserInput('');

    try {
      const userData = JSON.parse(localStorage.getItem('userData') || '{}');
      
      const response = await axios.post(`${API_URL}/respond`, {
        sessionId: sessionId,
        content: userInput.trim(),
        username: userData.username || null
      });
      
      const botResponse = response.data.content;
      setMessages([...newMessages, { sender: 'bot', content: botResponse }]);
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

  return (
    <div className="chat-page">
      <div className="chat-container">
        <div className="chat-box" ref={chatBoxRef}>
          {messages.map((msg, index) => (
            <div key={index} className={`message-container ${msg.sender}-container`}>
              <div 
                className={`message-bubble ${msg.sender}`}
                style={{ fontFamily: 'Vazirmatn', textAlign: 'right', direction: 'rtl' }}
              >
                {msg.content}
              </div>
            </div>
          ))}
          <div ref={messagesEndRef} />
        </div>
        <div className="input-section">
          <input
            style={{ fontFamily: 'Vazirmatn', textAlign: 'right', direction: 'rtl' }}
            type="text"
            value={userInput}
            onChange={(e) => setUserInput(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="پیام به دلیار"
          />
          <button onClick={sendMessage} style={{ fontFamily: 'Vazirmatn' }}>ارسال</button>
        </div>
      </div>
    </div>
  );
};

export default ChatPage;