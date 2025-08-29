"use client";

import { useEffect, useState, useRef, FormEvent } from "react";
import { supabase } from "../lib/supabase";
import { User } from "@supabase/supabase-js";

/**
 * Expects chat_messages schema:
 * id uuid PK default gen_random_uuid()
 * user_id uuid
 * message text
 * created_at timestamptz default now()
 * sender text ('user' | 'bot')
 */

type Todo = {
  id: string;
  title: string;
  description: string;
  completed: boolean;
  user_id?: string;
  created_at?: string;
};

type ChatMessageDB = {
  id: string;
  sender: "user" | "bot" | string;
  message: string;
  user_id: string | null;
  created_at: string; // ISO from DB
};

// Local message that may be optimistic/pending
type LocalMessage = ChatMessageDB & { pending?: boolean; tempId?: string };

const PAGE_SIZE = 20;

export default function Home() {
  // --- Auth & base state ---
  const [user, setUser] = useState<User | null>(null);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [authMode, setAuthMode] = useState<"login" | "signup">("login");

  // Todos
  const [todos, setTodos] = useState<Todo[]>([]);
  const [newTitle, setNewTitle] = useState("");
  const [newDescription, setNewDescription] = useState("");
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editTitle, setEditTitle] = useState("");
  const [editDescription, setEditDescription] = useState("");
  const [todoToDelete, setTodoToDelete] = useState<Todo | null>(null);

  // Chat
  const [chatOpen, setChatOpen] = useState(false);
  const [chatInput, setChatInput] = useState("");
  const [chatMessages, setChatMessages] = useState<LocalMessage[]>([]);
  const [loadingMore, setLoadingMore] = useState(false);
  const [hasMore, setHasMore] = useState(false);
  const [clearConfirmOpen, setClearConfirmOpen] = useState(false);
  const [clearing, setClearing] = useState(false);
  const chatContainerRef = useRef<HTMLDivElement | null>(null);

  const TODO_WEBHOOK_URL = "https://romantic-pig-hardy.ngrok-free.app/webhook/7c7bbf74-1eee-4b36-a5d2-a83af8e5a277";
  const CHATBOT_WEBHOOK_URL = "https://romantic-pig-hardy.ngrok-free.app/webhook/d287ffa8-984d-486c-a2cd-a2a2de952b13";

  // Robust auto-scroll helper
  const scrollToBottom = (smooth = true) => {
    const el = chatContainerRef.current;
    if (!el) return;
    // Use rAF and small timeout to ensure DOM has painted
    requestAnimationFrame(() => {
      setTimeout(() => {
        try {
          if (smooth) {
            el.scrollTo({ top: el.scrollHeight, behavior: "smooth" as ScrollBehavior });
          } else {
            el.scrollTop = el.scrollHeight;
          }
        } catch (_) {
          el.scrollTop = el.scrollHeight;
        }
      }, 40);
    });
  };

  // scroll to bottom when messages change
  useEffect(() => {
    scrollToBottom();
  }, [chatMessages]);

  // scroll to bottom when chat opens
  useEffect(() => {
    if (chatOpen) scrollToBottom(false);
  }, [chatOpen]);

  // --- Auth: get session & listen for changes ---
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

  // --- Todos: fetch on user change (unchanged) ---
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

  // --- Chat: initial paginated fetch (latest PAGE_SIZE messages) on user change ---
  useEffect(() => {
    if (!user) {
      setChatMessages([]);
      setHasMore(false);
      return;
    }

    const fetchLatestPage = async () => {
      try {
        const result = await supabase
          .from("chat_messages")
          .select("*")
          .eq("user_id", user.id)
          .order("created_at", { ascending: false })
          .limit(PAGE_SIZE);

        if (result.error) {
          console.error("Failed to fetch chat messages:", result.error);
          setChatMessages([]);
          setHasMore(false);
          return;
        }

        const data = result.data as ChatMessageDB[] | null;
        const rows = (data || []).map((r) => ({ ...r, pending: false })) as LocalMessage[];
        rows.reverse();
        setChatMessages(rows);
        setHasMore((data?.length || 0) === PAGE_SIZE);
      } catch (err) {
        console.error("Unexpected error fetching chat:", err);
        setChatMessages([]);
        setHasMore(false);
      }
    };

    fetchLatestPage();
  }, [user]);

  // --- Chat: load earlier (pagination) ---
  const loadEarlier = async () => {
    if (!user || chatMessages.length === 0) return;
    setLoadingMore(true);
    try {
      const earliest = chatMessages[0].created_at;
      const result = await supabase
        .from("chat_messages")
        .select("*")
        .eq("user_id", user.id)
        .lt("created_at", earliest)
        .order("created_at", { ascending: false })
        .limit(PAGE_SIZE);

      if (result.error) {
        console.error("Failed to load earlier messages:", result.error);
        setLoadingMore(false);
        return;
      }

      const data = result.data as ChatMessageDB[] | null;
      const rows = (data || []).map((r) => ({ ...r, pending: false })) as LocalMessage[];
      rows.reverse();
      setChatMessages((prev) => [...rows, ...prev]);
      setHasMore((data?.length || 0) === PAGE_SIZE);

      // After prepending older messages, keep the view roughly at the same message:
      // small delay then scroll to earliest new message position (here we scroll a bit so the user sees context)
      setTimeout(() => {
        const el = chatContainerRef.current;
        if (!el) return;
        // keep scroll near the first previously-visible message by setting to a small offset from top
        el.scrollTop = Math.min(200, el.scrollHeight);
      }, 60);
    } catch (err) {
      console.error("Unexpected error loading earlier chat:", err);
    } finally {
      setLoadingMore(false);
    }
  };

  // --- Chat: send message workflow (client does NOT insert to Supabase) ---
  // Shows user's message immediately, then shows bot 'thinking...' bubble, calls webhook,
  // replaces the bot 'thinking...' with webhook's returned bot message (prefer botRow if provided).
  const handleSendMessage = async () => {
    if (!chatInput.trim() || !user) return;

    const nowIso = new Date().toISOString();
    // create optimistic user message (immediate)
    const userLocal: LocalMessage = {
      id: `local-user-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`,
      sender: "user",
      message: chatInput,
      user_id: user.id,
      created_at: nowIso,
      pending: false,
    };

    // create bot pending bubble (optimistic)
    const botTempId = `temp-bot-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
    const botPending: LocalMessage = {
      id: botTempId,
      sender: "bot",
      message: "thinking…", // visual placeholder
      user_id: user.id,
      created_at: nowIso, // local timestamp; DB will have server timestamp
      pending: true,
      tempId: botTempId,
    };

    // Add both: user message then bot pending
    setChatMessages((prev) => {
      const next = [...prev, userLocal, botPending];
      next.sort((a, b) => (a.created_at < b.created_at ? -1 : a.created_at > b.created_at ? 1 : 0));
      return next;
    });

    // auto-scroll to bottom so user sees the pending bot bubble
    scrollToBottom();

    // clear input right away
    setChatInput("");

    // POST to webhook. Include tempId so webhook can return it / relate rows if desired.
    try {
      const payload = {
        temp_id: botTempId, // helpful for exact matching if your webhook returns it
        sender: "user",
        message: userLocal.message,
        user_id: user.id,
        created_at: userLocal.created_at, // optional; server will set its own timestamp as well
      };

      const res = await fetch(CHATBOT_WEBHOOK_URL, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      if (!res.ok) {
        // replace pending with bot error message
        setChatMessages((prev) => {
          const filtered = prev.filter((m) => m.id !== botTempId);
          filtered.push({
            id: `local-boterr-${Date.now()}`,
            sender: "bot",
            message: "Chatbot webhook error.",
            user_id: user.id,
            created_at: new Date().toISOString(),
            pending: false,
          });
          return filtered;
        });
        scrollToBottom();
        return;
      }

      // Expectation: webhook returns something like:
      // { reply: "Hi!", botRow?: { id, sender, message, user_id, created_at }, insertedServerSide?: true }
      const data = await res.json().catch(() => null);

      // If webhook returned botRow, replace pending with the DB row
      if (data?.botRow) {
        const botRow = data.botRow as ChatMessageDB;
        setChatMessages((prev) => {
          // remove pending bot bubble(s) with same tempId
          const withoutPending = prev.filter((m) => m.tempId !== botTempId && m.id !== botTempId);
          // dedupe: do not add if botRow.id already exists
          if (withoutPending.find((m) => m.id === botRow.id)) return withoutPending;
          const next = [...withoutPending, { ...botRow, pending: false }];
          next.sort((a, b) => (a.created_at < b.created_at ? -1 : a.created_at > b.created_at ? 1 : 0));
          return next;
        });
        scrollToBottom();
        return;
      }

      // If webhook returned an immediate reply text but no botRow, still replace pending bubble with the reply text (non-pending)
      if (data?.reply) {
        setChatMessages((prev) => {
          return prev.map((m) =>
            m.tempId === botTempId || m.id === botTempId
              ? {
                  id: `local-bot-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`,
                  sender: "bot",
                  message: String(data.reply),
                  user_id: user.id,
                  created_at: data.created_at || new Date().toISOString(),
                  pending: false,
                }
              : m
          );
        });
        scrollToBottom();
        return;
      }

      // If webhook returned nothing useful, replace pending with a fallback bot message
      setChatMessages((prev) => {
        const filtered = prev.filter((m) => m.tempId !== botTempId && m.id !== botTempId);
        filtered.push({
          id: `local-bot-${Date.now()}`,
          sender: "bot",
          message: "Bot replied but no content was returned.",
          user_id: user.id,
          created_at: new Date().toISOString(),
          pending: false,
        });
        return filtered;
      });
      scrollToBottom();
    } catch (err) {
      console.error("chat webhook error", err);
      setChatMessages((prev) => {
        const filtered = prev.filter((m) => m.id !== botTempId);
        filtered.push({
          id: `local-boterr-${Date.now()}`,
          sender: "bot",
          message: "Error connecting to bot.",
          user_id: user.id,
          created_at: new Date().toISOString(),
          pending: false,
        });
        return filtered;
      });
      scrollToBottom();
    }
  };

  // --- Clear chat: deletes all chat_messages rows for current user and clears UI ---
  const clearChat = async () => {
    if (!user) return;
    setClearing(true);
    try {
      const { error } = await supabase.from("chat_messages").delete().eq("user_id", user.id);
      if (error) {
        console.error("Failed to clear chat:", error);
        setClearing(false);
        setClearConfirmOpen(false);
        return;
      }
      // Clear UI
      setChatMessages([]);
      setClearConfirmOpen(false);
      setHasMore(false);
    } catch (err) {
      console.error("Unexpected error clearing chat:", err);
    } finally {
      setClearing(false);
    }
  };

  // --- Todo webhook helper & CRUD (kept) ---
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

    const newTodo = data?.[0];
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
    const { error } = await supabase.from("todos").update({ title: editTitle, description: editDescription }).eq("id", id);
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

  // --- Auth helpers ---
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
    setChatMessages([]); // clear UI on logout
    setChatInput("");
    setChatOpen(false);
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
            <div className="flex items-center gap-2">
              <span className="font-semibold">Chatbot</span>
            </div>

            <div className="flex items-center gap-2">
              {/* Clear chat button */}
              <button
                onClick={() => setClearConfirmOpen(true)}
                title="Clear chat"
                className="text-sm bg-slate-800/40 px-2 py-1 rounded hover:bg-slate-800/60"
                aria-label="Clear chat"
              >
                🧹
              </button>

              {/* Close chat */}
              <button onClick={() => setChatOpen(false)} className="hover:text-gray-300" title="Close chat" aria-label="Close chat">
                ✖
              </button>
            </div>
          </div>

          {/* Load earlier */}
          <div className="p-2 flex items-center justify-center">
            {hasMore ? (
              <button onClick={loadEarlier} disabled={loadingMore} className="text-sm text-indigo-300 hover:underline">
                {loadingMore ? "Loading..." : "Load earlier messages"}
              </button>
            ) : (
              <span className="text-xs text-gray-500">No earlier messages</span>
            )}
          </div>

          {/* Messages */}
          <div ref={chatContainerRef} className="flex-1 p-3 overflow-y-auto space-y-2">
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
                  <div className="flex items-center gap-2">
                    <span>{msg.message}</span>
                    {msg.pending && <span className="text-xs italic opacity-70 ml-2">• sending…</span>}
                  </div>
                  <div className="text-[10px] text-gray-400 mt-1">
                    {new Date(msg.created_at).toLocaleString()}
                  </div>
                </div>
              ))}
          </div>

          <div className="p-3 flex gap-2">
            <input
              value={chatInput}
              onChange={(e) => setChatInput(e.target.value)}
              placeholder="Type a message..."
              className="flex-1 p-2 rounded-lg bg-slate-800 text-gray-100 focus:ring focus:ring-indigo-500"
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  e.preventDefault();
                  handleSendMessage();
                }
              }}
            />
            <button onClick={handleSendMessage} className="bg-indigo-600 text-white px-4 py-2 rounded-lg hover:bg-indigo-700 transition">
              Send
            </button>
          </div>
        </div>
      )}

      {/* Clear chat confirmation modal */}
      {clearConfirmOpen && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-slate-800 p-6 rounded-xl shadow-xl max-w-md w-full mx-4 border border-slate-700">
            <h3 className="text-xl font-semibold text-gray-100 mb-4">Clear chat</h3>
            <p className="text-gray-300 mb-6">Are you sure you want to permanently delete all chat messages? This cannot be undone.</p>
            <div className="flex gap-3 justify-end">
              <button onClick={() => setClearConfirmOpen(false)} className="px-4 py-2 bg-slate-600 text-white rounded-lg hover:bg-slate-700 transition">
                Cancel
              </button>
              <button onClick={clearChat} className="px-4 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700 transition" disabled={clearing}>
                {clearing ? "Clearing..." : "Clear chat"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Delete Confirmation for todos */}
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
