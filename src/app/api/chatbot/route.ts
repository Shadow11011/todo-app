import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";

export async function POST(req: NextRequest) {
  try {
    const { message, user_id, user_email } = await req.json();

    if (!user_id || !message) {
      return NextResponse.json({ error: "Missing user_id or message" }, { status: 400 });
    }

    // Insert user message
    const { error: userMsgError } = await supabaseAdmin
      .from("chat_messages")
      .insert([{ user_id, message, sender: "user", user_email }]);

    if (userMsgError) {
      console.error("Error storing user message:", userMsgError);
    }

    let botReply = "I'm not sure how to respond to that.";

    // TODO: call n8n webhook here to get reply

    // Insert bot reply
    const { error: botMsgError } = await supabaseAdmin
      .from("chat_messages")
      .insert([{ user_id, message: botReply, sender: "bot", user_email }]);

    if (botMsgError) {
      console.error("Error storing bot message:", botMsgError);
    }

    return NextResponse.json({ reply: botReply });
  } catch (error) {
    console.error("Error in chatbot API:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
