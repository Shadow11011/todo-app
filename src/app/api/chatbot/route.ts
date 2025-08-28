import { supabase } from "@/lib/supabase";
import { NextResponse } from "next/server";

export async function POST(req: Request) {
  try {
    const { message, user_id } = await req.json();

    if (!message || !user_id) {
      return NextResponse.json({ reply: "Missing data" }, { status: 400 });
    }

    // Call n8n webhook and wait for final JSON
    const n8nRes = await fetch(process.env.N8N_WEBHOOK_URL!, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ message, user_id }),
    });

    if (!n8nRes.ok) {
      throw new Error(`n8n returned status ${n8nRes.status}`);
    }

    const n8nData = await n8nRes.json();
    const reply = n8nData?.reply ?? "Sorry, I couldn't process your request.";

    // Save messages to Supabase
    await supabase.from("chat_messages").insert([
      { user_id, sender: "user", message },
      { user_id, sender: "bot", message: reply },
    ]);

    return NextResponse.json({ reply });
  } catch (err) {
    console.error("Chat API error:", err);
    return NextResponse.json(
      { reply: "Error connecting to chatbot." },
      { status: 500 }
    );
  }
}
