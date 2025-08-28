"use client";

import { useState, useEffect, FormEvent } from "react";
import { supabase } from "../lib/supabase";
import { User } from "@supabase/supabase-js";

type Todo = { id: string; title: string; description: string; completed: boolean; user_id?: string; created_at?: string };
type ChatMessage = { sender: "user" | "bot"; text: string };

export default function Home() {
  const [user, setUser] = useState<User | null>(null);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [authMode, setAuthMode] = useState<"login" | "signup">("login");

  const [todos, setTodos] = useState<Todo[]>([]);
  const [newTitle, setNewTitle] = useState("");
  const [newDescription, setNewDescription] = useState("");
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editTitle, setEditTitle] = useState("");
  const [editDescription, setEditDescription] = useState("");

  const [chatOpen, setChatOpen] = useState(false);
  const [chatInput, setChatInput] = useState("");
  const [chatMessages, setChatMessages] = useState<ChatMessage[]>([]);
  const [isSendingMessage, setIsSendingMessage] = useState(false);

  // --- n8n webhook URLs ---
const TODO_WEBHOOK_URL = "https://romantic-pig-hardy.ngrok-free.app/webhook/7c7bbf74-1eee-4b36-a5d2-a83af8e5a277";
const CHATBOT_WEBHOOK_URL = "https://romantic-pig-hardy.ngrok-free.app/webhook/d287ffa8-984d-486c-a2cd-a2a2de952b13";


  // --- Auth ---
  const signUp = async () => {
    const { error } = await supabase.auth.signUp({ email, password });
    if (error) alert(error.message);
    else alert("Check your email for verification link!");
  };

  const signIn = async () => {
    const { data, error } = await supabase.auth.signInWithPassword({ email, password });
    if (error) alert(error.message);
    else setUser(data.user);
  };

  const signOut = async () => {
    await supabase.auth.signOut();
    setUser(null);
    setTodos([]);
    setChatMessages([]);
    setChatInput("");
    setChatOpen(false);
  };

  useEffect(() => {
    const getSession = async () => {
      const { data } = await supabase.auth.getUser();
      if (data.user) setUser(data.user);
    };
    getSession();
  }, []);

  useEffect(() => {
    if (!user) return;
    const fetchTodos = async () => {
      const { data, error } = await supabase
        .from("todos")
        .select("*")
        .eq("user_id", user.id)
        .order("created_at", { ascending: false });
      if (error) console.error(error.message);
      else setTodos(data || []);
    };
    fetchTodos();
  }, [user]);

  // --- Call n8n Webhook ---
  const callTodoWebhook = async (action: string, todo: Todo) => {
    try {
      await fetch(TODO_WEBHOOK_URL, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action, todo, timestamp: new Date().toISOString() }),
      });
    } catch (err) {
      console.error("Todo webhook error:", err);
    }
  };

  // --- Todo CRUD ---
  const handleAddTodo = async (e: FormEvent) => {
    e.preventDefault();
    if (!newTitle.trim() || !user) return;

    const { data, error } = await supabase
      .from("todos")
      .insert([{ title: newTitle, description: newDescription, completed: false, user_id: user.id }])
      .select();

    if (error) return console.error(error.message);

    const newTodo = data[0];
    setTodos((prev) => [newTodo, ...prev]);
    setNewTitle("");
    setNewDescription("");

    // Send to n8n webhook
    callTodoWebhook("CREATE", newTodo);
  };

  const toggleTodo = async (id: string, completed: boolean) => {
    const { data, error } = await supabase.from("todos").update({ completed: !completed }).eq("id", id).select();
    if (error) return console.error(error.message);

    const updatedTodo = data[0];
    setTodos((prev) => prev.map((t) => (t.id === id ? updatedTodo : t)));

    callTodoWebhook("TOGGLE", updatedTodo);
  };

  const saveEdit = async (id: string) => {
    const { data, error } = await supabase.from("todos").update({ title: editTitle, description: editDescription }).eq("id", id).select();
    if (error) return console.error(error.message);

    const updatedTodo = data[0];
    setTodos((prev) => prev.map((t) => (t.id === id ? updatedTodo : t)));
    setEditingId(null);

    callTodoWebhook("UPDATE", updatedTodo);
  };

  const deleteTodo = async (id: string) => {
    await supabase.from("todos").delete().eq("id", id);
    setTodos((prev) => prev.filter((t) => t.id !== id));

    callTodoWebhook("DELETE", { id } as Todo);
  };

  // --- Chatbot ---
  const handleSendMessage = async () => {
    if (!chatInput.trim() || !user || isSendingMessage) return;

    const userMessage = { sender: "user" as const, text: chatInput };
    setChatMessages((prev) => [...prev, userMessage]);
    const currentInput = chatInput;
    setChatInput("");
    setIsSendingMessage(true);

    try {
      // Send to local API (route.ts) to store in Supabase and get bot response
      const res = await fetch("/api/chatbot", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ 
          message: currentInput, 
          user_id: user.id,
          user_email: user.email
        }),
      });
      
      if (!res.ok) {
        throw new Error(`HTTP error! status: ${res.status}`);
      }
      
      const data = await res.json();
      setChatMessages((prev) => [...prev, { sender: "bot", text: data.reply || "Sorry, I don't understand." }]);
      
      // Also send to n8n webhook for processing (fire and forget)
      try {
        await fetch(CHATBOT_WEBHOOK_URL, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ 
            message: currentInput, 
            user_id: user.id, 
            user_email: user.email,
            bot_response: data.reply
          }),
        });
      } catch (n8nErr) {
        console.error("n8n webhook error:", n8nErr);
        // Don't show this error to the user as it's a secondary process
      }
    } catch (err) {
      console.error("Chat error:", err);
      setChatMessages((prev) => [...prev, { sender: "bot", text: "Error connecting to the chatbot service." }]);
    } finally {
      setIsSendingMessage(false);
    }
  };

  // --- If not logged in: show Auth UI ---
  if (!user) {
    return (
      <main className="min-h-screen flex items-center justify-center bg-gray-900 text-gray-100">
        <div className="bg-slate-800 p-8 rounded-xl shadow-xl w-96 space-y-4">
          <h1 className="text-2xl font-bold text-indigo-400">
            {authMode === "login" ? "Login" : "Sign Up"}
          </h1>
          <input
            type="email"
            placeholder="Email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            className="w-full p-2 border border-slate-600 bg-slate-900 rounded-lg"
          />
          <input
            type="password"
            placeholder="Password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            className="w-full p-2 border border-slate-600 bg-slate-900 rounded-lg"
          />
          <button
            onClick={authMode === "login" ? signIn : signUp}
            className="w-full bg-indigo-600 text-white py-2 rounded-lg hover:bg-indigo-700"
          >
            {authMode === "login" ? "Login" : "Sign Up"}
          </button>
          <p className="text-sm text-gray-400 text-center">
            {authMode === "login" ? (
              <>
                Don&apos;t have an account?{" "}
                <button
                  onClick={() => setAuthMode("signup")}
                  className="text-indigo-400 hover:underline"
                >
                  Sign up
                </button>
              </>
            ) : (
              <>
                Already have an account?{" "}
                <button
                  onClick={() => setAuthMode("login")}
                  className="text-indigo-400 hover:underline"
                >
                  Login
                </button>
              </>
            )}
          </p>
        </div>
      </main>
    );
  }

  // --- If logged in: show Todos + Chat ---
  return (
    <main className="min-h-screen bg-gradient-to-br from-gray-900 via-slate-900 to-black text-gray-100 p-8 flex flex-col items-center">
      <div className="flex justify-between w-full max-w-md mb-6">
        <h1 className="text-3xl font-bold text-indigo-400">Todo App + Chatbot</h1>
        <button
          onClick={signOut}
          className="bg-red-600 text-white px-4 py-2 rounded-lg hover:bg-red-700"
        >
          Logout
        </button>
      </div>

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
            className="p-4 bg-slate-800 rounded-xl shadow-lg border border-slate-700"
          >
            {editingId === todo.id ? (
              <div className="space-y-2">
                <input
                  type="text"
                  value={editTitle}
                  onChange={(e) => setEditTitle(e.target.value)}
                  className="w-full p-2 border border-slate-600 bg-slate-900 text-gray-100 rounded-lg"
                />
                <textarea
                  value={editDescription}
                  onChange={(e) => setEditDescription(e.target.value)}
                  className="w-full p-2 border border-slate-600 bg-slate-900 text-gray-100 rounded-lg"
                />
                <div className="flex gap-2">
                  <button
                    onClick={() => saveEdit(todo.id)}
                    className="flex-1 bg-indigo-600 text-white p-2 rounded-lg hover:bg-indigo-700"
                  >
                    Save
                  </button>
                  <button
                    onClick={() => setEditingId(null)}
                    className="flex-1 bg-slate-600 text-white p-2 rounded-lg hover:bg-slate-700"
                  >
                    Cancel
                  </button>
                </div>
              </div>
            ) : (
              <div className="flex justify-between items-start">
                <div>
                  <h2
                    className={`font-semibold ${
                      todo.completed
                        ? "line-through text-gray-500"
                        : "text-gray-100"
                    }`}
                  >
                    {todo.title}
                  </h2>
                  <p className="text-sm text-gray-400">{todo.description}</p>
                </div>
                <div className="flex items-center gap-2">
                  <input
                    type="checkbox"
                    checked={todo.completed}
                    onChange={() => toggleTodo(todo.id, todo.completed)}
                    className="accent-indigo-500"
                  />
                  <button
                    onClick={() => {
                      setEditingId(todo.id);
                      setEditTitle(todo.title);
                      setEditDescription(todo.description);
                    }}
                    className="text-indigo-400 hover:text-indigo-300 text-sm"
                  >
                    ✎ Edit
                  </button>
                  <button
                    onClick={() => deleteTodo(todo.id)}
                    className="text-red-400 hover:text-red-300 text-sm"
                  >
                    🗑 Delete
                  </button>
                </div>
              </div>
            )}
          </li>
        ))}
      </ul>

      {/* Chat Button & Window */}
      {!chatOpen && (
        <button
          onClick={() => setChatOpen(true)}
          className="fixed bottom-6 right-6 bg-gradient-to-r from-indigo-600 to-purple-700 text-white p-4 rounded-full shadow-lg hover:scale-110 transition transform"
        >
          💬
        </button>
      )}
      {chatOpen && (
        <div className="fixed bottom-20 right-6 w-80 h-96 bg-slate-900/95 backdrop-blur-md rounded-2xl shadow-2xl flex flex-col border border-slate-700">
          <div className="bg-gradient-to-r from-indigo-600 to-purple-700 text-white p-3 flex justify-between items-center rounded-t-2xl shadow">
            <span className="font-semibold">Chatbot</span>
            <button
              onClick={() => setChatOpen(false)}
              className="hover:text-gray-300"
            >
              ✖
            </button>
          </div>
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
            {isSendingMessage && (
              <div className="px-3 py-2 rounded-xl max-w-[75%] bg-slate-700 text-gray-100 shadow-sm">
                Thinking...
              </div>
            )}
          </div>
          <div className="p-3 border-t border-slate-700 flex gap-2">
            <input
              type="text"
              value={chatInput}
              onChange={(e) => setChatInput(e.target.value)}
              placeholder="Type a message..."
              className="flex-1 p-2 border border-slate-600 bg-slate-800 text-gray-100 rounded-lg shadow-inner focus:ring focus:ring-indigo-500"
              onKeyDown={(e) => {
                if (e.key === "Enter" && !e.shiftKey) {
                  e.preventDefault();
                  handleSendMessage();
                }
              }}
              disabled={isSendingMessage}
            />
            <button
              onClick={handleSendMessage}
              className="bg-indigo-600 text-white px-4 rounded-lg shadow hover:bg-indigo-700 transition disabled:opacity-50"
              disabled={isSendingMessage || !chatInput.trim()}
            >
              Send
            </button>
          </div>
        </div>
      )}
    </main>
  );
}
