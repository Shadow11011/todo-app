// src/app/api/chatbot/route.ts
import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";

// Use .env variables
const CHATBOT_WEBHOOK_URL =
  process.env.CHATBOT_WEBHOOK_URL || "https://fallback-ngrok-link";

export async function POST(req: NextRequest) {
  try {
    const { message, user_id, user_email } = await req.json();

    if (!message || !user_id) {
      return NextResponse.json(
        { error: "Missing user_id or message" },
        { status: 400 }
      );
    }

    // Store user message
    const { error: userMsgError } = await supabaseAdmin
      .from("chat_messages")
      .insert([{ user_id, sender: "user", message, user_email }]);

    if (userMsgError) console.error("Error storing user message:", userMsgError);

    // Call n8n webhook
    let botReply = "I'm not sure how to respond to that.";

    try {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 8000);

      const res = await fetch(CHATBOT_WEBHOOK_URL, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ message, user_id, user_email }),
        signal: controller.signal,
      });

      clearTimeout(timeout);

      if (res.ok) {
        const data = await res.json();
        if (Array.isArray(data) && data[0]?.json) {
          botReply = data[0].json.reply || data[0].json.confirmation || botReply;
        } else if (data.reply) {
          botReply = data.reply;
        }
      } else {
        console.error("Webhook returned error:", await res.text());
      }
    } catch (err) {
      console.error("Webhook fetch error:", err);
      botReply = "Chatbot service is temporarily unavailable.";
    }

    // Store bot response
    const { error: botMsgError } = await supabaseAdmin
      .from("chat_messages")
      .insert([{ user_id, sender: "bot", message: botReply, user_email }]);

    if (botMsgError) console.error("Error storing bot message:", botMsgError);

    return NextResponse.json({ reply: botReply });
  } catch (err) {
    console.error("Chatbot API error:", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
