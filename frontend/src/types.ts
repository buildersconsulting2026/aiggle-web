export interface User {
  id: number;
  name: string;
  role: string;
  avatar_color: string;
}

export interface Room {
  id: number;
  name: string;
  type: string;
  discord_channel_id?: string;
}

export interface Message {
  id: number;
  room_id: number;
  user_id: number;
  user_name: string;
  user_role: string;
  user_color: string;
  content: string;
  parent_id: number | null;
  mentions: string[];
  created_at: string | null;
  reply_count: number;
}
