// src/app/api/chatbot/route.ts
import { NextRequest, NextResponse } from "next/server";
import { supabase } from "@/lib/supabase";

// n8n webhook URL for chatbot processing
const N8N_CHATBOT_WEBHOOK_URL = "http://localhost:5678/webhook-test/d287ffa8-984d-486c-a2cd-a2a2de952b13";

export async function POST(req: NextRequest) {
  try {
    const { message, user_id, user_email } = await req.json();

    if (!user_id || !message) {
      return NextResponse.json({ error: "Missing user_id or message" }, { status: 400 });
    }

    // Store user message in Supabase
    const { error: userMsgError } = await supabase
      .from("chat_messages")
      .insert([{ user_id, message, sender: "user", user_email }]);

    if (userMsgError) {
      console.error("Error storing user message:", userMsgError);
      return NextResponse.json({ error: "Failed to store message" }, { status: 500 });
    }

    let botReply = "I'm sorry, I couldn't process your request at the moment.";

    try {
      // Call n8n webhook to get bot response
      const n8nResponse = await fetch(N8N_CHATBOT_WEBHOOK_URL, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ message, user_id, user_email }),
      });

      if (n8nResponse.ok) {
        const n8nData = await n8nResponse.json();
        botReply = n8nData.reply || n8nData.response || "I'm not sure how to respond to that.";
      } else {
        console.error("n8n webhook error:", await n8nResponse.text());
        botReply = "I'm experiencing technical difficulties. Please try again later.";
      }
    } catch (n8nError) {
      console.error("Error calling n8n webhook:", n8nError);
      botReply = "I'm having trouble connecting to my processing service.";
    }

    // Store bot response in Supabase
    const { error: botMsgError } = await supabase
      .from("chat_messages")
      .insert([{ user_id, message: botReply, sender: "bot", user_email }]);

    if (botMsgError) {
      console.error("Error storing bot message:", botMsgError);
    }

    return NextResponse.json({ reply: botReply });
  } catch (error) {
    console.error("Error in chatbot API:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
