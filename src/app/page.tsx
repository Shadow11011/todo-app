"use client";

import { useEffect, useState } from "react";
import { supabase } from "../lib/supabase";

// ----------------- Types -----------------
type Todo = {
  id: string;
  title: string;
  description: string;
  completed: boolean;
  created_at: string;
};

type ChatMessage = {
  id: number;
  sender: "user" | "bot";
  text: string;
};

// ----------------- Main Component -----------------
export default function Home() {
  // To-do state
  const [todos, setTodos] = useState<Todo[]>([]);
  const [newTask, setNewTask] = useState("");
  const [newDescription, setNewDescription] = useState("");
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editingTitle, setEditingTitle] = useState("");
  const [editingDescription, setEditingDescription] = useState("");

  // Chat state
  const [isChatOpen, setIsChatOpen] = useState(false);
  const [chatMessages, setChatMessages] = useState<ChatMessage[]>([]);
  const [chatInput, setChatInput] = useState("");

  // ----------------- To-do Functions -----------------
  useEffect(() => {
    fetchTodos();
  }, []);

  const fetchTodos = async () => {
    const { data, error } = await supabase
      .from("todos")
      .select("*")
      .order("created_at", { ascending: true });

    if (error) console.error("Error fetching todos:", error.message);
    else setTodos(data as Todo[]);
  };

  const addTodo = async () => {
    if (!newTask) return;

    const { data, error } = await supabase
      .from("todos")
      .insert([{ title: newTask, description: newDescription, completed: false }])
      .select();

    if (error) {
      console.error("Error adding todo:", error.message);
      return;
    }

    setTodos([...todos, ...(data as Todo[])]);
    setNewTask("");
    setNewDescription("");

    // Send to n8n webhook
    try {
      await fetch("http://localhost:5678/webhook-test/7c7bbf74-1eee-4b36-a5d2-a83af8e5a277", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          id: data![0].id,
          title: data![0].title,
          description: data![0].description,
        }),
      });
    } catch (err) {
      console.error("Error sending to n8n:", err);
    }
  };

  const toggleTodo = async (id: string, current: boolean) => {
    const { error } = await supabase
      .from("todos")
      .update({ completed: !current })
      .eq("id", id);

    if (error) console.error("Error updating todo:", error.message);
    else fetchTodos();
  };

  const startEdit = (id: string, title: string, description: string) => {
    setEditingId(id);
    setEditingTitle(title);
    setEditingDescription(description);
  };

  const saveEdit = async () => {
    if (!editingId || !editingTitle) return;

    const { error } = await supabase
      .from("todos")
      .update({ title: editingTitle, description: editingDescription })
      .eq("id", editingId);

    if (error) console.error("Error editing todo:", error.message);
    else {
      setEditingId(null);
      setEditingTitle("");
      setEditingDescription("");
      fetchTodos();
    }
  };

  const cancelEdit = () => {
    setEditingId(null);
    setEditingTitle("");
    setEditingDescription("");
  };

  const tasksRemaining = todos.filter((todo) => !todo.completed).length;

  // ----------------- Chat Functions -----------------
  const sendChatMessage = async () => {
    if (!chatInput.trim()) return;

    const newMsg: ChatMessage = {
      id: Date.now(),
      sender: "user",
      text: chatInput,
    };

    setChatMessages((prev) => [...prev, newMsg]);
    const currentInput = chatInput;
    setChatInput("");

    try {
      const res = await fetch("http://localhost:5678/webhook-test/d287ffa8-984d-486c-a2cd-a2a2de952b13", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ message: input }),
      });

      const data = await res.json();

      const botMessage = { sender: "bot", text: data.reply || "Sorry, I don’t understand." };
    setMessages((prev) => [...prev, botMessage]);
  } catch (err) {
    console.error("Chatbot error:", err);
    setMessages((prev) => [...prev, { sender: "bot", text: "⚠️ Connection error" }]);
  }
};

  // ----------------- Render -----------------
  return (
    <main className="min-h-screen bg-gray-900 flex flex-col items-center p-8 relative">
      <h1 className="text-4xl font-extrabold mb-6 text-white">📝 My To-Do List</h1>
      <p className="mb-4 text-gray-400">
        {tasksRemaining} task{tasksRemaining !== 1 ? "s" : ""} remaining
      </p>

      {/* Input for new tasks */}
      <div className="flex flex-col gap-3 mb-6 w-full max-w-md">
        <input
          value={newTask}
          onChange={(e) => setNewTask(e.target.value)}
          placeholder="Task title..."
          className="flex-1 border border-gray-700 rounded-lg px-4 py-2 bg-gray-800 text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
        />
        <textarea
          value={newDescription}
          onChange={(e) => setNewDescription(e.target.value)}
          placeholder="Task description..."
          className="flex-1 border border-gray-700 rounded-lg px-4 py-2 bg-gray-800 text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
        />
        <button
          onClick={addTodo}
          className="bg-blue-500 hover:bg-blue-600 text-white px-5 py-2 rounded-lg font-semibold transition"
        >
          Add
        </button>
      </div>

      {/* List of tasks */}
      <ul className="w-full max-w-md space-y-3">
        {todos.map((todo) => (
          <li
            key={todo.id}
            className="flex flex-col gap-2 bg-gray-800 p-4 rounded-xl shadow hover:shadow-md transition"
          >
            <div className="flex items-center gap-3">
              <input
                type="checkbox"
                checked={todo.completed}
                onChange={() => toggleTodo(todo.id, todo.completed)}
                className="w-5 h-5 accent-blue-500"
              />
              {editingId === todo.id ? (
                <input
                  value={editingTitle}
                  onChange={(e) => setEditingTitle(e.target.value)}
                  className="flex-1 border border-gray-600 rounded px-2 py-1 bg-gray-700 text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              ) : (
                <span
                  className={`text-lg text-white ${
                    todo.completed ? "line-through text-gray-500" : ""
                  }`}
                >
                  {todo.title}
                </span>
              )}
            </div>

            <div>
              {editingId === todo.id ? (
                <textarea
                  value={editingDescription}
                  onChange={(e) => setEditingDescription(e.target.value)}
                  className="w-full border border-gray-600 rounded px-2 py-1 bg-gray-700 text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              ) : (
                <p className="text-gray-300">{todo.description}</p>
              )}
            </div>

            {/* Buttons */}
            <div className="flex gap-2 justify-end">
              {editingId === todo.id ? (
                <>
                  <button
                    onClick={saveEdit}
                    className="bg-green-500 hover:bg-green-600 text-white px-3 py-1 rounded transition"
                  >
                    Save
                  </button>
                  <button
                    onClick={cancelEdit}
                    className="bg-gray-500 hover:bg-gray-600 text-white px-3 py-1 rounded transition"
                  >
                    Cancel
                  </button>
                </>
              ) : (
                <button
                  onClick={() => startEdit(todo.id, todo.title, todo.description)}
                  className="bg-yellow-500 hover:bg-yellow-600 text-white px-3 py-1 rounded transition"
                >
                  Edit
                </button>
              )}
            </div>
          </li>
        ))}
      </ul>

      {/* Chat bubble button */}
      <button
        onClick={() => setIsChatOpen(!isChatOpen)}
        className="fixed bottom-6 right-6 bg-blue-500 hover:bg-blue-600 text-white p-4 rounded-full shadow-lg"
      >
        💬
      </button>

      {/* Chat window */}
      {isChatOpen && (
        <div className="fixed bottom-20 right-6 w-80 bg-gray-800 rounded-xl shadow-lg flex flex-col overflow-hidden">
          <div className="bg-gray-700 px-4 py-2 text-white font-semibold">🤖 Chatbot</div>
          <div className="flex-1 overflow-y-auto p-3 space-y-2">
            {chatMessages.map((msg) => (
              <div
                key={msg.id}
                className={`px-3 py-2 rounded-lg max-w-[80%] ${
                  msg.sender === "user"
                    ? "bg-blue-500 text-white ml-auto"
                    : "bg-gray-600 text-white mr-auto"
                }`}
              >
                {msg.text}
              </div>
            ))}
          </div>
          <div className="flex p-2 border-t border-gray-700">
            <input
              value={chatInput}
              onChange={(e) => setChatInput(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && sendChatMessage()}
              placeholder="Type a message..."
              className="flex-1 bg-gray-700 text-white px-3 py-2 rounded-l-lg focus:outline-none"
            />
            <button
              onClick={sendChatMessage}
              className="bg-blue-500 hover:bg-blue-600 text-white px-4 rounded-r-lg"
            >
              Send
            </button>
          </div>
        </div>
      )}
    </main>
  );
}
