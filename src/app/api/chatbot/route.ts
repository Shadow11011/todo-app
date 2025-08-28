import { supabase } from "@/lib/supabase";
import { NextResponse } from "next/server";

export async function POST(req: Request) {
  try {
    const { message, user_id } = await req.json();

    // 🔹 Call n8n webhook and wait for final JSON
    const n8nRes = await fetch(process.env.N8N_WEBHOOK_URL!, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ message, user_id }),
    });

    if (!n8nRes.ok) {
      throw new Error(`n8n returned ${n8nRes.status}`);
    }

    const n8nData = await n8nRes.json();

    // 🔹 Your JSON node returns { reply: "..." }
    const reply = n8nData.reply ?? "No reply from workflow";

    // 🔹 Save both user + assistant messages into Supabase
    await supabase.from("chat_messages").insert([
      { user_id, role: "user", content: message },
      { user_id, role: "assistant", content: reply },
    ]);

    // 🔹 Send reply back to the frontend chat UI
    return NextResponse.json({ reply });
  } catch (err) {
    console.error("Chat API error:", err);
    return NextResponse.json(
      { reply: "Something went wrong." },
      { status: 500 }
    );
  }
}
