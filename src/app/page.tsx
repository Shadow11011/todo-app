"use client";

import { useEffect, useState } from "react";
import { createClient } from "@supabase/supabase-js";
import { RealtimePostgresChangesPayload } from "@supabase/supabase-js";
import { v4 as uuidv4 } from "uuid";

// ✅ Define types
interface Todo {
  id: string;
  user_id: string;
  task: string;
  is_complete: boolean;
  created_at: string;
}

interface ChatMessage {
  id: string;
  user_id: string;
  sender: "user" | "bot";
  text: string;
  created_at: string;
}

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
);

export default function Home() {
  const [user, setUser] = useState<any>(null);
  const [todos, setTodos] = useState<Todo[]>([]);
  const [newTask, setNewTask] = useState("");
  const [chatMessages, setChatMessages] = useState<ChatMessage[]>([]);
  const [newMessage, setNewMessage] = useState("");

  // ✅ Auth
  useEffect(() => {
    const session = supabase.auth.getSession().then(({ data }) => {
      if (data?.session) setUser(data.session.user);
    });

    const { data: authListener } = supabase.auth.onAuthStateChange(
      (_event, session) => setUser(session?.user ?? null)
    );

    return () => {
      authListener.subscription.unsubscribe();
    };
  }, []);

  // ✅ Fetch + realtime todos
  useEffect(() => {
    if (!user) return;

    const fetchTodos = async () => {
      const { data } = await supabase
        .from("todos")
        .select("*")
        .eq("user_id", user.id)
        .order("created_at", { ascending: true });
      if (data) setTodos(data);
    };
    fetchTodos();

    const subscription = supabase
      .channel("public:todos")
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "todos", filter: `user_id=eq.${user.id}` },
        (payload: RealtimePostgresChangesPayload<Todo>) => {
          if (payload.eventType === "INSERT") {
            setTodos((prev) => [...prev, payload.new as Todo]);
          } else if (payload.eventType === "UPDATE") {
            setTodos((prev) =>
              prev.map((todo) =>
                todo.id === (payload.new as Todo).id ? (payload.new as Todo) : todo
              )
            );
          } else if (payload.eventType === "DELETE") {
            setTodos((prev) => prev.filter((todo) => todo.id !== payload.old.id));
          }
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(subscription);
    };
  }, [user]);

  // ✅ Fetch + realtime chat
  useEffect(() => {
    if (!user) return;

    const fetchChat = async () => {
      const { data } = await supabase
        .from("chat_messages")
        .select("*")
        .eq("user_id", user.id)
        .order("created_at", { ascending: true });
      if (data) setChatMessages(data);
    };
    fetchChat();

    const subscription = supabase
      .channel("public:chat_messages")
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "chat_messages", filter: `user_id=eq.${user.id}` },
        (payload: RealtimePostgresChangesPayload<ChatMessage>) => {
          const newRow = payload.new as ChatMessage; // ✅ fix here
          if (!newRow || !newRow.sender || !newRow.text || !newRow.user_id) return;

          setChatMessages((prev) => {
            if (prev.find((m) => m.id === newRow.id)) return prev;
            return [...prev, newRow];
          });
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(subscription);
    };
  }, [user]);

  // ✅ Add todo
  const addTodo = async () => {
    if (!newTask.trim() || !user) return;
    await supabase.from("todos").insert([
      {
        id: uuidv4(),
        user_id: user.id,
        task: newTask,
        is_complete: false,
      },
    ]);
    setNewTask("");
  };

  // ✅ Toggle todo
  const toggleTodo = async (id: string, is_complete: boolean) => {
    await supabase.from("todos").update({ is_complete: !is_complete }).eq("id", id);
  };

  // ✅ Delete todo
  const deleteTodo = async (id: string) => {
    await supabase.from("todos").delete().eq("id", id);
  };

  // ✅ Send message (insert only, rely on realtime for UI)
  const handleSendMessage = async () => {
    if (!newMessage.trim() || !user) return;

    const message: ChatMessage = {
      id: uuidv4(),
      user_id: user.id,
      sender: "user",
      text: newMessage,
      created_at: new Date().toISOString(),
    };

    await supabase.from("chat_messages").insert([message]);
    setNewMessage("");

    // Fake bot reply
    setTimeout(async () => {
      const botMessage: ChatMessage = {
        id: uuidv4(),
        user_id: user.id,
        sender: "bot",
        text: `You said: ${message.text}`,
        created_at: new Date().toISOString(),
      };
      await supabase.from("chat_messages").insert([botMessage]);
    }, 1000);
  };

  if (!user) {
    return (
      <div className="flex flex-col items-center justify-center h-screen">
        <h1 className="text-xl font-bold">Login</h1>
        <button
          className="mt-4 p-2 bg-blue-500 text-white rounded"
          onClick={async () => {
            const { data, error } = await supabase.auth.signInWithOAuth({
              provider: "github",
            });
            if (error) console.error(error);
          }}
        >
          Login with GitHub
        </button>
      </div>
    );
  }

  return (
    <div className="grid grid-cols-2 gap-6 p-8">
      {/* ✅ Todo List */}
      <div>
        <h1 className="text-xl font-bold mb-4">Todo List</h1>
        <div className="flex gap-2 mb-4">
          <input
            className="border p-2 flex-1"
            value={newTask}
            onChange={(e) => setNewTask(e.target.value)}
            placeholder="New task"
          />
          <button className="bg-green-500 text-white px-4 rounded" onClick={addTodo}>
            Add
          </button>
        </div>
        <ul>
          {todos.map((todo) => (
            <li key={todo.id} className="flex items-center gap-2 mb-2">
              <input
                type="checkbox"
                checked={todo.is_complete}
                onChange={() => toggleTodo(todo.id, todo.is_complete)}
              />
              <span className={todo.is_complete ? "line-through" : ""}>{todo.task}</span>
              <button
                className="ml-auto text-red-500"
                onClick={() => deleteTodo(todo.id)}
              >
                ✕
              </button>
            </li>
          ))}
        </ul>
      </div>

      {/* ✅ Chat */}
      <div>
        <h1 className="text-xl font-bold mb-4">Chat</h1>
        <div className="border p-4 h-96 overflow-y-auto mb-4">
          {chatMessages.map((msg) => (
            <div
              key={msg.id}
              className={`mb-2 ${msg.sender === "user" ? "text-right" : "text-left"}`}
            >
              <span
                className={`inline-block px-3 py-2 rounded ${
                  msg.sender === "user" ? "bg-blue-500 text-white" : "bg-gray-200"
                }`}
              >
                {msg.text}
              </span>
            </div>
          ))}
        </div>
        <div className="flex gap-2">
          <input
            className="border p-2 flex-1"
            value={newMessage}
            onChange={(e) => setNewMessage(e.target.value)}
            placeholder="Type a message"
          />
          <button
            className="bg-blue-500 text-white px-4 rounded"
            onClick={handleSendMessage}
          >
            Send
          </button>
        </div>
      </div>
    </div>
  );
}
