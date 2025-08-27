"use client";

import { useEffect, useState } from "react";
import { supabase } from "../lib/supabase";

type Todo = {
  id: string;
  title: string;
  completed: boolean;
  created_at: string;
};

export default function Home() {
  const [todos, setTodos] = useState<Todo[]>([]);
  const [newTask, setNewTask] = useState("");
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editingTitle, setEditingTitle] = useState("");

  useEffect(() => {
    fetchTodos();
  }, []);

  const fetchTodos = async () => {
    const { data, error } = await supabase.from("todos").select("*").order("created_at", { ascending: true });
    if (error) console.error("Error fetching todos:", error.message);
    else setTodos(data as Todo[]);
  };

const addTodo = async () => {
  if (!newTask) return;

  // 1. Insert task into Supabase
  const { data, error } = await supabase
    .from("todos")
    .insert([{ title: newTask, completed: false }])
    .select();

  if (error) {
    console.error("Error adding todo:", error.message);
    return;
  }

  // 2. Update local state
  setTodos([...todos, ...(data as Todo[])]);
  setNewTask("");

  // 3. Send task to N8N for AI enhancement
  try {
    await fetch("http://localhost:5678/webhook-test/7c7bbf74-1eee-4b36-a5d2-a83af8e5a277", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        id: data[0].id,      // the Supabase task ID
        title: data[0].title // original task title
      }),
    });
  } catch (err) {
    console.error("Error sending to N8N:", err);
  }
};


  const toggleTodo = async (id: string, current: boolean) => {
    const { error } = await supabase.from("todos").update({ completed: !current }).eq("id", id);
    if (error) console.error("Error updating todo:", error.message);
    else fetchTodos();
  };

  const startEdit = (id: string, title: string) => {
    setEditingId(id);
    setEditingTitle(title);
  };

  const saveEdit = async () => {
    if (!editingId || !editingTitle) return;
    const { error } = await supabase.from("todos").update({ title: editingTitle }).eq("id", editingId);
    if (error) console.error("Error editing todo:", error.message);
    else {
      setEditingId(null);
      setEditingTitle("");
      fetchTodos();
    }
  };

  const cancelEdit = () => {
    setEditingId(null);
    setEditingTitle("");
  };

  const tasksRemaining = todos.filter(todo => !todo.completed).length;

  return (
    <main className="min-h-screen bg-gray-100 flex flex-col items-center p-8">
      <h1 className="text-4xl font-extrabold mb-6 text-gray-800">📝 My To-Do List</h1>
      <p className="mb-4 text-gray-600">{tasksRemaining} task{tasksRemaining !== 1 ? "s" : ""} remaining</p>

      {/* Input for new tasks */}
      <div className="flex gap-3 mb-6 w-full max-w-md">
        <input
          value={newTask}
          onChange={(e) => setNewTask(e.target.value)}
          placeholder="Add a task..."
          className="flex-1 border border-gray-300 rounded-lg px-4 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
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
            className="flex items-center justify-between bg-white p-4 rounded-xl shadow hover:shadow-md transition"
          >
            <div className="flex items-center gap-3 flex-1">
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
                  className="flex-1 border border-gray-300 rounded px-2 py-1 focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              ) : (
                <span className={`text-gray-800 ${todo.completed ? "line-through text-gray-400" : ""}`}>
                  {todo.title}
                </span>
              )}
            </div>

            {/* Buttons */}
            <div className="flex gap-2">
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
                    className="bg-gray-300 hover:bg-gray-400 text-gray-800 px-3 py-1 rounded transition"
                  >
                    Cancel
                  </button>
                </>
              ) : (
                <button
                  onClick={() => startEdit(todo.id, todo.title)}
                  className="bg-yellow-400 hover:bg-yellow-500 text-white px-3 py-1 rounded transition"
                >
                  Edit
                </button>
              )}
            </div>
          </li>
        ))}
      </ul>
    </main>
  );
}
