// src/app/api/chatbot/route.ts
import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";

// Use HTTPS ngrok URLs only
const CHATBOT_WEBHOOK_TEST =
  "process.env.CHATBOT_WEBHOOK_TEST";
const CHATBOT_WEBHOOK_PROD =
  "https://your-prod-ngrok-link/webhook/d287ffa8-984d-486c-a2cd-a2a2de952b13";

const CHATBOT_WEBHOOK_URL =
  process.env.NODE_ENV === "development"
    ? CHATBOT_WEBHOOK_TEST
    : CHATBOT_WEBHOOK_PROD;

export async function POST(req: NextRequest) {
  try {
    const { message, user_id, user_email } = await req.json();

    if (!message || !user_id) {
      return NextResponse.json(
        { error: "Missing user_id or message" },
        { status: 400 }
      );
    }

    // 1️⃣ Store user message in Supabase
    const { error: userMsgError } = await supabaseAdmin
      .from("chat_messages")
      .insert([{ user_id, sender: "user", message, user_email }]);

    if (userMsgError) console.error("Error storing user message:", userMsgError);

    // 2️⃣ Call n8n webhook
    let botReply = "I'm not sure how to respond to that.";

    try {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 8000); // 8s timeout

      const res = await fetch(CHATBOT_WEBHOOK_URL, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ message, user_id, user_email }),
        signal: controller.signal,
      });

      clearTimeout(timeout);

      if (res.ok) {
        const data = await res.json();

        // Handle different possible responses from n8n
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

    // 3️⃣ Store bot response in Supabase
    const { error: botMsgError } = await supabaseAdmin
      .from("chat_messages")
      .insert([{ user_id, sender: "bot", message: botReply, user_email }]);

    if (botMsgError) console.error("Error storing bot message:", botMsgError);

    // 4️⃣ Return bot reply
    return NextResponse.json({ reply: botReply });
  } catch (err) {
    console.error("Chatbot API error:", err);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
