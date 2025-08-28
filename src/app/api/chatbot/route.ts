import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";

const N8N_CHATBOT_WEBHOOK_URL =
  "https://romantic-pig-hardy.ngrok-free.app/webhook-test/d287ffa8-984d-486c-a2cd-a2a2de952b13";

type ChatbotRequest = {
  message: string;
  user_id: string;
  user_email?: string | null;
};

type ChatMessage = { sender: "user" | "bot"; text: string };

export async function POST(req: NextRequest) {
  try {
    const { message, user_id, user_email } = (await req.json()) as ChatbotRequest;

    if (!user_id || !message) {
      return NextResponse.json({ error: "Missing user_id or message" }, { status: 400 });
    }

    // --- Store user message ---
    const userMsg: ChatMessage = { sender: "user", text: message };
    const { error: userMsgError } = await supabaseAdmin
      .from("chat_messages")
      .insert([{ user_id, sender: userMsg.sender, message: userMsg.text, user_email }]);
    if (userMsgError) console.error("Error storing user message:", userMsgError);

    // --- Call n8n webhook ---
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
        } else if (typeof n8nData.reply === "string") {
          botReply = n8nData.reply;
        }
      } else {
        console.error("n8n webhook error:", await n8nRes.text());
      }
    } catch (err) {
      console.error("n8n fetch error:", err);
      botReply = "Chatbot service is temporarily unavailable.";
    }

    // --- Store bot message ---
    const botMsg: ChatMessage = { sender: "bot", text: botReply };
    const { error: botMsgError } = await supabaseAdmin
      .from("chat_messages")
      .insert([{ user_id, sender: botMsg.sender, message: botMsg.text, user_email }]);
    if (botMsgError) console.error("Error storing bot message:", botMsgError);

    return NextResponse.json({ reply: botReply });
  } catch (error) {
    console.error("Chatbot API error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

