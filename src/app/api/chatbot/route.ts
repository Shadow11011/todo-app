// pages/api/chatbot.ts
import type { NextApiRequest, NextApiResponse } from 'next';
import { supabase } from '../../lib/supabase';

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'POST') return res.status(405).end();

  const { message, user_id } = req.body;

  if (!user_id || !message) return res.status(400).json({ error: 'Missing user_id or message' });

  // Store user message
  await supabase.from('chat_messages').insert([
    { user_id, message, sender: 'user' }
  ]);

  // Generate bot response (example: echo message)
  const botReply = `You said: ${message}`;

  // Store bot message
  await supabase.from('chat_messages').insert([
    { user_id, message: botReply, sender: 'bot' }
  ]);

  res.status(200).json({ reply: botReply });
}
