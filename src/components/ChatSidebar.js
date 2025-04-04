import React, { useState, useEffect, forwardRef, useMemo, useCallback } from 'react';
import { Plus, X, RotateCw, AlertCircle } from 'lucide-react';
import axios from 'axios';
import './ChatSidebar.css';

// Constants for local storage keys
const TITLE_GENERATION_MARKER = 'chatTitleGenerated_';
const CHAT_TITLE_CACHE = 'chatTitleCache_';
const TITLE_GENERATION_QUEUE = 'chatTitleQueue';

const API_URL = process.env.REACT_APP_API_URL;

const getUserPhone = () => {
  try {
    const userData = JSON.parse(localStorage.getItem('userData'));
    return userData?.phone_number || null;
  } catch {
    return null;
  }
};

const ChatSidebar = forwardRef(({ onSelectChat, onNewChat, isOpen, toggleSidebar, currentUserData }, ref) => {
  const [chats, setChats] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [page, setPage] = useState(0);
  const [hasMore, setHasMore] = useState(true);
  const [titleQueue, setTitleQueue] = useState(() => {
    try {
      return JSON.parse(localStorage.getItem(TITLE_GENERATION_QUEUE) || '[]');
    } catch {
      console.error("Failed to parse title queue from localStorage");
      return [];
    }
  });
  const [processingTitle, setProcessingTitle] = useState(false);

  const userPhoneNumber = useMemo(() => currentUserData?.phone_number || getUserPhone(), [currentUserData]);

  useEffect(() => {
    try {
      localStorage.setItem(TITLE_GENERATION_QUEUE, JSON.stringify(titleQueue));
    } catch (e) {
      console.error("Failed to save title queue to localStorage:", e);
    }
  }, [titleQueue]);

  const fetchChatDetailsAndQueueTitle = useCallback(async (chatId) => {
    const isGenerated = localStorage.getItem(TITLE_GENERATION_MARKER + chatId) === 'true';
    const isQueued = localStorage.getItem(TITLE_GENERATION_MARKER + chatId) === 'queued';

    if (isGenerated || isQueued) {
      if (isGenerated) {
        const cachedTitle = localStorage.getItem(CHAT_TITLE_CACHE + chatId) || 'گفتگوی قبلی';
        setChats(prev => prev.map(c => c.id === chatId && c.title !== cachedTitle ? { ...c, title: cachedTitle } : c));
      }
      return;
    }

    try {
      const detailResponse = await axios.get(`${API_URL}/api/chat/sessions/${chatId}`);
      const messages = detailResponse.data?.messages || detailResponse.data?.history || [];
      const metisTitle = detailResponse.data?.title;

      let lastMsgTime = chats.find(c => c.id === chatId)?.lastMessageTime || new Date().toISOString();
      if (messages.length > 0) {
        const sortedMessages = [...messages].sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));
        lastMsgTime = sortedMessages[0].timestamp || lastMsgTime;
      }

      let finalTitle = 'گفتگوی جدید';
      let shouldQueue = false;

      if (metisTitle && metisTitle.length > 1 && metisTitle !== 'گفتگوی جدید' && !metisTitle.includes('کاربر:')) {
        finalTitle = metisTitle;
        localStorage.setItem(CHAT_TITLE_CACHE + chatId, finalTitle);
        localStorage.setItem(TITLE_GENERATION_MARKER + chatId, 'true');
      } else if (messages.length > 0) {
        finalTitle = 'در حال تولید عنوان...';
        shouldQueue = true;
      } else {
        finalTitle = 'گفتگوی خالی';
        localStorage.setItem(CHAT_TITLE_CACHE + chatId, finalTitle);
        localStorage.setItem(TITLE_GENERATION_MARKER + chatId, 'true');
      }

      setChats(prevChats => prevChats.map(chat =>
        chat.id === chatId ? { ...chat, title: finalTitle, messages: messages.slice(0, 5), lastMessageTime: lastMsgTime } : chat
      ));

      if (shouldQueue) {
        const contextMessages = messages.slice(0, 5).map(m => ({ type: m.type, content: m.content?.substring(0, 150) }));
        localStorage.setItem(TITLE_GENERATION_MARKER + chatId, 'queued'); // Mark as queued
        setTitleQueue(prevQueue => {
          if (!prevQueue.some(item => item.id === chatId)) {
            return [...prevQueue, { id: chatId, messages: contextMessages }];
          }
          return prevQueue;
        });
      }
    } catch (error) {
      console.error(`Error fetching chat details for ${chatId}:`, error);
      setChats(prevChats => prevChats.map(chat =>
        chat.id === chatId ? { ...chat, title: 'خطا در بارگذاری عنوان' } : chat
      ));
    }
  }, [chats]);

  const fetchChats = useCallback(async (reset = false) => {
    if (loading || (!hasMore && !reset)) return;
    if (!userPhoneNumber) {
      setError("لطفا ابتدا وارد شوید.");
      setLoading(false);
      return;
    }

    setLoading(true);
    setError(null);
    const targetPage = reset ? 0 : page;

    try {
      const response = await axios.get(`${API_URL}/api/chat/sessions`, {
        params: { page: targetPage, size: 15 }
      });

      const fetchedChats = response.data.map(chat => {
        const cachedTitle = localStorage.getItem(CHAT_TITLE_CACHE + chat.id);
        const isGenerated = localStorage.getItem(TITLE_GENERATION_MARKER + chat.id) === 'true';
        const isQueued = localStorage.getItem(TITLE_GENERATION_MARKER + chat.id) === 'queued';
        return {
          ...chat,
          id: chat.id,
          title: (isGenerated && cachedTitle) ? cachedTitle : (isQueued ? 'در حال تولید عنوان...' : 'در حال بارگذاری عنوان...'),
          lastMessageTime: chat.lastActivityDate || chat.startDate || new Date().toISOString(),
          needsTitleCheck: !(isGenerated || isQueued),
        };
      });

      setHasMore(fetchedChats.length === 15);
      setChats(prevChats => {
        const existingIds = new Set(prevChats.map(c => c.id));
        const uniqueNewChats = fetchedChats.filter(c => !existingIds.has(c.id));
        return reset ? fetchedChats : [...prevChats, ...uniqueNewChats];
      });
      setPage(prevPage => reset ? 1 : prevPage + 1);

      fetchedChats.forEach(chat => {
        if (chat.needsTitleCheck) {
          fetchChatDetailsAndQueueTitle(chat.id);
        }
      });
    } catch (err) {
      console.error('Error fetching chats:', err.response?.data || err.message);
      setError('خطا در بارگذاری تاریخچه گفتگو');
      if (err.response?.status === 401) setError("نشست نامعتبر. لطفا دوباره وارد شوید.");
    } finally {
      setLoading(false);
    }
  }, [userPhoneNumber, fetchChatDetailsAndQueueTitle]);

  useEffect(() => {
    if (isOpen && chats.length === 0) {
      console.log("Sidebar opened and chats empty, triggering initial fetch.");
      setPage(0);
      setHasMore(true);
      fetchChats(true);
    }
  }, [isOpen, fetchChats]);

  useEffect(() => {
    const generatePendingTitle = async () => {
      if (titleQueue.length === 0 || processingTitle) return;

      setProcessingTitle(true);
      const chatToProcess = titleQueue[0];

      try {
        const isGenerated = localStorage.getItem(TITLE_GENERATION_MARKER + chatToProcess.id) === 'true';
        if (isGenerated) {
          const cachedTitle = localStorage.getItem(CHAT_TITLE_CACHE + chatToProcess.id) || 'گفتگوی قبلی';
          setChats(prev => prev.map(c => c.id === chatToProcess.id ? { ...c, title: cachedTitle } : c));
          setTitleQueue(prev => prev.slice(1));
          setProcessingTitle(false);
          return;
        }
        const titlePrompt = `با توجه به متن گفتگوی زیر، یک عنوان کوتاه و مناسب (حداکثر ۵ کلمه) پیشنهاد بده. فقط خود عنوان را بنویس:\n\n`;

        const response = await axios.post(`${API_URL}/respond`, {
          sessionId: chatToProcess.id,
          content: titlePrompt,
          isFirstMessage: false,
          messageType: 'AI' // Custom flag for backend to recognize
        }, { timeout: 30000 });

        let generatedTitle = response.data?.content?.trim() || 'گفتگوی جدید';
        generatedTitle = generatedTitle.replace(/^عنوان:\s*/i, '').replace(/["'*]/g, '');
        if (generatedTitle.length > 40) generatedTitle = generatedTitle.substring(0, 37) + '...';
        if (!generatedTitle || generatedTitle.toLowerCase().includes('کاربر:') || generatedTitle.length < 3) {
          const chatDate = chats.find(c => c.id === chatToProcess.id)?.lastMessageTime || Date.now();
          generatedTitle = `گفتگو (${new Date(chatDate).toLocaleDateString('fa-IR')})`;
        }

        localStorage.setItem(CHAT_TITLE_CACHE + chatToProcess.id, generatedTitle);
        localStorage.setItem(TITLE_GENERATION_MARKER + chatToProcess.id, 'true');

        setChats(prevChats => prevChats.map(chat =>
          chat.id === chatToProcess.id ? { ...chat, title: generatedTitle } : chat
        ));
      } catch (error) {
        console.error(`Error generating title for chat ${chatToProcess.id}:`, error.response?.data || error.message);
        const fallbackTitle = 'خطا در تولید عنوان';
        localStorage.setItem(CHAT_TITLE_CACHE + chatToProcess.id, fallbackTitle);
        localStorage.setItem(TITLE_GENERATION_MARKER + chatToProcess.id, 'true');
        setChats(prevChats => prevChats.map(chat =>
          chat.id === chatToProcess.id ? { ...chat, title: fallbackTitle } : chat
        ));
      } finally {
        setTitleQueue(prev => prev.slice(1));
        setProcessingTitle(false);
      }
    };

    const timeoutId = setTimeout(generatePendingTitle, 500);
    return () => clearTimeout(timeoutId);
  }, [titleQueue, processingTitle, chats]);

  const formatDate = (dateString) => {
    if (!dateString) return 'زمان نامشخص';
    try {
      const date = new Date(dateString);
      return new Intl.DateTimeFormat('fa-IR', {
        year: 'numeric', month: '2-digit', day: '2-digit',
        hour: '2-digit', minute: '2-digit', hour12: false
      }).format(date);
    } catch (error) {
      return String(dateString).split('T')[0] || 'تاریخ نامعتبر';
    }
  };

  const handleSelectChat = (chatData) => {
    onSelectChat({ id: chatData.id });
    if (toggleSidebar) toggleSidebar();
  };

  const handleNewChatClick = () => {
    onNewChat();
    if (toggleSidebar) toggleSidebar();
  };

  const sortedChats = useMemo(() => {
    return [...chats].sort((a, b) => new Date(b.lastMessageTime) - new Date(a.lastMessageTime));
  }, [chats]);

  return (
    <div ref={ref} className={`sidebar ${isOpen ? 'open' : ''}`} aria-hidden={!isOpen}>
      <div className="sidebar-header">
        <button onClick={handleNewChatClick} className="new-chat-button" title="شروع یک گفتگوی جدید با دلیار">
          <Plus size={20} />
          <span>گفتگوی جدید</span>
        </button>
        <button onClick={toggleSidebar} className="close-button" title="بستن منو" aria-label="بستن منو">
          <X size={24} />
        </button>
      </div>
      <div className="chat-list">
        <button
          onClick={() => { setChats([]); setPage(0); setHasMore(true); fetchChats(true); }}
          disabled={loading}
          className="refresh-button"
          title="بارگذاری مجدد تاریخچه"
        >
          <RotateCw size={16} style={{ marginLeft: '5px' }} className={loading ? 'spinning' : ''}/>
          {loading && page === 0 ? 'در حال بارگذاری...' : 'بارگذاری مجدد'}
        </button>
        {error && (
          <div className="error-message">
            <AlertCircle size={18} style={{ marginRight: '8px', color: '#c53030' }}/>
            {error}
          </div>
        )}
        {sortedChats.map((chat) => (
          <button
            key={chat.id}
            onClick={() => handleSelectChat(chat)}
            className="chat-item"
            title={`ادامه گفتگو: ${chat.title}`}
          >
            <span className="chat-title">
              {chat.title && chat.title.includes('...') && !chat.title.includes('خطا') && <span className="loading-indicator" title="در حال تولید عنوان..."></span>}
              {chat.title || `گفتگو (${formatDate(chat.lastMessageTime)})`}
            </span>
            <span className="chat-date">
              {formatDate(chat.lastMessageTime)}
            </span>
          </button>
        ))}
        {loading && chats.length === 0 && (
          <div className="loading-message">در حال بارگذاری تاریخچه...</div>
        )}
        {hasMore && !loading && sortedChats.length > 0 && (
          <button onClick={() => fetchChats()} className="load-more-button" disabled={loading}>
            {loading ? '...' : 'نمایش بیشتر'}
          </button>
        )}
        {!loading && sortedChats.length === 0 && !error && (
          <div className="no-chats-message">تاریخچه گفتگویی یافت نشد.</div>
        )}
      </div>
    </div>
  );
});

export default ChatSidebar;