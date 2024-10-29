import React, { useState, useEffect, useRef } from 'react';
import axios from 'axios';
import ReactMarkdown from 'react-markdown';
import { useNavigate } from 'react-router-dom';
import './ChatPage.css';

const API_URL = process.env.REACT_APP_API_URL || 'http://127.0.0.1:5000';

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
          // Add more custom components as needed
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
  const [userInput, setUserInput] = useState('');
  const [sessionId, setSessionId] = useState(null);
  const botId = '7783af83-6fbf-404c-93e6-89c01daaa9f9';
  const chatBoxRef = useRef(null);
  const messagesEndRef = useRef(null);

  useEffect(() => {
    // Check authentication on component mount
    const userData = localStorage.getItem('userData');
    if (!userData) {
      navigate('/');
      return;
    }

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
        // If session creation fails, redirect to start page
        navigate('/');
      }
    };
    createSession();
  }, [navigate]);

  const handleLogout = () => {
    localStorage.removeItem('userData');
    navigate('/');
  };

  const streamBotResponse = (botResponse) => {
    let index = -1;
    const streamInterval = setInterval(() => {
      if (index < botResponse.length-1) {
        setMessages((prevMessages) => [
          ...prevMessages.slice(0, -1),
          {
            sender: 'bot',
            content: prevMessages[prevMessages.length - 1].content + botResponse[index]
          }
        ]);
        index += 1;
      } else {
        clearInterval(streamInterval);
      }
    }, 25); // Adjust delay (in ms) as desired for typing effect
  };

  const sendMessage = async () => {
    if (!userInput.trim() || !sessionId) return;

    const newMessages = [...messages, { sender: 'user', content: userInput.trim() }];
    setMessages([...newMessages, { sender: 'bot', content: '' }]); // Add empty bot message to show streaming
    setUserInput('');

    try {
      const userData = JSON.parse(localStorage.getItem('userData') || '{}');
      
      const response = await axios.post(`${API_URL}/respond`, {
        sessionId: sessionId,
        content: userInput.trim(),
        username: userData.username || null
      });
      
      streamBotResponse(response.data.content); // Stream bot response
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

  useEffect(() => {
    if (messagesEndRef.current) {
      messagesEndRef.current.scrollIntoView({ behavior: 'smooth' });
    }
  }, [messages]);

  return (
    <div className="chat-page">
      <div className="chat-header">
        <button 
          onClick={handleLogout}
          className="logout-button"
          style={{
            position: 'absolute',
            top: '1rem',
            left: '1rem',
            padding: '0.5rem 1rem',
            backgroundColor: '#9ecedb',
            border: 'none',
            borderRadius: '20px',
            cursor: 'pointer',
            fontFamily: 'Vazirmatn'
          }}
        >
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