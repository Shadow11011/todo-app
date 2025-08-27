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
      .insert([{ title: newTask, completed: false }])
      .select();

    if (error) {
      console.error("Error adding todo:", error.message);
      return;
    }

    setTodos([...todos, ...(data as Todo[])]);
    setNewTask("");

    try {
      await fetch(
        "http://localhost:5678/webhook/7c7bbf74-1eee-4b36-a5d2-a83af8e5a277",
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            id: data[0].id,
            title: data[0].title,
          }),
        }
      );
    } catch (err) {
      console.error("Error sending to N8N:", err);
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

  const startEdit = (id: string, title: string) => {
    setEditingId(id);
    setEditingTitle(title);
  };

  const saveEdit = async () => {
    if (!editingId || !editingTitle) return;
    const { error } = await supabase
      .from("todos")
      .update({ title: editingTitle })
      .eq("id", editingId);
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

  const tasksRemaining = todos.filter((todo) => !todo.completed).length;

  return (
    <main className="min-h-screen bg-gray-900 flex flex-col items-center p-8">
      <h1 className="text-5xl font-extrabold mb-6 text-transparent bg-clip-text bg-gradient-to-r from-purple-400 via-pink-500 to-red-500">
        📝 My To-Do List
      </h1>
      <p className="mb-6 text-gray-400">
        {tasksRemaining} task{tasksRemaining !== 1 ? "s" : ""} remaining
      </p>

      {/* Input for new tasks */}
      <div className="flex gap-3 mb-8 w-full max-w-md">
        <input
          value={newTask}
          onChange={(e) => setNewTask(e.target.value)}
          placeholder="Add a task..."
          className="flex-1 bg-gray-800 text-white border border-gray-700 rounded-lg px-4 py-2 focus:outline-none focus:ring-2 focus:ring-purple-500 focus:border-purple-500 placeholder-gray-400"
        />
        <button className="bg-purple-600 hover:bg-purple-700 text-white px-5 py-2 rounded-lg font-semibold transition shadow-lg hover:shadow-purple-500/50">
          Add
        </button>
      </div>

      {/* List of tasks */}
      <ul className="w-full max-w-md space-y-4">
        {todos.map((todo) => (
          <li
            key={todo.id}
            className="flex items-center justify-between bg-gray-800 p-4 rounded-2xl shadow-md hover:shadow-purple-500/40 transition transform hover:-translate-y-1"
          >
            <div className="flex items-center gap-3 flex-1">
              <input
                type="checkbox"
                checked={todo.completed}
                onChange={() => toggleTodo(todo.id, todo.completed)}
                className="w-6 h-6 accent-purple-400 transition-transform duration-150 ease-in-out hover:scale-110"
              />
              {editingId === todo.id ? (
                <input
                  value={editingTitle}
                  onChange={(e) => setEditingTitle(e.target.value)}
                  className="flex-1 bg-gray-700 text-white border border-gray-600 rounded px-2 py-1 focus:outline-none focus:ring-2 focus:ring-purple-500 placeholder-gray-400"
                />
              ) : (
                <span
                  className={`text-white transition-all duration-300 ease-in-out ${
                    todo.completed ? "line-through text-gray-500 opacity-70" : ""
                  }`}
                >
                  {todo.title}
                </span>
              )}
            </div>

            {/* Buttons */}
            <div className="flex gap-2">
              {editingId === todo.id ? (
                <>
                  <button
                    className="bg-green-500 hover:bg-green-600 text-white px-3 py-1 rounded shadow hover:shadow-green-500/50 transition transform hover:-translate-y-0.5"
                    onClick={saveEdit}
                  >
                    Save
                  </button>
                  <button
                    className="bg-gray-600 hover:bg-gray-700 text-white px-3 py-1 rounded shadow hover:shadow-gray-400/50 transition transform hover:-translate-y-0.5"
                    onClick={cancelEdit}
                  >
                    Cancel
                  </button>
                </>
              ) : (
                <button
                  className="bg-yellow-500 hover:bg-yellow-600 text-white px-3 py-1 rounded shadow hover:shadow-yellow-500/50 transition transform hover:-translate-y-0.5"
                  onClick={() => startEdit(todo.id, todo.title)}
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
