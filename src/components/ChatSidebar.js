import React, { useState, useEffect, forwardRef, useMemo } from 'react';
import { Plus, X } from 'lucide-react';
import axios from 'axios';
import './ChatSidebar.css';

const API_URL = process.env.REACT_APP_API_URL;
const TITLE_GENERATION_MARKER = 'title_generated_';
const TITLE_GENERATION_QUEUE = 'title_generation_queue';

const ChatSidebar = forwardRef(({ onSelectChat, onNewChat, isOpen, toggleSidebar }, ref) => {
  const [chats, setChats] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [page, setPage] = useState(0);
  const [hasMore, setHasMore] = useState(true);
  const [pendingTitleGeneration, setPendingTitleGeneration] = useState(() => {
    // Initialize from localStorage to prevent losing queue on reload
    try {
      return JSON.parse(localStorage.getItem(TITLE_GENERATION_QUEUE) || '[]');
    } catch {
      return [];
    }
  });

  // Save queue to localStorage whenever it changes
  useEffect(() => {
    localStorage.setItem(TITLE_GENERATION_QUEUE, JSON.stringify(pendingTitleGeneration));
  }, [pendingTitleGeneration]);

  useEffect(() => {
    if (isOpen) {
      fetchChats();
    }
  }, [isOpen, page]);

  // Process title generation queue
  useEffect(() => {
    const generatePendingTitles = async () => {
      if (pendingTitleGeneration.length === 0) return;
      
      // Process only one chat at a time
      const chatToProcess = pendingTitleGeneration[0];
      
      try {
        // Double-check that title hasn't been generated while in queue
        const titleGenerated = localStorage.getItem(TITLE_GENERATION_MARKER + chatToProcess.id);
        if (titleGenerated) {
          setPendingTitleGeneration(prev => prev.filter(item => item.id !== chatToProcess.id));
          return;
        }

        const title = await generateTitleWithAI(chatToProcess.messages, chatToProcess.id);
        
        // Mark as generated before saving title to prevent race conditions
        localStorage.setItem(TITLE_GENERATION_MARKER + chatToProcess.id, 'true');
        localStorage.setItem(`chatTitle_${chatToProcess.id}`, title);
        
        setChats(prevChats => 
          prevChats.map(chat => 
            chat.id === chatToProcess.id ? { ...chat, title } : chat
          )
        );
      } catch (error) {
        console.error(`Error generating title for chat ${chatToProcess.id}:`, error);
      } finally {
        // Remove from queue regardless of success/failure
        setPendingTitleGeneration(prev => prev.filter(item => item.id !== chatToProcess.id));
      }
    };
    
    generatePendingTitles();
  }, [pendingTitleGeneration]);

  const fetchChats = async () => {
    try {
      setLoading(true);
      setError(null);

      const userData = JSON.parse(localStorage.getItem('userData'));
      if (!userData?.username) {
        console.log('No user data found');
        return;
      }

      const response = await axios.get(`${API_URL}/api/chat/sessions`, {
        params: {
          userId: userData.username,
          page: page,
          size: 10
        }
      });

      const fetchedChats = response.data.map(chat => ({
        ...chat,
        title: localStorage.getItem(`chatTitle_${chat.id}`) || 'گفتگوی جدید',
        lastMessageTime: chat.startDate
      }));

      setHasMore(fetchedChats.length === 10);
      setChats(prevChats => {
        if (page === 0) {
          return fetchedChats;
        } else {
          return [...prevChats, ...fetchedChats];
        }
      });

      // Fetch detailed information in the background
      fetchedChats.forEach(chat => fetchChatDetails(chat.id));
    } catch (err) {
      console.error('Error fetching chats:', err);
      setError('خطا در بارگذاری تاریخچه گفتگو');
    } finally {
      setLoading(false);
    }
  };

  const fetchChatDetails = async (chatId) => {
    try {
      // Check if title generation is already completed or in progress
      const titleGenerated = localStorage.getItem(TITLE_GENERATION_MARKER + chatId);
      const inQueue = pendingTitleGeneration.some(item => item.id === chatId);
      
      const detailResponse = await axios.get(`${API_URL}/api/chat/sessions/${chatId}`);
      const messages = detailResponse.data.messages || [];

      // Find the timestamp of the last message
      let lastMessageTime = null;
      if (messages.length > 0) {
        const sortedMessages = [...messages].sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));
        lastMessageTime = sortedMessages[0].timestamp || null;
      }

      let title = localStorage.getItem(`chatTitle_${chatId}`) || 'گفتگوی جدید';
      
      // Only queue title generation if:
      // 1. We haven't generated a title before
      // 2. It's not already in the queue
      // 3. There are messages to generate from
      // 4. We don't already have a custom title
      if (!titleGenerated && !inQueue && messages.length > 0 && title === 'گفتگوی جدید') {
        // Limit to first 5 messages for title generation
        const limitedMessages = messages.slice(0, 5);
        
        // Add to pending generation queue
        setPendingTitleGeneration(prev => [...prev, { id: chatId, messages: limitedMessages }]);
      }

      setChats(prevChats => prevChats.map(chat => 
        chat.id === chatId ? { ...chat, messages, title, lastMessageTime } : chat
      ));
    } catch (error) {
      console.error(`Error fetching chat details for ${chatId}:`, error);
    }
  };
  
  const generateTitleWithAI = async (messages, sessionId) => {
    try {
      // Final check before sending request
      const titleGenerated = localStorage.getItem(TITLE_GENERATION_MARKER + sessionId);
      if (titleGenerated) {
        return localStorage.getItem(`chatTitle_${sessionId}`) || 'گفتگوی جدید';
      }

      const limitedMessages = messages.slice(0, 5);
      
      const messageHistory = limitedMessages
        .map(msg => {
          let content = msg.message?.content || msg.content || '';
          content = content.replace(/\[System Note:[\s\S]*?User message: /, '');
          return `${msg.message?.type === 'USER' || msg.type === 'USER' ? 'کاربر' : 'دلیار'}: ${content}`;
        })
        .join('\n');

      const titlePrompt = {
        message: {
          content: `با توجه به متن گفتگوی زیر، یک عنوان کوتاه و مناسب (حداکثر 5 کلمه) برای این مکالمه پیشنهاد کن. فقط عنوان را بنویس، بدون هیچ توضیح اضافه:\n\n${messageHistory}`,
          type: "USER"
        }
      };

      const response = await axios.post(
        `${API_URL}/respond`,
        {
          sessionId: sessionId,
          content: titlePrompt.message.content,
          isFirstMessage: false
        }
      );

      return response.data.content.trim();
    } catch (error) {
      console.error('Error generating title:', error);
      return 'گفتگوی جدید';
    }
  };

  const formatDate = (dateString) => {
    try {
      const date = new Date(dateString);

      // Create Persian date formatter for date part
      const dateFormatter = new Intl.DateTimeFormat('fa-IR', {
        year: 'numeric',
        month: 'long',
        day: 'numeric',
      });

      // Create separate time formatter
      const timeFormatter = new Intl.DateTimeFormat('fa-IR', {
        hour: '2-digit',
        minute: '2-digit'
      });

      // Format date and time separately
      const formattedDate = dateFormatter.format(date);
      const formattedTime = timeFormatter.format(date);

      // Return in the format: day month ساعت time
      const dateParts = formattedDate.split(' ');
      if (dateParts.length >= 2) {
        // Make sure the day is before the month (fix the ordering issue)
        return `روز ${dateParts[0]} ${dateParts[1]} ساعت ${formattedTime} `;
      }

      // Fallback if the splitting doesn't work as expected
      return `${formattedDate} ساعت ${formattedTime}`;
    } catch (error) {
      console.error('Error formatting date:', error);
      return dateString;
    }
  };

  const handleSelectChat = async (chatData) => {
    try {
      const response = await axios.get(`${API_URL}/api/chat/sessions/${chatData.id}`);
      const messages = response.data.messages || [];
      onSelectChat({ ...chatData, messages });
      if (toggleSidebar) {
        toggleSidebar();
      }
    } catch (error) {
      console.error('Error fetching chat session:', error);
      setError('خطا در بارگذاری گفتگو');
    }
  };

  const handleNewChatClick = () => {
    onNewChat();
    if (toggleSidebar) {
      toggleSidebar();
    }
  };

  const sortedChats = useMemo(() => {
    return chats.sort((a, b) => new Date(b.lastMessageTime) - new Date(a.lastMessageTime));
  }, [chats]);

  return (
    <div ref={ref} className={`sidebar ${isOpen ? 'open' : ''}`}>
      <div className={`sidebar ${isOpen ? 'open' : ''}`}>
        <div className="sidebar-header">
          <button onClick={handleNewChatClick} className="new-chat-button">
            <Plus size={20} />
            <span>گفتگوی جدید</span>
          </button>
          <button onClick={toggleSidebar} className="close-button">
            <X size={20} />
          </button>
        </div>

        <div className="chat-list">
          {error && (
            <div className="error-message" style={{ padding: '1rem', color: 'red', textAlign: 'center' }}>
              {error}
            </div>
          )}

          {sortedChats.map((chat) => (
            <button
              key={chat.id}
              onClick={() => handleSelectChat(chat)}
              className="chat-item"
            >
              <span className="chat-title">
                {chat.title}
              </span>
              <span className="chat-date">
                {formatDate(chat.lastMessageTime)}
              </span>
            </button>
          ))}

          {loading && (
            <div style={{ textAlign: 'center', padding: '1rem', color: '#666' }}>
              در حال بارگذاری...
            </div>
          )}

          {hasMore && !loading && (
            <button onClick={() => setPage(prev => prev + 1)} className="load-more-button">
              نمایش بیشتر
            </button>
          )}
        </div>
      </div>
    </div>
  );
});

export default ChatSidebar;