// src/app/api/chatbot/route.ts
import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";

// Environment-based n8n webhook
const N8N_CHATBOT_WEBHOOK_URL =
  process.env.NODE_ENV === "development"
    ? "http://localhost:5678/webhook/d287ffa8-984d-486c-a2cd-a2a2de952b13" // local ngrok dev
    : "https://romantic-pig-hardy.ngrok-free.app/webhook-test/d287ffa8-984d-486c-a2cd-a2a2de952b13"; // production permanent URL

export async function POST(req: NextRequest) {
  try {
    const { message, user_id, user_email } = await req.json();

    if (!user_id || !message) {
      return NextResponse.json({ error: "Missing user_id or message" }, { status: 400 });
    }

    // Store user message
    await supabaseAdmin
      .from("chat_messages")
      .insert([{ user_id, sender: "user", message, user_email }]);

    // Default bot reply
    let botReply = "I'm not sure how to respond to that.";

    try {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 8000);

      const n8nRes = await fetch(N8N_CHATBOT_WEBHOOK_URL, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ message, user_id, user_email }),
        signal: controller.signal,
      });

      clearTimeout(timeout);

      if (n8nRes.ok) {
        const n8nData = await n8nRes.json();

        if (Array.isArray(n8nData) && n8nData[0]?.json) {
          botReply = n8nData[0].json.reply || n8nData[0].json.confirmation || botReply;
        } else if (n8nData.reply) {
          botReply = n8nData.reply;
        }
      } else {
        console.error("n8n webhook returned error:", await n8nRes.text());
      }
    } catch (err) {
      console.error("n8n fetch error:", err);
      botReply = "Chatbot service is temporarily unavailable.";
    }

    // Store bot response
    await supabaseAdmin
      .from("chat_messages")
      .insert([{ user_id, sender: "bot", message: botReply, user_email }]);

    return NextResponse.json({ reply: botReply });
  } catch (error) {
    console.error("Chatbot API error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
