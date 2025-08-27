"use client";

import { useState } from "react";

export default function Home() {
  // -------------------------
  // Todo State
  // -------------------------
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");

  // -------------------------
  // Chatbot State
  // -------------------------
  const [chatOpen, setChatOpen] = useState(false);
  const [chatInput, setChatInput] = useState("");
  const [chatMessages, setChatMessages] = useState<
    { sender: "user" | "bot"; text: string }[]
  >([]);

  // -------------------------
  // Submit Todo
  // -------------------------
  const handleAddTodo = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!title.trim()) return;

    try {
      await fetch(
        "http://localhost:5678/webhook-test/7c7bbf74-1eee-4b36-a5d2-a83af8e5a277",
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ title, description }),
        }
      );

      setTitle("");
      setDescription("");
      alert("✅ Todo sent to workflow!");
    } catch (err) {
      console.error("Todo error:", err);
      alert("⚠️ Failed to send todo");
    }
  };

  // -------------------------
  // Send Chat Message
  // -------------------------
  const sendMessage = async () => {
    if (!chatInput.trim()) return;

    // Show user message immediately
    const userMessage = { sender: "user" as const, text: chatInput };
    setChatMessages((prev) => [...prev, userMessage]);

    const currentInput = chatInput;
    setChatInput("");

    try {
      const res = await fetch(
        "http://localhost:5678/webhook-test/d287ffa8-984d-486c-a2cd-a2a2de952b13",
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ message: currentInput }),
        }
      );

      const data = await res.json();

      const botMessage = {
        sender: "bot" as const,
        text: data.reply || "Sorry, I don’t understand.",
      };
      setChatMessages((prev) => [...prev, botMessage]);
    } catch (err) {
      console.error("Chatbot error:", err);
      setChatMessages((prev) => [
        ...prev,
        { sender: "bot", text: "⚠️ Connection error" },
      ]);
    }
  };

  return (
    <div className="min-h-screen p-8 bg-gray-100">
      {/* ----------------- Todo Form ----------------- */}
      <h1 className="text-3xl font-bold mb-4">Todo App</h1>

      <form
        onSubmit={handleAddTodo}
        className="space-y-4 bg-white p-4 rounded shadow-md max-w-md"
      >
        <div>
          <label className="block font-medium">Title</label>
          <input
            type="text"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            className="w-full border px-2 py-1 rounded"
            required
          />
        </div>

        <div>
          <label className="block font-medium">Description</label>
          <textarea
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            className="w-full border px-2 py-1 rounded"
          />
        </div>

        <button
          type="submit"
          className="px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700"
        >
          Add Todo
        </button>
      </form>

      {/* ----------------- Chatbot Bubble ----------------- */}
      <div className="fixed bottom-4 right-4">
        {!chatOpen && (
          <button
            onClick={() => setChatOpen(true)}
            className="bg-blue-600 text-white p-4 rounded-full shadow-lg hover:bg-blue-700"
          >
            💬
          </button>
        )}

        {chatOpen && (
          <div className="w-80 h-96 bg-white rounded-lg shadow-lg flex flex-col">
            {/* Header */}
            <div className="bg-blue-600 text-white p-3 flex justify-between items-center rounded-t-lg">
              <span>Chatbot</span>
              <button onClick={() => setChatOpen(false)}>✖</button>
            </div>

            {/* Messages */}
            <div className="flex-1 p-3 overflow-y-auto space-y-2">
              {chatMessages.map((msg, i) => (
                <div
                  key={i}
                  className={`p-2 rounded max-w-[75%] ${
                    msg.sender === "user"
                      ? "bg-blue-100 self-end ml-auto"
                      : "bg-gray-200"
                  }`}
                >
                  {msg.text}
                </div>
              ))}
            </div>

            {/* Input */}
            <div className="p-2 border-t flex">
              <input
                type="text"
                value={chatInput}
                onChange={(e) => setChatInput(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && sendMessage()}
                placeholder="Type a message..."
                className="flex-1 border px-2 py-1 rounded"
              />
              <button
                onClick={sendMessage}
                className="ml-2 bg-blue-600 text-white px-3 rounded"
              >
                ➤
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
