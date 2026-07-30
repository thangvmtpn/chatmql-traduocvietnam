import { useState, useRef, useEffect } from "react";
import { aiAssistantService } from "@/services/aiAssistant";
import { Bot, Send, User } from "lucide-react";
import ReactMarkdown from "react-markdown";
import "./AIAssistantPage.css"; // Import file CSS thuần

interface ChatMessage {
  role: "user" | "ai";
  content: string;
}

const AIAssistantPage = () => {
  const [messages, setMessages] = useState<ChatMessage[]>([
    {
      role: "ai",
      content:
        "Xin chào! Tôi là trợ lý AI của hệ thống CRM. Bạn cần hỏi thông tin gì về quy định, chính sách hay nội bộ công ty?",
    },
  ]);
  const [input, setInput] = useState("");
  const [isLoading, setIsLoading] = useState(false);

  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  };

  useEffect(() => {
    scrollToBottom();
  }, [messages, isLoading]);

  useEffect(() => {
    if (!isLoading) {
      inputRef.current?.focus();
    }
  }, [isLoading]);

  const handleSend = async () => {
    if (!input.trim() || isLoading) return;

    const userText = input.trim();
    const userMsg: ChatMessage = { role: "user", content: userText };

    setMessages((prev) => [...prev, userMsg]);
    setInput("");
    setIsLoading(true);

    try {
      const res = await aiAssistantService.sendMessage(userText);

      if (res.status === "success") {
        setMessages((prev) => [
          ...prev,
          {
            role: "ai",
            content: res.answer || "Không có nội dung phản hồi từ AI.",
          } as ChatMessage,
        ]);
      } else {
        setMessages((prev) => [
          ...prev,
          {
            role: "ai",
            content: res.message || "Xin lỗi, hệ thống AI đang trả về lỗi.",
          } as ChatMessage,
        ]);
      }
    } catch (err) {
      console.error("Lỗi chat AI:", err);
      setMessages((prev) => [
        ...prev,
        {
          role: "ai",
          content: "Mất kết nối đến máy chủ. Vui lòng thử lại sau!",
        } as ChatMessage,
      ]);
    } finally {
      setIsLoading(false);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  return (
    <div className="ai-page-container">
      {/* Header */}
      <div className="ai-header">
        <div className="ai-header-icon">
          <Bot size={24} />
        </div>
        <div>
          <h1 className="ai-header-title">Trợ lý AI CRM</h1>
          <p className="ai-header-subtitle">
            Hỏi đáp tài liệu nội bộ, quy chế, chính sách
          </p>
        </div>
      </div>

      {/* Khu vực hiển thị tin nhắn */}
      <div className="ai-message-list">
        {messages.map((msg, i) => (
          <div key={i} className={`ai-message-row ${msg.role}`}>
            {msg.role === "ai" && (
              <div className="ai-avatar bot">
                <Bot size={18} />
              </div>
            )}

            <div className="ai-bubble">
              {msg.role === "user" ? (
                <span style={{ whiteSpace: "pre-wrap" }}>{msg.content}</span>
              ) : (
                <div className="ai-markdown">
                  <ReactMarkdown>{msg.content}</ReactMarkdown>
                </div>
              )}
            </div>

            {msg.role === "user" && (
              <div className="ai-avatar user">
                <User size={18} />
              </div>
            )}
          </div>
        ))}

        {/* Hiệu ứng loading 3 dấu chấm */}
        {isLoading && (
          <div className="ai-message-row bot">
            <div className="ai-avatar bot">
              <Bot size={18} />
            </div>
            <div className="ai-typing-indicator">
              <div className="ai-dot"></div>
              <div className="ai-dot"></div>
              <div className="ai-dot"></div>
            </div>
          </div>
        )}
        <div ref={messagesEndRef} />
      </div>

      {/* Khu vực nhập câu hỏi */}
      <div className="ai-input-area">
        <div className="ai-input-wrapper">
          <input
            ref={inputRef}
            type="text"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={handleKeyDown}
            disabled={isLoading}
            className="ai-input"
            placeholder="Nhập câu hỏi của bạn về quy định công ty..."
          />
          <button
            onClick={handleSend}
            disabled={isLoading || !input.trim()}
            className={`ai-send-btn ${input.trim() && !isLoading ? "active" : "disabled"}`}
          >
            <Send size={20} />
          </button>
        </div>
      </div>
    </div>
  );
};

export default AIAssistantPage;
