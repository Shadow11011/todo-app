// src/app/api/chatbot/route.ts
import { NextRequest, NextResponse } from "next/server";
import { supabase } from "@/lib/supabase";

export async function POST(req: NextRequest) {
  const { message, user_id } = await req.json();

  if (!user_id || !message) {
    return NextResponse.json({ error: "Missing user_id or message" }, { status: 400 });
  }

  // Store user message
  await supabase.from("chat_messages").insert([
    { user_id, message, sender: "user" }
  ]);

  // Generate bot response (example: echo message)
  const botReply = `You said: ${message}`;

  // Store bot message
  await supabase.from("chat_messages").insert([
    { user_id, message: botReply, sender: "bot" }
  ]);

  return NextResponse.json({ reply: botReply });
}
