import { NextRequest, NextResponse } from "next/server";
import { supabase } from "@/lib/supabase";

export async function POST(req: NextRequest) {
  try {
    const { message, user_id } = await req.json();
    if (!message || !user_id) return NextResponse.json({ error: "Missing message or user_id" }, { status: 400 });

    // Store user message
    await supabase.from("chat_messages").insert([{ user_id, message, sender: "user" }]);

    // Generate bot response
    const botReply = `You said: ${message}`;

    // Store bot response
    await supabase.from("chat_messages").insert([{ user_id, message: botReply, sender: "bot" }]);

    return NextResponse.json({ reply: botReply });
  } catch (err) {
    console.error(err);
    return NextResponse.json({ error: "Server error" }, { status: 500 });
  }
}
