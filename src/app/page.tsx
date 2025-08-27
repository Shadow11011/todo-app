"use client";

import { useEffect, useState } from "react";
import { supabase } from "../lib/supabase";

type Todo = {
  id: string;
  title: string;
  completed: boolean;
  user_email?: string;
  created_at?: string;
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
    if (!newTask.trim()) return;
    const { data, error } = await supabase
      .from("todos")
      .insert([{ title: newTask, completed: false }])
      .select();
    if (error) console.error("Error adding todo:", error.message);
    else {
      setTodos([...todos, ...(data as Todo[])]);
      setNewTask("");
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

  const startEditing = (todo: Todo) => {
    setEditingId(todo.id);
    setEditingTitle(todo.title);
  };

  const saveEdit = async () => {
    if (!editingTitle.trim() || !editingId) return;
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

  const deleteTodo = async (id: string) => {
    const { error } = await supabase.from("todos").delete().eq("id", id);
    if (error) console.error("Error deleting todo:", error.message);
    else fetchTodos();
  };

  return (
    <main className="p-6 max-w-xl mx-auto bg-gray-50 min-h-screen">
      <h1 className="text-3xl font-bold mb-6 text-center text-blue-600">
        My To-Do List
      </h1>

      {/* Add new task */}
      <div className="flex flex-col sm:flex-row gap-3 mb-6">
        <input
          value={newTask}
          onChange={(e) => setNewTask(e.target.value)}
          placeholder="Add a new task..."
          className="flex-1 border border-gray-300 px-3 py-2 rounded-lg shadow-sm focus:outline-none focus:ring-2 focus:ring-blue-400"
        />
        <button
          onClick={addTodo}
          className="bg-blue-500 hover:bg-blue-600 text-white px-6 py-2 rounded-lg shadow-md transition-colors"
        >
          Add
        </button>
      </div>

      {/* List of todos */}
      <ul className="space-y-3">
        {todos.map((todo) => (
          <li
            key={todo.id}
            className="flex flex-col sm:flex-row items-start sm:items-center gap-3 bg-white p-3 rounded-lg shadow-sm hover:shadow-md transition-shadow"
          >
            <input
              type="checkbox"
              checked={todo.completed}
              onChange={() => toggleTodo(todo.id, todo.completed)}
              className="w-5 h-5 text-blue-500 accent-blue-500 mt-1 sm:mt-0"
            />

            {editingId === todo.id ? (
              <>
                <input
                  value={editingTitle}
                  onChange={(e) => setEditingTitle(e.target.value)}
                  className="flex-1 border border-gray-300 px-2 py-1 rounded focus:outline-none focus:ring-2 focus:ring-blue-400"
                />
                <div className="flex gap-2 mt-2 sm:mt-0">
                  <button
                    onClick={saveEdit}
                    className="bg-green-500 hover:bg-green-600 text-white px-3 py-1 rounded transition-colors"
                  >
                    Save
                  </button>
                  <button
                    onClick={cancelEdit}
                    className="bg-gray-300 hover:bg-gray-400 px-3 py-1 rounded transition-colors"
                  >
                    Cancel
                  </button>
                </div>
              </>
            ) : (
              <>
                <span
                  className={`flex-1 ${todo.completed ? "line-through text-gray-400" : "text-gray-800"}`}
                >
                  {todo.title}
                </span>
                <div className="flex gap-2 mt-2 sm:mt-0">
                  <button
                    onClick={() => startEditing(todo)}
                    className="bg-yellow-400 hover:bg-yellow-500 px-3 py-1 rounded transition-colors"
                  >
                    Edit
                  </button>
                  <button
                    onClick={() => deleteTodo(todo.id)}
                    className="bg-red-500 hover:bg-red-600 text-white px-3 py-1 rounded transition-colors"
                  >
                    Delete
                  </button>
                </div>
              </>
            )}
          </li>
        ))}
      </ul>
    </main>
  );
}
