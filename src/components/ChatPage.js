import React, { useState, useEffect, useRef } from 'react';
import axios from 'axios';
import ReactMarkdown from 'react-markdown';
import { useNavigate, useLocation } from 'react-router-dom';
import { Mic, MicOff } from 'lucide-react';
import './ChatPage.css';

const API_URL = process.env.REACT_APP_API_URL;

const MessageBubble = ({ content, sender, type }) => {
  // Don't render system messages
  if (type === 'SYSTEM' || type === 'NAMING_PROMPT') {
    return null;
  }

  // Filter out system notes if present in user message
  const displayContent = sender === 'user' 
    ? content.replace(/\[System Note:[\s\S]*?User message: /, '').trim()
    : content;

  // Don't render empty messages
  if (!displayContent) {
    return null;
  }

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
        {displayContent}
      </ReactMarkdown>
    </div>
  );
};

const ChatPage = () => {
  const navigate = useNavigate();
  const location = useLocation();
  const [messages, setMessages] = useState([]);
  const [sttTriggered, setSttTriggered] = useState(false);
  const [userInput, setUserInput] = useState("");
  const [isRecording, setIsRecording] = useState(false);
  const [sessionId, setSessionId] = useState(null);
  const [showRecordingText, setShowRecordingText] = useState(false);
  const [isWaitingForResponse, setIsWaitingForResponse] = useState(false);
  const mediaRecorderRef = useRef(null);
  const audioChunksRef = useRef([]);
  const botId = process.env.REACT_APP_BOT_ID;
  const chatBoxRef = useRef(null);
  const messagesEndRef = useRef(null);
  const inputRef = useRef(null);

  useEffect(() => {
    const userData = localStorage.getItem('userData');
    if (!userData) {
      navigate('/');
      return;
    }
  
    const locationState = location.state;
    
    if (locationState?.sessionId) {
      setSessionId(locationState.sessionId);
      const fetchSessionData = async () => {
        try {
          const response = await axios.get(`${API_URL}/api/chat/sessions/${locationState.sessionId}`);
          console.log("Session data response:", response.data);
          
          if (response.data) {
            if (response.data.messages && Array.isArray(response.data.messages)) {
              const formattedMessages = filterMessages(response.data.messages)
                .sort((a, b) => new Date(a.timestamp) - new Date(b.timestamp))
                .map(msg => ({
                  sender: msg.type?.toLowerCase() === 'user' ? 'user' : 'bot',
                  content: msg.content || '',
                  originalContent: msg.content || '',
                  type: msg.isNamingPrompt ? 'NAMING_PROMPT' : msg.type
                }));
              setMessages(formattedMessages);
            } else {
              console.log("No messages found in session data");
              setMessages([]);
            }
          }
        } catch (error) {
          console.error('Error fetching session data:', error);
          setMessages([]);
        }
      };
      fetchSessionData();
    }
  }, [navigate, location]);

  useEffect(() => {
    if (sttTriggered && userInput.trim() !== "" && !isWaitingForResponse) {
      sendMessage();
      setSttTriggered(false);
    }
  }, [userInput, sttTriggered, isWaitingForResponse]);

  useEffect(() => {
    if (!isWaitingForResponse && inputRef.current) {
      inputRef.current.focus();
    }
  }, [isWaitingForResponse]);

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
        setIsWaitingForResponse(false);
      }
    }, 40);
  };

  const sendMessage = async () => {
    if (!userInput.trim() || !sessionId || isWaitingForResponse) return;
    setIsWaitingForResponse(true);

    const isFirstMessage = messages.length === 0;
    const newUserMessage = { 
      sender: 'user', 
      content: userInput.trim()
    };
    
    const newMessages = [...messages, newUserMessage];
    setMessages([...newMessages, { sender: 'bot', content: '' }]);
    setUserInput('');

    try {
      const userData = JSON.parse(localStorage.getItem('userData') || '{}');
      const messageToSend = {
        sessionId,
        content: userInput.trim(),
        username: userData.username || null,
        isFirstMessage
      };

      const response = await axios.post(`${API_URL}/respond`, messageToSend);
      streamBotResponse(response.data.content);
    } catch (error) {
      console.error('Error sending message:', error);
      setIsWaitingForResponse(false);
    }
  };

  const handleKeyDown = (e) => {
    if (e.key === 'Enter' && !e.shiftKey && !isWaitingForResponse) {
      e.preventDefault();
      sendMessage();
    }
  };

  const startRecording = async () => {
    try {
      console.log('Starting recording...');
      setIsRecording(true);
      setShowRecordingText(true);

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
      const blob = base64ToBlob(base64Audio, 'audio/wav');
      
      const formData = new FormData();
      formData.append('file', blob, 'recording.wav');
      formData.append('model', 'whisper-1');
  
      const REACT_APP_STT_API_KEY = process.env.REACT_APP_STT_API_KEY;
  
      const response = await axios.post(
        'https://api.metisai.ir/openai/v1/audio/transcriptions', 
        formData, 
        {
          headers: {
            'Authorization': `Bearer ${REACT_APP_STT_API_KEY}`,
            'Content-Type': 'multipart/form-data'
          }
        }
      );
      
      const resultText = response.data.text;
      console.log("Transcription Result:", resultText);
      
      if (resultText) {
        setUserInput(resultText);
        setSttTriggered(true);
      }
    } catch (error) {
      console.error("Error in STT API:", error);
    }
  };

  const base64ToBlob = (base64, mime) => {
    mime = mime || '';
    const sliceSize = 1024;
    const byteChars = window.atob(base64);
    const byteArrays = [];
  
    for (let offset = 0, len = byteChars.length; offset < len; offset += sliceSize) {
      const slice = byteChars.slice(offset, offset + sliceSize);
      const byteNumbers = new Array(slice.length);
      for (let i = 0; i < slice.length; i++) {
        byteNumbers[i] = slice.charCodeAt(i);
      }
      const byteArray = new Uint8Array(byteNumbers);
      byteArrays.push(byteArray);
    }
  
    return new Blob(byteArrays, { type: mime });
  };

  const filterMessages = (messages) => {
    const promptStart = "با توجه به متن گفتگوی زیر، یک عنوان کوتاه و مناسب";
    const filteredMessages = [];
    
    const excludeIndices = new Set();
    
    for (let i = 0; i < messages.length; i++) {
      if (messages[i].content && messages[i].content.startsWith(promptStart)) {
        excludeIndices.add(i);     
        if (i > 0) {
          excludeIndices.add(i-1);  
        }
      }
    }
    
    for (let i = 0; i < messages.length; i++) {
      if (!excludeIndices.has(i)) {
        filteredMessages.push(messages[i]);
      }
    }
    
    return filteredMessages;
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
              <MessageBubble content={msg.content} sender={msg.sender} type={msg.type} />
            </div>
          ))}
          <div ref={messagesEndRef} />
        </div>
        <div className="input-section">
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
            <button 
              onClick={isRecording ? stopRecording : startRecording}
              className="record-button"
              disabled={isWaitingForResponse}
              style={{
                color: '#19386a',
                background: 'none',
                border: 'none',
                cursor: isWaitingForResponse ? 'not-allowed' : 'pointer',
                padding: '8px',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                borderRadius: '50%',
                backgroundColor: isRecording ? '#1dbd72' : 'transparent',
                transition: 'all 0.3s ease',
                opacity: isWaitingForResponse ? 0.5 : 1
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
            ref={inputRef}
            style={{ 
              fontFamily: 'Vazirmatn', 
              textAlign: 'right', 
              direction: 'rtl',
              opacity: isWaitingForResponse ? 0.7 : 1
            }}
            type="text"
            value={userInput}
            onChange={(e) => setUserInput(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder={isWaitingForResponse ? "لطفا منتظر پاسخ بمانید..." : "پیام به دلیار"}
            disabled={isWaitingForResponse}
          />
          <button 
            onClick={sendMessage} 
            style={{ 
              fontFamily: 'Vazirmatn',
              opacity: isWaitingForResponse ? 0.7 : 1,
              cursor: isWaitingForResponse ? 'not-allowed' : 'pointer'
            }}
            disabled={isWaitingForResponse}
          >
            {isWaitingForResponse ? "ارسال" : "ارسال"}
          </button>
        </div>
      </div>
    </div>
  );
};

export default ChatPage;