"use client";

import { useState, useEffect, FormEvent } from "react";

type Todo = {
  id: string;
  title: string;
  description: string;
  completed: boolean;
};

type ChatMessage = {
  sender: "user" | "bot";
  text: string;
};

export default function Home() {
  // --- Todo State ---
  const [todos, setTodos] = useState<Todo[]>([]);
  const [newTitle, setNewTitle] = useState("");
  const [newDescription, setNewDescription] = useState("");

  // --- Chatbot State ---
  const [chatOpen, setChatOpen] = useState(false);
  const [chatInput, setChatInput] = useState("");
  const [chatMessages, setChatMessages] = useState<ChatMessage[]>([]);

  // --- Fetch Todos ---
  useEffect(() => {
    const fetchTodos = async () => {
      try {
        const res = await fetch("/api/todos");
        const data = await res.json();
        setTodos(data);
      } catch (err) {
        console.error("Error fetching todos:", err);
      }
    };
    fetchTodos();
  }, []);

  // --- Add Todo ---
  const handleAddTodo = async (e: FormEvent) => {
    e.preventDefault();
    if (!newTitle.trim()) return;

    const newTodo = {
      id: Date.now().toString(),
      title: newTitle,
      description: newDescription,
      completed: false,
    };

    setTodos((prev) => [...prev, newTodo]);
    setNewTitle("");
    setNewDescription("");

    await fetch("http://localhost:5678/webhook-test/7c7bbf74-1eee-4b36-a5d2-a83af8e5a277", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(newTodo),
    });
  };

  // --- Toggle Todo ---
  const toggleTodo = (id: string) => {
    setTodos((prev) =>
      prev.map((todo) =>
        todo.id === id ? { ...todo, completed: !todo.completed } : todo
      )
    );
  };

  // --- Chatbot Send ---
  const handleSendMessage = async () => {
    if (!chatInput.trim()) return;

    const userMessage = { sender: "user" as const, text: chatInput };
    setChatMessages((prev) => [...prev, userMessage]);

    const currentInput = chatInput;
    setChatInput("");

    try {
      const res = await fetch("http://localhost:5678/webhook-test/d287ffa8-984d-486c-a2cd-a2a2de952b13", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ message: currentInput }),
      });
      const data = await res.json();
      setChatMessages((prev) => [...prev, { sender: "bot", text: data.reply || "Sorry, I don’t understand." }]);
    } catch (err) {
      console.error("Chat error:", err);
      setChatMessages((prev) => [...prev, { sender: "bot", text: "Error connecting to bot." }]);
    }
  };

  return (
    <main className="min-h-screen bg-gradient-to-br from-gray-900 via-slate-900 to-black text-gray-100 p-8 flex flex-col items-center">
      <h1 className="text-4xl font-bold mb-8 text-indigo-400 drop-shadow-lg">Todo App + Chatbot</h1>

      {/* Todo Form */}
      <form
        onSubmit={handleAddTodo}
        className="space-y-4 bg-slate-800/80 p-6 rounded-2xl shadow-xl max-w-md border border-slate-700"
      >
        <input
          type="text"
          placeholder="Enter title..."
          value={newTitle}
          onChange={(e) => setNewTitle(e.target.value)}
          className="w-full p-2 border border-slate-600 bg-slate-900 text-gray-100 rounded-lg shadow-inner focus:ring focus:ring-indigo-500"
        />
        <textarea
          placeholder="Enter description..."
          value={newDescription}
          onChange={(e) => setNewDescription(e.target.value)}
          className="w-full p-2 border border-slate-600 bg-slate-900 text-gray-100 rounded-lg shadow-inner focus:ring focus:ring-indigo-500"
        />
        <button
          type="submit"
          className="w-full bg-gradient-to-r from-indigo-600 to-purple-700 text-white p-2 rounded-lg shadow-lg hover:scale-105 transition"
        >
          Add Todo
        </button>
      </form>

      {/* Todo List */}
      <ul className="mt-6 space-y-3 w-full max-w-md">
        {todos.map((todo) => (
          <li
            key={todo.id}
            className="p-4 bg-slate-800 rounded-xl shadow-lg flex justify-between items-start border border-slate-700"
          >
            <div>
              <h2 className={`font-semibold ${todo.completed ? "line-through text-gray-500" : "text-gray-100"}`}>
                {todo.title}
              </h2>
              <p className="text-sm text-gray-400">{todo.description}</p>
            </div>
            <input
              type="checkbox"
              checked={todo.completed}
              onChange={() => toggleTodo(todo.id)}
              className="ml-2 accent-indigo-500"
            />
          </li>
        ))}
      </ul>

      {/* Floating Chat Button */}
      {!chatOpen && (
        <button
          onClick={() => setChatOpen(true)}
          className="fixed bottom-6 right-6 bg-gradient-to-r from-indigo-600 to-purple-700 text-white p-4 rounded-full shadow-lg hover:scale-110 transition transform"
        >
          💬
        </button>
      )}

      {/* Chat Window */}
      {chatOpen && (
        <div className="fixed bottom-20 right-6 w-80 h-96 bg-slate-900/95 backdrop-blur-md rounded-2xl shadow-2xl flex flex-col border border-slate-700">
          {/* Header */}
          <div className="bg-gradient-to-r from-indigo-600 to-purple-700 text-white p-3 flex justify-between items-center rounded-t-2xl shadow">
            <span className="font-semibold">Chatbot</span>
            <button onClick={() => setChatOpen(false)} className="hover:text-gray-300">
              ✖
            </button>
          </div>

          {/* Messages */}
          <div className="flex-1 p-3 overflow-y-auto space-y-2">
            {chatMessages.map((msg, i) => (
              <div
                key={i}
                className={`px-3 py-2 rounded-xl max-w-[75%] animate-fadeIn ${
                  msg.sender === "user"
                    ? "bg-gradient-to-r from-indigo-500 to-purple-600 text-white self-end ml-auto shadow-md"
                    : "bg-slate-700 text-gray-100 shadow-sm"
                }`}
              >
                {msg.text}
              </div>
            ))}
          </div>

          {/* Input */}
          <div className="p-3 border-t border-slate-700 flex gap-2">
            <input
              type="text"
              value={chatInput}
              onChange={(e) => setChatInput(e.target.value)}
              placeholder="Type a message..."
              className="flex-1 p-2 border border-slate-600 bg-slate-800 text-gray-100 rounded-lg shadow-inner focus:ring focus:ring-indigo-500"
            />
            <button
              onClick={handleSendMessage}
              className="bg-indigo-600 text-white px-4 rounded-lg shadow hover:bg-indigo-700 transition"
            >
              Send
            </button>
          </div>
        </div>
      )}
    </main>
  );
}
