"use client";

import { useEffect, useState, useRef, FormEvent } from "react";
import { supabase } from "../lib/supabase";
import { User } from "@supabase/supabase-js";

/**
 * Chat behavior:
 * - Default: persist chat to localStorage per-user (key = `chat_messages_${user.id}`)
 * - On send: POST to CHATBOT_WEBHOOK_URL with { sender, message, user_id, created_at }
 * - Add user message (optimistic) to UI/localStorage, await webhook reply, then add bot reply.
 * - On logout: clear chat state and localStorage key for that user.
 *
 * Optional (commented): how to persist to Supabase for cross-device sync (use sender, created_at, user_id).
 */

type Todo = {
  id: string;
  title: string;
  description: string;
  completed: boolean;
  user_id?: string;
  created_at?: string;
};

type ChatMessage = {
  id: string; // local id
  sender: "user" | "bot";
  message: string; // column name 'message' as you described (or 'text' if your DB uses that)
  user_id: string;
  created_at: string; // ISO string
};

export default function Home() {
  // --- Auth / todos - keep existing behavior ---
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
  const [todoToDelete, setTodoToDelete] = useState<Todo | null>(null);

  // --- Chat state ---
  const [chatOpen, setChatOpen] = useState(false);
  const [chatInput, setChatInput] = useState("");
  const [chatMessages, setChatMessages] = useState<ChatMessage[]>([]);
  const chatContainerRef = useRef<HTMLDivElement | null>(null);

  const TODO_WEBHOOK_URL = "https://romantic-pig-hardy.ngrok-free.app/webhook/7c7bbf74-1eee-4b36-a5d2-a83af8e5a277";
  const CHATBOT_WEBHOOK_URL = "https://romantic-pig-hardy.ngrok-free.app/webhook/d287ffa8-984d-486c-a2cd-a2a2de952b13";

  // helper localStorage key generator (per-user)
  const storageKeyForUser = (userId: string | undefined | null) =>
    userId ? `chat_messages_${userId}` : "chat_messages_anonymous";

  // scroll to bottom when messages change
  useEffect(() => {
    if (!chatContainerRef.current) return;
    chatContainerRef.current.scrollTop = chatContainerRef.current.scrollHeight;
  }, [chatMessages]);

  // --- AUTH: get session & subscribe (keeps from your earlier code) ---
  useEffect(() => {
    const getSession = async () => {
      const { data } = await supabase.auth.getUser();
      if (data?.user) setUser(data.user);
    };
    getSession();

    const { data: authListener } = supabase.auth.onAuthStateChange((_event, session) => {
      setUser(session?.user ?? null);
    });

    return () => {
      if (authListener?.subscription) authListener.subscription.unsubscribe();
    };
  }, []);

  // load todos for user (keeps original behavior)
  useEffect(() => {
    if (!user) return;
    const fetchTodos = async () => {
      const { data, error } = await supabase
        .from("todos")
        .select("*")
        .eq("user_id", user.id)
        .order("created_at", { ascending: false });
      if (error) console.error(error);
      else setTodos(data || []);
    };
    fetchTodos();
  }, [user]);

  // --- Chat: load from localStorage on user change ---
  useEffect(() => {
    // When user changes (login/logout), load their chat from localStorage
    if (!user) {
      // Not logged in: keep chat empty (or optionally load anonymous)
      setChatMessages([]);
      return;
    }

    const key = storageKeyForUser(user.id);
    try {
      const raw = localStorage.getItem(key);
      if (raw) {
        const parsed = JSON.parse(raw) as ChatMessage[];
        // Defensive: ensure it's an array and each item has created_at
        const normalized = (parsed || []).filter(Boolean).map((m) => ({
          ...m,
          created_at: m.created_at || new Date().toISOString(),
        }));

        // Sort by created_at ascending (oldest first) so display order is chronological
        normalized.sort((a, b) => (a.created_at < b.created_at ? -1 : a.created_at > b.created_at ? 1 : 0));
        setChatMessages(normalized);
      } else {
        setChatMessages([]);
      }
    } catch (err) {
      console.error("Failed to parse chat from localStorage", err);
      setChatMessages([]);
    }
  }, [user]);

  // Save chatMessages to localStorage anytime they change (for current user)
  useEffect(() => {
    if (!user) return;
    const key = storageKeyForUser(user.id);
    try {
      localStorage.setItem(key, JSON.stringify(chatMessages));
    } catch (err) {
      console.error("Failed to write chat to localStorage", err);
    }
  }, [chatMessages, user]);

  // Clear chat on logout (removes the per-user key)
  const clearChatForCurrentUser = () => {
    if (!user) {
      setChatMessages([]);
      return;
    }
    const key = storageKeyForUser(user.id);
    try {
      localStorage.removeItem(key);
    } catch (err) {
      console.error("Failed to remove chat key", err);
    }
    setChatMessages([]);
  };

  // --- Auth helpers (signUp, signIn, signOut) similar to your previous code ---
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
    // clear app state
    setUser(null);
    setTodos([]);
    setChatInput("");
    setChatOpen(false);
    // clear chat for the just-logged-out user
    clearChatForCurrentUser();
  };

  // --- Chat send (no DB writes) but send the full payload to your webhook ---
  const handleSendMessage = async () => {
    if (!chatInput.trim() || !user) return;

    const now = new Date().toISOString();
    const userMessage: ChatMessage = {
      id: `${Date.now()}-${Math.random().toString(36).slice(2, 9)}`,
      sender: "user",
      message: chatInput,
      user_id: user.id,
      created_at: now,
    };

    // Optimistic UI: add user message to state & localStorage immediately
    setChatMessages((prev) => {
      const next = [...prev, userMessage].sort((a, b) => (a.created_at < b.created_at ? -1 : 1));
      return next;
    });
    setChatInput("");

    // POST to webhook with full required fields
    try {
      await fetch(CHATBOT_WEBHOOK_URL, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          sender: userMessage.sender,
          message: userMessage.message,
          user_id: userMessage.user_id,
          created_at: userMessage.created_at,
        }),
      }).then(async (res) => {
        // try to parse reply (depends on your webhook shape)
        // Expecting something like { reply: string, newTodo?: {...} }
        if (!res.ok) {
          // server error — show bot error message
          const botError: ChatMessage = {
            id: `${Date.now()}-${Math.random().toString(36).slice(2, 9)}`,
            sender: "bot",
            message: "Error from bot: non-200 response",
            user_id: user.id,
            created_at: new Date().toISOString(),
          };
          setChatMessages((prev) => [...prev, botError].sort((a, b) => (a.created_at < b.created_at ? -1 : 1)));
          return;
        }

        const data = await res.json().catch(() => null);

        // If your webhook responds with a `reply` field:
        if (data?.reply) {
          const botMessage: ChatMessage = {
            id: `${Date.now()}-${Math.random().toString(36).slice(2, 9)}`,
            sender: "bot",
            message: String(data.reply),
            user_id: user.id,
            created_at: data.created_at || new Date().toISOString(),
          };
          setChatMessages((prev) => [...prev, botMessage].sort((a, b) => (a.created_at < b.created_at ? -1 : 1)));

          // If webhook also created a todo and returned it:
          if (data.newTodo) {
            setTodos((prev) => [data.newTodo, ...prev]);
          }
        } else {
          // fallback bot message if webhook didn't return expected field
          const botMessage: ChatMessage = {
            id: `${Date.now()}-${Math.random().toString(36).slice(2, 9)}`,
            sender: "bot",
            message: "Bot replied but returned no text.",
            user_id: user.id,
            created_at: new Date().toISOString(),
          };
          setChatMessages((prev) => [...prev, botMessage].sort((a, b) => (a.created_at < b.created_at ? -1 : 1)));
        }
      });
    } catch (err) {
      console.error("chat webhook error", err);
      const botMessage: ChatMessage = {
        id: `${Date.now()}-${Math.random().toString(36).slice(2, 9)}`,
        sender: "bot",
        message: "Error connecting to bot.",
        user_id: user.id,
        created_at: new Date().toISOString(),
      };
      setChatMessages((prev) => [...prev, botMessage].sort((a, b) => (a.created_at < b.created_at ? -1 : 1)));
    }
  };

  // --- Optional: How to persist to Supabase (commented guidance)
  //
  // If you want server-side persistence (so chat is available on other devices),
  // replace the localStorage flow with Supabase inserts + fetch:
  //
  // 1) On load (when user changes) fetch messages:
  // const { data } = await supabase
  //   .from("chat_messages")
  //   .select("*")
  //   .eq("user_id", user.id)
  //   .order("created_at", { ascending: true });
  //
  // 2) To store a message on send:
  // await supabase
  //   .from("chat_messages")
  //   .insert([{ sender: 'user', message: userMessage.message, user_id: user.id, created_at: userMessage.created_at }]);
  //
  // 3) Use realtime subscription on `chat_messages` table:
  // supabase.channel('public:chat_messages').on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'chat_messages', filter: `user_id=eq.${user.id}` }, (payload) => {
  //   const m = payload.new as any;
  //   // use m.sender, m.message, m.created_at, m.user_id to push to UI
  // });
  //
  // That way you can determine "which side" by `sender` (bot/user), order by `created_at`, and owner by `user_id`.

  // --- Todo handlers (kept same as before) ---
  const callTodoWebhook = async (action: string, todo: Partial<Todo>) => {
    try {
      await fetch(TODO_WEBHOOK_URL, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action, todo, timestamp: new Date().toISOString() }),
      });
    } catch (err) {
      console.error("Webhook error:", err);
    }
  };

  const handleAddTodo = async (e: FormEvent) => {
    e.preventDefault();
    if (!newTitle.trim() || !user) return;

    const { data, error } = await supabase
      .from("todos")
      .insert([{ title: newTitle, description: newDescription, completed: false, user_id: user.id }])
      .select();

    if (error) return console.error(error.message);

    const newTodo = data ? data[0] : null;
    if (newTodo) {
      setTodos((prev) => [newTodo, ...prev]);
      callTodoWebhook("CREATE", newTodo);
    }
    setNewTitle("");
    setNewDescription("");
  };

  const toggleTodo = async (id: string, completed: boolean) => {
    const { error } = await supabase.from("todos").update({ completed: !completed }).eq("id", id);
    if (error) return console.error(error.message);

    setTodos((prev) => prev.map((t) => (t.id === id ? { ...t, completed: !completed } : t)));
    const found = todos.find((t) => t.id === id);
    if (found) callTodoWebhook("TOGGLE", found);
  };

  const saveEdit = async (id: string) => {
    const { error } = await supabase
      .from("todos")
      .update({ title: editTitle, description: editDescription })
      .eq("id", id);
    if (error) return console.error(error.message);

    setTodos((prev) => prev.map((t) => (t.id === id ? { ...t, title: editTitle, description: editDescription } : t)));
    setEditingId(null);
    const found = todos.find((t) => t.id === id);
    if (found) callTodoWebhook("UPDATE", found);
  };

  const confirmDelete = (todo: Todo) => setTodoToDelete(todo);
  const cancelDelete = () => setTodoToDelete(null);

  const executeDelete = async () => {
    if (!todoToDelete) return;
    const { error } = await supabase.from("todos").delete().eq("id", todoToDelete.id);
    if (error) return console.error(error.message);
    setTodos((prev) => prev.filter((t) => t.id !== todoToDelete.id));
    callTodoWebhook("DELETE", { id: todoToDelete.id });
    setTodoToDelete(null);
  };

  // --- Render ---
  if (!user) {
    return (
      <main className="min-h-screen flex items-center justify-center bg-gray-900 text-gray-100">
        <div className="bg-slate-800 p-8 rounded-xl shadow-xl w-96 space-y-4">
          <h1 className="text-2xl font-bold text-indigo-400">{authMode === "login" ? "Login" : "Sign Up"}</h1>
          <input type="email" placeholder="Email" value={email} onChange={(e) => setEmail(e.target.value)} className="w-full p-2 border border-slate-600 bg-slate-900 rounded-lg" />
          <input type="password" placeholder="Password" value={password} onChange={(e) => setPassword(e.target.value)} className="w-full p-2 border border-slate-600 bg-slate-900 rounded-lg" />
          <button onClick={authMode === "login" ? signIn : signUp} className="w-full bg-indigo-600 text-white py-2 rounded-lg hover:bg-indigo-700">
            {authMode === "login" ? "Login" : "Sign Up"}
          </button>
          <p className="text-sm text-gray-400 text-center">
            {authMode === "login" ? (
              <>
                Don&apos;t have an account?{" "}
                <button onClick={() => setAuthMode("signup")} className="text-indigo-400 hover:underline">
                  Sign up
                </button>
              </>
            ) : (
              <>
                Already have an account?{" "}
                <button onClick={() => setAuthMode("login")} className="text-indigo-400 hover:underline">
                  Login
                </button>
              </>
            )}
          </p>
        </div>
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-gradient-to-br from-gray-900 via-slate-900 to-black text-gray-100 p-8 flex flex-col items-center">
      <div className="flex justify-between w-full max-w-md mb-6">
        <h1 className="text-3xl font-bold text-indigo-400">Todo App + Chatbot</h1>
        <button onClick={signOut} className="bg-red-600 text-white px-4 py-2 rounded-lg hover:bg-red-700">
          Logout
        </button>
      </div>

      {/* Todo Form */}
      <form onSubmit={handleAddTodo} className="space-y-4 bg-slate-800/80 p-6 rounded-2xl shadow-xl max-w-md border border-slate-700">
        <input type="text" placeholder="Enter title..." value={newTitle} onChange={(e) => setNewTitle(e.target.value)} className="w-full p-2 border border-slate-600 bg-slate-900 text-gray-100 rounded-lg shadow-inner focus:ring focus:ring-indigo-500" />
        <textarea placeholder="Enter description..." value={newDescription} onChange={(e) => setNewDescription(e.target.value)} className="w-full p-2 border border-slate-600 bg-slate-900 text-gray-100 rounded-lg shadow-inner focus:ring focus:ring-indigo-500" />
        <button type="submit" className="w-full bg-gradient-to-r from-indigo-600 to-purple-700 text-white p-2 rounded-lg shadow-lg hover:scale-105 transition">
          Add Todo
        </button>
      </form>

      {/* Todo List */}
      <ul className="mt-6 space-y-3 w-full max-w-md">
        {todos.map((todo) => (
          <li key={todo.id} className="p-4 bg-slate-800 rounded-xl shadow-lg border border-slate-700">
            {editingId === todo.id ? (
              <div className="space-y-2">
                <input value={editTitle} onChange={(e) => setEditTitle(e.target.value)} className="w-full p-2 border border-slate-600 bg-slate-900 text-gray-100 rounded-lg" />
                <textarea value={editDescription} onChange={(e) => setEditDescription(e.target.value)} className="w-full p-2 border border-slate-600 bg-slate-900 text-gray-100 rounded-lg" />
                <div className="flex gap-2">
                  <button onClick={() => saveEdit(todo.id)} className="flex-1 bg-indigo-600 text-white p-2 rounded-lg hover:bg-indigo-700">
                    Save
                  </button>
                  <button onClick={() => setEditingId(null)} className="flex-1 bg-slate-600 text-white p-2 rounded-lg hover:bg-slate-700">
                    Cancel
                  </button>
                </div>
              </div>
            ) : (
              <div className="flex justify-between items-start">
                <div>
                  <h2 className={`font-semibold ${todo.completed ? "line-through text-gray-500" : "text-gray-100"}`}>{todo.title}</h2>
                  <p className="text-sm text-gray-400">{todo.description}</p>
                </div>
                <div className="flex items-center gap-2">
                  <input type="checkbox" checked={todo.completed} onChange={() => toggleTodo(todo.id, todo.completed)} className="accent-indigo-500" />
                  <button onClick={() => { setEditingId(todo.id); setEditTitle(todo.title); setEditDescription(todo.description); }} className="text-indigo-400 hover:text-indigo-300 text-sm">✎ Edit</button>
                  <button onClick={() => confirmDelete(todo)} className="text-red-400 hover:text-red-300 text-sm">🗑 Delete</button>
                </div>
              </div>
            )}
          </li>
        ))}
      </ul>

      {/* Delete Confirmation */}
      {todoToDelete && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-slate-800 p-6 rounded-xl shadow-xl max-w-md w-full mx-4 border border-slate-700">
            <h3 className="text-xl font-semibold text-gray-100 mb-4">Confirm Delete</h3>
            <p className="text-gray-300 mb-6">
              Are you sure you want to delete &quot;{todoToDelete.title}&quot;? This action cannot be undone.
            </p>
            <div className="flex gap-3 justify-end">
              <button onClick={cancelDelete} className="px-4 py-2 bg-slate-600 text-white rounded-lg hover:bg-slate-700 transition">
                Cancel
              </button>
              <button onClick={executeDelete} className="px-4 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700 transition">
                Delete
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Chat Button & Window */}
      {!chatOpen && (
        <button onClick={() => setChatOpen(true)} className="fixed bottom-6 right-6 bg-gradient-to-r from-indigo-600 to-purple-700 text-white p-4 rounded-full shadow-lg hover:scale-110 transition transform">💬</button>
      )}
      {chatOpen && (
        <div className="fixed bottom-20 right-6 w-80 h-96 bg-slate-900/95 backdrop-blur-md rounded-2xl shadow-2xl flex flex-col border border-slate-700">
          <div className="bg-gradient-to-r from-indigo-600 to-purple-700 text-white p-3 flex justify-between items-center rounded-t-2xl shadow">
            <span className="font-semibold">Chatbot</span>
            <button onClick={() => setChatOpen(false)} className="hover:text-gray-300">✖</button>
          </div>

          <div ref={chatContainerRef} className="flex-1 p-3 overflow-y-auto space-y-2">
            {/* ensure chronological order by created_at */}
            {chatMessages
              .slice()
              .sort((a, b) => (a.created_at < b.created_at ? -1 : a.created_at > b.created_at ? 1 : 0))
              .map((msg) => (
                <div
                  key={msg.id}
                  className={`px-3 py-2 rounded-xl max-w-[75%] animate-fadeIn ${
                    msg.sender === "user"
                      ? "bg-gradient-to-r from-indigo-500 to-purple-600 text-white self-end ml-auto shadow-md"
                      : "bg-slate-700 text-gray-100 self-start shadow-md"
                  }`}
                >
                  {msg.message}
                </div>
              ))}
          </div>

          <div className="p-3 flex gap-2">
            <input value={chatInput} onChange={(e) => setChatInput(e.target.value)} placeholder="" className="flex-1 p-2 rounded-lg bg-slate-800 text-gray-100 focus:ring focus:ring-indigo-500" onKeyDown={(e) => e.key === "Enter" && handleSendMessage()} />
            <button onClick={handleSendMessage} className="bg-indigo-600 text-white px-4 py-2 rounded-lg hover:bg-indigo-700 transition">Send</button>
          </div>
        </div>
      )}

      <style jsx>{`
        @keyframes fadeIn {
          from { opacity: 0; transform: translateY(5px); }
          to { opacity: 1; transform: translateY(0); }
        }
        .animate-fadeIn {
          animation: fadeIn 0.25s ease-in;
        }
      `}</style>
    </main>
  );
}
