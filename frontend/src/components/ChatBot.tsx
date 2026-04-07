import { useState, useRef, useEffect, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { MessageCircle, X, Send, Minimize2, Bot, User, Loader, Sparkles } from 'lucide-react';
import { API_BASE_URL } from '../config/api';
import { getAuthToken } from '../utils/getAuthToken';

interface Message {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  streaming?: boolean;
}

const STORAGE_KEY = 'sf_chat_history';
const MAX_HISTORY = 20; // keep last 20 messages in memory

function msgId() {
  return Math.random().toString(36).slice(2);
}

const TypingDots = () => (
  <span className="inline-flex gap-[3px] items-center h-4">
    {[0, 1, 2].map(i => (
      <span
        key={i}
        className="w-1.5 h-1.5 rounded-full bg-accent-teal"
        style={{ animation: `bounce 1.2s ease-in-out ${i * 0.2}s infinite` }}
      />
    ))}
    <style>{`
      @keyframes bounce {
        0%, 80%, 100% { transform: translateY(0); opacity: 0.4; }
        40% { transform: translateY(-5px); opacity: 1; }
      }
    `}</style>
  </span>
);

// Minimal markdown renderer (bold, code, newlines)
function renderMarkdown(text: string) {
  const lines = text.split('\n');
  return lines.map((line, li) => {
    // Bold **text**
    const parts = line.split(/(\*\*[^*]+\*\*|`[^`]+`)/g);
    return (
      <span key={li}>
        {parts.map((part, pi) => {
          if (part.startsWith('**') && part.endsWith('**')) {
            return <strong key={pi} className="font-semibold text-white">{part.slice(2, -2)}</strong>;
          }
          if (part.startsWith('`') && part.endsWith('`')) {
            return (
              <code key={pi} className="px-1 py-0.5 rounded text-xs bg-white/10 font-mono text-accent-teal">
                {part.slice(1, -1)}
              </code>
            );
          }
          return <span key={pi}>{part}</span>;
        })}
        {li < lines.length - 1 && <br />}
      </span>
    );
  });
}

const ChatBot = () => {
  const [open, setOpen] = useState(false);
  const [messages, setMessages] = useState<Message[]>(() => {
    try {
      const saved = sessionStorage.getItem(STORAGE_KEY);
      return saved ? JSON.parse(saved) : [];
    } catch {
      return [];
    }
  });
  const [input, setInput] = useState('');
  const [streaming, setStreaming] = useState(false);
  const [unread, setUnread] = useState(0);
  const bottomRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const abortRef = useRef<AbortController | null>(null);

  // Persist messages to sessionStorage
  useEffect(() => {
    try {
      sessionStorage.setItem(STORAGE_KEY, JSON.stringify(messages.slice(-MAX_HISTORY)));
    } catch { /* quota */ }
  }, [messages]);

  // Scroll to bottom on new messages
  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  // Focus input when opened
  useEffect(() => {
    if (open) {
      setTimeout(() => inputRef.current?.focus(), 150);
      setUnread(0);
    }
  }, [open]);

  const sendMessage = useCallback(async () => {
    const text = input.trim();
    if (!text || streaming) return;

    setInput('');

    const userMsg: Message = { id: msgId(), role: 'user', content: text };
    const assistantMsg: Message = { id: msgId(), role: 'assistant', content: '', streaming: true };

    setMessages(prev => [...prev, userMsg, assistantMsg]);
    setStreaming(true);

    const abort = new AbortController();
    abortRef.current = abort;

    try {
      const token = await getAuthToken();
      const history = [...messages, userMsg].slice(-MAX_HISTORY).map(m => ({
        role: m.role,
        content: m.content,
      }));

      const res = await fetch(`${API_BASE_URL}/api/chat/stream`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: JSON.stringify({ messages: history }),
        signal: abort.signal,
      });

      if (!res.ok) throw new Error(`HTTP ${res.status}`);

      const reader = res.body!.getReader();
      const decoder = new TextDecoder();
      let buffer = '';

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const parts = buffer.split('\n\n');
        buffer = parts.pop() ?? '';

        for (const part of parts) {
          const line = part.replace(/^data: /, '').trim();
          if (!line) continue;
          try {
            const event = JSON.parse(line);
            if (event.type === 'text') {
              setMessages(prev =>
                prev.map(m =>
                  m.id === assistantMsg.id
                    ? { ...m, content: m.content + event.text, streaming: true }
                    : m
                )
              );
            } else if (event.type === 'done') {
              setMessages(prev =>
                prev.map(m =>
                  m.id === assistantMsg.id ? { ...m, streaming: false } : m
                )
              );
              // Bump unread badge only when panel is closed and AI reply completes
              if (!open) setUnread(u => u + 1);
            } else if (event.type === 'error') {
              setMessages(prev =>
                prev.map(m =>
                  m.id === assistantMsg.id
                    ? { ...m, content: event.message || 'Error occurred.', streaming: false }
                    : m
                )
              );
            }
          } catch { /* malformed SSE */ }
        }
      }
    } catch (err: unknown) {
      if ((err as Error)?.name !== 'AbortError') {
        setMessages(prev =>
          prev.map(m =>
            m.id === assistantMsg.id
              ? { ...m, content: 'Failed to connect to the assistant. Please try again.', streaming: false }
              : m
          )
        );
      }
    } finally {
      setStreaming(false);
      abortRef.current = null;
      setMessages(prev =>
        prev.map(m => m.id === assistantMsg.id ? { ...m, streaming: false } : m)
      );
    }
  }, [input, streaming, messages, open]);

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      sendMessage();
    }
  };

  const clearChat = () => {
    abortRef.current?.abort();
    abortRef.current = null;
    setStreaming(false);
    setMessages([]);
  };

  const SUGGESTIONS = [
    'How do I create a campaign?',
    'How do I connect Instagram?',
    'What does the Video Studio do?',
    'How do I generate leads?',
  ];

  return (
    <>
      {/* Floating button */}
      <motion.button
        onClick={() => setOpen(o => !o)}
        className="fixed bottom-6 right-6 z-[60] w-14 h-14 rounded-full flex items-center justify-center shadow-lg shadow-accent-teal/30 focus:outline-none"
        style={{
          background: 'linear-gradient(135deg, #0f766e 0%, #1d4ed8 100%)',
        }}
        whileHover={{ scale: 1.08 }}
        whileTap={{ scale: 0.94 }}
        title="SocialFlow Assistant"
      >
        <AnimatePresence mode="wait">
          {open ? (
            <motion.div key="x" initial={{ rotate: -90, opacity: 0 }} animate={{ rotate: 0, opacity: 1 }} exit={{ rotate: 90, opacity: 0 }} transition={{ duration: 0.18 }}>
              <X className="w-6 h-6 text-white" />
            </motion.div>
          ) : (
            <motion.div key="chat" initial={{ scale: 0.6, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} exit={{ scale: 0.6, opacity: 0 }} transition={{ duration: 0.18 }}>
              <MessageCircle className="w-6 h-6 text-white" />
            </motion.div>
          )}
        </AnimatePresence>
        {!open && unread > 0 && (
          <span className="absolute -top-1 -right-1 w-5 h-5 rounded-full bg-red-500 text-white text-[10px] font-bold flex items-center justify-center">
            {unread > 9 ? '9+' : unread}
          </span>
        )}
      </motion.button>

      {/* Chat panel */}
      <AnimatePresence>
        {open && (
          <motion.div
            initial={{ opacity: 0, y: 24, scale: 0.95 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 24, scale: 0.95 }}
            transition={{ type: 'spring', damping: 26, stiffness: 320 }}
            className="fixed bottom-24 right-6 z-[60] flex flex-col rounded-2xl overflow-hidden shadow-2xl shadow-black/50"
            style={{
              width: 380,
              height: 560,
              background: 'rgba(10, 18, 32, 0.97)',
              border: '1px solid rgba(45, 212, 191, 0.2)',
              backdropFilter: 'blur(24px)',
            }}
          >
            {/* Header */}
            <div
              className="flex items-center gap-3 px-4 py-3 flex-shrink-0"
              style={{
                background: 'linear-gradient(90deg, rgba(15,118,110,0.4) 0%, rgba(29,78,216,0.3) 100%)',
                borderBottom: '1px solid rgba(45,212,191,0.15)',
              }}
            >
              <div className="w-8 h-8 rounded-full flex items-center justify-center flex-shrink-0"
                style={{ background: 'linear-gradient(135deg, #0f766e, #1d4ed8)' }}>
                <Sparkles className="w-4 h-4 text-white" />
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-semibold text-white leading-tight">SocialFlow Assistant</p>
                <p className="text-[11px] text-accent-teal/80 leading-tight">Powered by Claude AI</p>
              </div>
              <div className="flex items-center gap-1">
                {messages.length > 0 && (
                  <button
                    onClick={clearChat}
                    className="text-[11px] text-white/40 hover:text-white/70 transition-colors px-2 py-1 rounded"
                    title="Clear chat"
                  >
                    Clear
                  </button>
                )}
                <button
                  onClick={() => setOpen(false)}
                  className="w-7 h-7 rounded-lg flex items-center justify-center text-white/50 hover:text-white hover:bg-white/10 transition-colors"
                >
                  <Minimize2 className="w-4 h-4" />
                </button>
              </div>
            </div>

            {/* Messages */}
            <div className="flex-1 overflow-y-auto px-4 py-3 space-y-3 scrollbar-thin scrollbar-thumb-white/10">
              {messages.length === 0 ? (
                <div className="flex flex-col items-center justify-center h-full gap-4 pb-4">
                  <div className="w-16 h-16 rounded-2xl flex items-center justify-center"
                    style={{ background: 'linear-gradient(135deg, rgba(15,118,110,0.3), rgba(29,78,216,0.3))', border: '1px solid rgba(45,212,191,0.2)' }}>
                    <Bot className="w-8 h-8 text-accent-teal" />
                  </div>
                  <div className="text-center">
                    <p className="text-white text-sm font-medium mb-1">How can I help?</p>
                    <p className="text-white/40 text-xs">Ask me anything about SocialFlow</p>
                  </div>
                  <div className="grid grid-cols-1 gap-2 w-full mt-2">
                    {SUGGESTIONS.map(s => (
                      <button
                        key={s}
                        onClick={() => { setInput(s); setTimeout(() => inputRef.current?.focus(), 0); }}
                        className="text-left text-xs text-white/60 hover:text-white/90 hover:bg-white/8 transition-colors px-3 py-2 rounded-lg"
                        style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.08)' }}
                      >
                        {s}
                      </button>
                    ))}
                  </div>
                </div>
              ) : (
                messages.map(msg => (
                  <div
                    key={msg.id}
                    className={`flex gap-2.5 ${msg.role === 'user' ? 'flex-row-reverse' : 'flex-row'}`}
                  >
                    {/* Avatar */}
                    <div className={`w-7 h-7 rounded-full flex items-center justify-center flex-shrink-0 mt-0.5 ${
                      msg.role === 'user'
                        ? 'bg-accent-blue/20 border border-accent-blue/30'
                        : 'bg-accent-teal/20 border border-accent-teal/30'
                    }`}>
                      {msg.role === 'user'
                        ? <User className="w-3.5 h-3.5 text-accent-blue" />
                        : <Bot className="w-3.5 h-3.5 text-accent-teal" />
                      }
                    </div>

                    {/* Bubble */}
                    <div
                      className={`max-w-[78%] rounded-2xl px-3.5 py-2.5 text-xs leading-relaxed ${
                        msg.role === 'user'
                          ? 'text-white rounded-tr-sm'
                          : 'text-white/85 rounded-tl-sm'
                      }`}
                      style={
                        msg.role === 'user'
                          ? { background: 'linear-gradient(135deg, rgba(29,78,216,0.5), rgba(15,118,110,0.4))', border: '1px solid rgba(96,165,250,0.2)' }
                          : { background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.08)' }
                      }
                    >
                      {msg.content === '' && msg.streaming
                        ? <TypingDots />
                        : renderMarkdown(msg.content)
                      }
                    </div>
                  </div>
                ))
              )}
              <div ref={bottomRef} />
            </div>

            {/* Input */}
            <div
              className="flex-shrink-0 px-3 py-3"
              style={{ borderTop: '1px solid rgba(45,212,191,0.12)' }}
            >
              <div
                className="flex items-end gap-2 rounded-xl px-3 py-2"
                style={{ background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.1)' }}
              >
                <textarea
                  ref={inputRef}
                  value={input}
                  onChange={e => setInput(e.target.value)}
                  onKeyDown={handleKeyDown}
                  placeholder="Ask about SocialFlow…"
                  rows={1}
                  disabled={streaming}
                  className="flex-1 bg-transparent text-white text-xs placeholder-white/30 resize-none outline-none leading-relaxed"
                  style={{ maxHeight: 80, minHeight: 20 }}
                  onInput={e => {
                    const el = e.currentTarget;
                    el.style.height = 'auto';
                    el.style.height = Math.min(el.scrollHeight, 80) + 'px';
                  }}
                />
                <button
                  onClick={sendMessage}
                  disabled={!input.trim() || streaming}
                  className="w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0 transition-all disabled:opacity-30"
                  style={{
                    background: input.trim() && !streaming
                      ? 'linear-gradient(135deg, #0f766e, #1d4ed8)'
                      : 'rgba(255,255,255,0.08)',
                  }}
                >
                  {streaming
                    ? <Loader className="w-3.5 h-3.5 text-white animate-spin" />
                    : <Send className="w-3.5 h-3.5 text-white" />
                  }
                </button>
              </div>
              <p className="text-[10px] text-white/20 text-center mt-1.5">
                Press Enter to send · Shift+Enter for new line
              </p>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </>
  );
};

export default ChatBot;
