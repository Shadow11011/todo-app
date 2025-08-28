import { useState, useEffect } from "react";
import { supabase } from "../lib/supabase";
import { User } from '@supabase/supabase-js';

type ChatMessage = { sender: "user" | "bot"; text: string };

export default function Chat({ user }: { user: User | null }) {
  const [chatInput, setChatInput] = useState("");
  const [chatMessages, setChatMessages] = useState<ChatMessage[]>([]);

  // Load previous messages on login
  useEffect(() => {
    if (!user) return setChatMessages([]);
    const fetchMessages = async () => {
      const { data, error } = await supabase
        .from("chat_messages")
        .select("*")
        .eq("user_id", user.id)
        .order("created_at", { ascending: true });

      if (!error && data) {
        const formatted = data.map(msg => ({ sender: msg.sender, text: msg.message }));
        setChatMessages(formatted);
      }
    };
    fetchMessages();
  }, [user]);

  const handleSendMessage = async () => {
    if (!chatInput.trim() || !user) return;

    const userMessage: ChatMessage = { sender: "user", text: chatInput };
    setChatMessages(prev => [...prev, userMessage]);
    setChatInput("");

    try {
      const res = await fetch("/api/chatbot", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ message: userMessage.text, user_id: user.id }),
      });
      const data = await res.json();
      const botMessage: ChatMessage = { sender: "bot", text: data.reply };
      setChatMessages(prev => [...prev, botMessage]);
    } catch (err) {
      console.error(err);
      setChatMessages(prev => [...prev, { sender: "bot", text: "Error connecting to bot." }]);
    }
  };

  return (
    <div className="chat-window">
      <div className="messages">
        {chatMessages.map((msg, i) => (
          <div key={i} className={msg.sender === "user" ? "user-msg" : "bot-msg"}>
            {msg.text}
          </div>
        ))}
      </div>
      <input
        type="text"
        value={chatInput}
        onChange={(e) => setChatInput(e.target.value)}
        placeholder="Type a message..."
      />
      <button onClick={handleSendMessage}>Send</button>
    </div>
  );
}
