export type RoomRecord = {
  code: string;
  name: string;
  host_name: string;
  players: number;
  visibility: "public" | "private";
  updated_at: string;
};

const url = process.env.NEXT_PUBLIC_SUPABASE_URL || "";
const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || "";
export const isSupabaseConfigured = Boolean(url && key);

const headers = { apikey: key, Authorization: `Bearer ${key}`, "Content-Type": "application/json" };

async function rpc<T>(name: string, body: Record<string, unknown>): Promise<T> {
  const response = await fetch(`${url}/rest/v1/rpc/${name}`, { method: "POST", headers, body: JSON.stringify(body) });
  if (!response.ok) throw new Error(`Supabase ${name}: ${response.status}`);
  const text = await response.text();
  return (text ? JSON.parse(text) : null) as T;
}

export async function listRooms() {
  const response = await fetch(`${url}/rest/v1/room_directory?select=*&order=updated_at.desc`, { headers, cache: "no-store" });
  if (!response.ok) throw new Error(`Supabase rooms: ${response.status}`);
  return response.json() as Promise<RoomRecord[]>;
}

export const createRoomRecord = (room: {
  code: string; name: string; hostName: string; visibility: "public" | "private";
  password: string; hostToken: string;
}) => rpc("create_game_room", {
  p_code: room.code, p_name: room.name, p_host_name: room.hostName,
  p_visibility: room.visibility, p_password: room.password, p_host_token: room.hostToken
});

export const heartbeatRoom = (code: string, hostToken: string, players: number) =>
  rpc("heartbeat_game_room", { p_code: code, p_host_token: hostToken, p_players: players });

export const deleteRoomRecord = (code: string, hostToken: string) =>
  rpc("delete_game_room", { p_code: code, p_host_token: hostToken });

export const verifyRoomPassword = (code: string, password: string) =>
  rpc<boolean>("verify_game_room_password", { p_code: code, p_password: password });
