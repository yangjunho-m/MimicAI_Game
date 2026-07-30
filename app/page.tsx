"use client";

import { PointerEvent, useCallback, useEffect, useRef, useState } from "react";
import { joinRoom, selfId } from "trystero";
import { createRoomRecord, deleteRoomRecord, heartbeatRoom, isSupabaseConfigured, listRooms, verifyRoomPassword } from "../lib/supabaseRooms";

type Screen = "profile" | "home" | "rooms" | "lobby" | "draw" | "ai" | "vote" | "result";
type Drawing = { id: string; author: string; image: string; isAI: boolean };
type Profile = { name: string; color: string; face: string; shape: string };
type OnlineProfile = Profile & { id: string; host?: boolean };
type PublicRoom = { code: string; name: string; hostName: string; players: number; visibility: "public" | "private"; passwordHash?: string; updatedAt: number };
type RoomMeta = { name: string; visibility: "public" | "private"; aiCount: number };
type ChatMessage = { id: string; senderId: string; senderName: string; text: string; sentAt: number };
type ControlMessage =
  | { type: "start"; word: string; eliminatedIds: string[]; drawEndsAt: number }
  | { type: "gallery"; drawings: Drawing[]; voteEndsAt: number }
  | { type: "result"; eliminatedId: string | null; eliminatedAiIndex?: number | null; winner?: "human" | "ai" | null };
type PlayerStatus = "drawing" | "done" | "eliminated";
const WORDS = [
  "우주에서 라면을 먹는 고양이", "잠수함을 운전하는 고양이", "구름 위에서 낮잠 자는 고양이",
  "마법 빗자루를 타는 고양이", "도시를 구하는 거대한 고양이", "눈사람을 만드는 고양이",
  "비 오는 날의 놀이공원", "유령만 남은 놀이공원", "바닷속에 가라앉은 놀이공원",
  "구름 위를 떠다니는 놀이공원", "한밤중 불이 켜진 놀이공원",
  "춤추는 선인장", "기타를 연주하는 선인장", "우주복을 입은 선인장",
  "스케이트보드를 타는 선인장", "비를 맞고 자라는 선인장",
  "달에 간 붕어빵", "바다를 헤엄치는 붕어빵", "로켓을 타는 붕어빵",
  "눈밭에서 길을 잃은 붕어빵", "하늘을 날아다니는 붕어빵"
];
const COLORS = ["#171717", "#ff5d3b", "#6e56cf", "#168c73", "#f4b400"];
const AVATAR_COLORS = ["#ff5d3b", "#6e56cf", "#168c73", "#f4b400", "#ef8eb8", "#58a6d8"];
const FACES = ["•ᴗ•", "¬‿¬", "•̀ᴗ•́", "◕‿◕", "×‿×", "•_•"];
const SHAPES = ["round", "square", "blob"];
const AI_NAMES = ["짹짹이", "몽실이", "토토", "삐약이", "콩콩이", "두부", "후추", "보리", "단추"];
const randomCode = () => Math.random().toString(36).slice(2, 6).toUpperCase();
const randomWord = (previous = "") => {
  const candidates = WORDS.filter(item => item !== previous);
  return candidates[Math.floor(Math.random() * candidates.length)];
};
const getAiIdentity = (index: number, roundWord: string) => {
  const seed = [...roundWord].reduce((sum, char) => sum + char.charCodeAt(0), 0) + index * 17;
  return {
    name: AI_NAMES[(seed + index * 3) % AI_NAMES.length],
    color: AVATAR_COLORS[(seed + index) % AVATAR_COLORS.length],
    face: FACES[(seed + index * 2) % FACES.length],
    shape: SHAPES[(seed + index) % SHAPES.length]
  };
};
const hashPassword = (value: string) => [...value].reduce((hash, char) => ((hash * 31) + char.charCodeAt(0)) >>> 0, 2166136261).toString(36);
const DIRECTORY_CONFIG = {
  appId: "mimic-ai-game-2026-directory-v2",
  relayConfig: {
    urls: ["wss://relay.damus.io", "wss://relay.primal.net", "wss://nos.lol"],
    redundancy: 3
  }
};

function pseudoAiSketch(word: string, aiVariant = Math.floor(Math.random() * 3)) {
  const canvas = document.createElement("canvas");
  canvas.width = 900; canvas.height = 620;
  const c = canvas.getContext("2d")!;
  c.fillStyle = "#fff"; c.fillRect(0, 0, canvas.width, canvas.height);
  c.lineCap = "round"; c.lineJoin = "round";
  const seed = [...word].reduce((a, v) => a + v.charCodeAt(0), 0) + Math.floor(Math.random() * 10000) + aiVariant * 7919;
  const styleRoughness = [1.65, .7, 1.15][aiVariant % 3];
  const styleWidth = [1.15, .78, .95][aiVariant % 3];
  const wobble = (n: number, amount = 10) => Math.sin(seed * .17 + n * 1.9) * amount;
  const line = (color = "#171717", width = 9) => { c.strokeStyle = color; c.lineWidth = (width + wobble(width, 1.5)) * styleWidth; };
  const dot = (x: number, y: number, r = 8) => { c.fillStyle = "#171717"; c.beginPath(); c.arc(x, y, r, 0, Math.PI * 2); c.fill(); };
  const roughArc = (cx: number, cy: number, rx: number, ry: number, start = 0, end = Math.PI * 2, rotation = 0, roughness = 7) => {
    const steps = Math.max(24, Math.round(54 * Math.abs(end - start) / (Math.PI * 2)));
    c.beginPath();
    for (let i = 0; i <= steps; i++) {
      const angle = start + (end - start) * (i / steps);
      const shake = (Math.sin(angle * 5 + seed * .11) * roughness + Math.sin(angle * 11 + seed * .07) * roughness * .35) * styleRoughness;
      const localX = Math.cos(angle) * (rx + shake);
      const localY = Math.sin(angle) * (ry + shake * .65);
      const x = cx + localX * Math.cos(rotation) - localY * Math.sin(rotation);
      const y = cy + localX * Math.sin(rotation) + localY * Math.cos(rotation);
      if (i === 0) c.moveTo(x, y); else c.lineTo(x, y);
    }
    if (Math.abs(end - start) >= Math.PI * 1.99) c.closePath();
    c.stroke();
  };
  const roughLine = (x1: number, y1: number, x2: number, y2: number, roughness = 6) => {
    const steps = 12;
    c.beginPath(); c.moveTo(x1, y1);
    for (let i = 1; i <= steps; i++) {
      const t = i / steps;
      const fade = Math.sin(Math.PI * t);
      const x = x1 + (x2 - x1) * t + Math.sin(seed * .13 + i * 2.4) * roughness * fade * styleRoughness;
      const y = y1 + (y2 - y1) * t + Math.cos(seed * .09 + i * 1.7) * roughness * fade * styleRoughness;
      c.lineTo(x, y);
    }
    c.stroke();
  };
  const accent = COLORS[(seed % 4) + 1];
  const compositionScales = [.88, 1.22, .66];
  const compositionX = [-95, 105, 15];
  const compositionY = [35, -42, 65];
  const compositionScale = compositionScales[aiVariant % 3] + ((seed % 9) / 100);
  const flip = aiVariant === 1 ? -1 : 1;
  c.translate(450 + compositionX[aiVariant % 3] + wobble(20, 24), 310 + compositionY[aiVariant % 3] + wobble(21, 18));
  c.rotate([-.09, .13, -.035][aiVariant % 3] + wobble(22, .035));
  c.scale(compositionScale * flip, compositionScale);
  c.translate(-450, -310);
  line();

  if (word.includes("놀이공원")) {
    roughArc(455, 285, 175 + wobble(1), 171 + wobble(3), 0, Math.PI * 2, wobble(4, .035), 9);
    for (let i = 0; i < 8; i++) { const a = i * Math.PI / 4; roughLine(455, 285, 455 + Math.cos(a) * 175, 285 + Math.sin(a) * 175, 5); }
    line(accent, 12); roughLine(335, 520, 455, 285, 7); roughLine(455, 285, 575, 520, 7);
    line(); for (let i = 0; i < 6; i++) roughLine(155 + i * 125, 80 + wobble(i, 18), 145 + i * 125, 125 + wobble(i + 2, 14), 4);
  } else if (word.includes("선인장")) {
    line(accent, 16); c.beginPath(); c.moveTo(445, 500); c.bezierCurveTo(415, 390, 430, 230, 455, 125); c.stroke();
    c.beginPath(); c.moveTo(430, 330); c.bezierCurveTo(345, 350, 330, 285, 340, 235); c.moveTo(465, 275); c.bezierCurveTo(555, 295, 575, 230, 565, 180); c.stroke();
    line(); roughArc(455, 520, 150, 38, 0, Math.PI * 2, wobble(5, .04), 5);
    for (let i = 0; i < 14; i++) { const x = 350 + (i * 47) % 220, y = 150 + (i * 71) % 300; roughLine(x, y, x + wobble(i, 12), y - 13, 3); }
  } else if (word.includes("붕어빵")) {
    line(accent, 13); roughArc(430, 340, 190 + wobble(2), 95 + wobble(6, 5), 0, Math.PI * 2, -.08 + wobble(7, .025), 8);
    roughLine(590, 325, 715, 245, 8); roughLine(715, 245, 690, 385, 8); roughLine(690, 385, 590, 325, 8);
    line(); roughArc(680, 145, 75, 72, .3, Math.PI * 1.7, wobble(8, .03), 6);
    c.beginPath(); c.moveTo(300, 295); c.quadraticCurveTo(430, 340, 300, 395); c.stroke();
    roughLine(370, 255, 420, 425, 5); roughLine(455, 248, 490, 425, 5);
    for (let i = 0; i < 10; i++) dot(120 + ((i * 83) % 650), 80 + ((i * 47) % 130), 3 + (i % 3));
  } else {
    roughArc(440, 255, 120 + wobble(1), 116 + wobble(9, 5), 0, Math.PI * 2, wobble(10, .04), 7);
    roughLine(350, 185, 390 + wobble(1), 95, 7); roughLine(390 + wobble(1), 95, 430, 165, 7); roughLine(475, 165, 520 + wobble(2), 95, 7); roughLine(520 + wobble(2), 95, 545, 190, 7);
    line(accent, 13); roughArc(445, 440, 185 + wobble(11, 8), 75 + wobble(12, 5), 0, Math.PI * 2, wobble(13, .025), 7);
    for (let i = 0; i < 5; i++) { c.beginPath(); c.moveTo(300 + i * 70, 410 + wobble(i)); c.quadraticCurveTo(345 + i * 45, 455, 330 + i * 75, 475 + wobble(i + 4)); c.stroke(); }
  }
  line(aiVariant === 1 ? "#171717" : accent, aiVariant === 0 ? 7 : 5);
  if (aiVariant === 0) {
    for (let i = 0; i < 5; i++) roughLine(105 + i * 145, 535 + wobble(i, 10), 185 + i * 135, 555 + wobble(i + 3, 16), 9);
  } else if (aiVariant === 1) {
    roughLine(105, 105, 790, 78, 3);
    roughLine(790, 78, 820, 535, 3);
    roughLine(820, 535, 135, 558, 3);
  } else {
    for (let i = 0; i < 13; i++) {
      const x = 90 + ((i * 127 + seed) % 720);
      const y = 65 + ((i * 83 + seed) % 480);
      roughArc(x, y, 8 + (i % 4) * 3, 7 + ((i + 2) % 3) * 3, 0, Math.PI * 2, 0, 4);
    }
  }
  return canvas.toDataURL("image/png");
}

function DrawingBoard({ onSubmit, player, submitted = false, deadline = 0 }: { onSubmit: (image: string) => void; player: string; submitted?: boolean; deadline?: number }) {
  const ref = useRef<HTMLCanvasElement>(null);
  const drawing = useRef(false);
  const autoSubmitted = useRef(false);
  const onSubmitRef = useRef(onSubmit);
  const [color, setColor] = useState(COLORS[0]);
  const [width, setWidth] = useState(8);
  const history = useRef<ImageData[]>([]);
  useEffect(() => { onSubmitRef.current = onSubmit; }, [onSubmit]);
  useEffect(() => { const canvas = ref.current!; const c = canvas.getContext("2d")!; c.fillStyle = "#fff"; c.fillRect(0, 0, canvas.width, canvas.height); }, []);
  useEffect(() => {
    autoSubmitted.current = false;
    if (!deadline || submitted) return;
    const submitAtDeadline = () => {
      if (autoSubmitted.current || !ref.current) return;
      autoSubmitted.current = true;
      onSubmitRef.current(ref.current.toDataURL("image/png"));
    };
    const remaining = deadline - Date.now();
    if (remaining <= 0) {
      submitAtDeadline();
      return;
    }
    const timer = window.setTimeout(submitAtDeadline, remaining);
    return () => window.clearTimeout(timer);
  }, [deadline, submitted]);
  const point = (event: PointerEvent<HTMLCanvasElement>) => {
    const canvas = ref.current!, box = canvas.getBoundingClientRect();
    return { x: ((event.clientX - box.left) / box.width) * canvas.width, y: ((event.clientY - box.top) / box.height) * canvas.height };
  };
  const start = (event: PointerEvent<HTMLCanvasElement>) => {
    const canvas = ref.current!, c = canvas.getContext("2d")!;
    history.current.push(c.getImageData(0, 0, canvas.width, canvas.height));
    drawing.current = true; canvas.setPointerCapture(event.pointerId);
    const p = point(event); c.beginPath(); c.moveTo(p.x, p.y);
  };
  const move = (event: PointerEvent<HTMLCanvasElement>) => {
    if (!drawing.current) return;
    const c = ref.current!.getContext("2d")!, p = point(event);
    c.strokeStyle = color; c.lineWidth = width; c.lineCap = "round"; c.lineJoin = "round"; c.lineTo(p.x, p.y); c.stroke();
  };
  const undo = () => { const image = history.current.pop(); if (image) ref.current!.getContext("2d")!.putImageData(image, 0, 0); };
  return <div className="board-wrap">
    <div className="canvas-shell">
      <canvas ref={ref} width={900} height={620} aria-label={`${player}의 그림판`} onPointerDown={start} onPointerMove={move} onPointerUp={() => drawing.current = false} onPointerCancel={() => drawing.current = false} />
      <span className="canvas-stamp">MIMIC #{player.replace("플레이어 ", "P")}</span>
    </div>
    <div className="toolbar">
      <div className="tool-group"><span className="tool-label">INK</span>{COLORS.map(item => <button key={item} className={`swatch ${color === item ? "active" : ""}`} style={{ background: item }} aria-label={`펜 색상 ${item}`} onClick={() => setColor(item)} />)}</div>
      <div className="tool-group grow"><span className="tool-label">STROKE {width}px</span><input aria-label="펜 두께" type="range" min="2" max="28" value={width} onChange={e => setWidth(Number(e.target.value))} /></div>
      <button className="icon-button" onClick={undo}>↶ 되돌리기</button>
      <button className="primary compact" disabled={submitted} onClick={() => onSubmit(ref.current!.toDataURL("image/png"))}>{submitted ? "제출 완료 ✓" : "그림 제출 →"}</button>
    </div>
  </div>;
}

export default function Home() {
  const [screen, setScreen] = useState<Screen>("profile");
  const [profile, setProfile] = useState<Profile>({ name: "", color: AVATAR_COLORS[0], face: FACES[0], shape: SHAPES[0] });
  const [roomCode, setRoomCode] = useState(randomCode);
  const [joinCode, setJoinCode] = useState("");
  const [isOnline, setIsOnline] = useState(false);
  const [isHost, setIsHost] = useState(false);
  const [onlineProfiles, setOnlineProfiles] = useState<Record<string, OnlineProfile>>({});
  const [publicRooms, setPublicRooms] = useState<Record<string, PublicRoom>>({});
  const [roomName, setRoomName] = useState("");
  const [currentRoomName, setCurrentRoomName] = useState("");
  const [aiCount, setAiCount] = useState(1);
  const [chatMessages, setChatMessages] = useState<ChatMessage[]>([]);
  const [chatInput, setChatInput] = useState("");
  const [roomVisibility, setRoomVisibility] = useState<"public" | "private">("public");
  const [roomPassword, setRoomPassword] = useState("");
  const [passwordAttempts, setPasswordAttempts] = useState<Record<string, string>>({});
  const [passwordErrors, setPasswordErrors] = useState<Record<string, boolean>>({});
  const [roomRefreshKey, setRoomRefreshKey] = useState(0);
  const [isRefreshingRooms, setIsRefreshingRooms] = useState(false);
  const [connectionText, setConnectionText] = useState("연결 중...");
  const [playerStatuses, setPlayerStatuses] = useState<Record<string, PlayerStatus>>({});
  const [aiPlayerStatus, setAiPlayerStatus] = useState<PlayerStatus>("drawing");
  const [hasSubmitted, setHasSubmitted] = useState(false);
  const [hasVoted, setHasVoted] = useState(false);
  const [voteSeconds, setVoteSeconds] = useState(10);
  const [voteDeadline, setVoteDeadline] = useState(0);
  const [drawSeconds, setDrawSeconds] = useState(60);
  const [drawDeadline, setDrawDeadline] = useState(0);
  const [eliminatedIds, setEliminatedIds] = useState<string[]>([]);
  const [roundEliminatedId, setRoundEliminatedId] = useState<string | null>(null);
  const [roundEliminatedAiIndex, setRoundEliminatedAiIndex] = useState<number | null>(null);
  const [eliminatedAiIndexes, setEliminatedAiIndexes] = useState<number[]>([]);
  const [gameWinner, setGameWinner] = useState<"human" | "ai" | null>(null);
  const [players, setPlayers] = useState(2);
  const [turn, setTurn] = useState(0);
  const [drawings, setDrawings] = useState<Drawing[]>([]);
  const [word, setWord] = useState(WORDS[0]);
  const [aiStatus, setAiStatus] = useState("");
  const [selected, setSelected] = useState("");
  const [copied, setCopied] = useState(false);
  const p2pRoomRef = useRef<ReturnType<typeof joinRoom> | null>(null);
  const directoryRoomRef = useRef<ReturnType<typeof joinRoom> | null>(null);
  const isHostRef = useRef(false);
  const hostedRoomRef = useRef<{ name: string; visibility: "public" | "private"; passwordHash?: string }>({ name: "", visibility: "public" });
  const hostTokenRef = useRef("");
  const profileRef = useRef(profile);
  const wordRef = useRef(word);
  const profilesRef = useRef<Record<string, OnlineProfile>>({});
  const eliminatedRef = useRef<string[]>([]);
  const eliminatedAiRef = useRef<number[]>([]);
  const submittedRef = useRef<Record<string, Drawing>>({});
  const votesRef = useRef<Record<string, string>>({});
  const aiReadyRef = useRef(false);
  const aiTimerRef = useRef<number | null>(null);
  const aiTimersRef = useRef<number[]>([]);
  const aiReadyCountRef = useRef(0);
  const aiCountRef = useRef(1);
  const voteGateOpenRef = useRef(false);
  const voteTimerRef = useRef<number | null>(null);
  const finishOnlineVoteRef = useRef<() => void>(() => {});
  const sendProfileRef = useRef<((data: OnlineProfile, options?: { target?: string }) => Promise<void>) | null>(null);
  const sendRoomMetaRef = useRef<((data: RoomMeta, options?: { target?: string }) => Promise<void>) | null>(null);
  const sendChatRef = useRef<((data: ChatMessage, options?: { target?: string }) => Promise<void>) | null>(null);
  const sendControlRef = useRef<((data: ControlMessage, options?: { target?: string }) => Promise<void>) | null>(null);
  const sendDrawingRef = useRef<((data: Drawing, options?: { target?: string }) => Promise<void>) | null>(null);
  const sendStatusRef = useRef<((data: { id: string; status: PlayerStatus }, options?: { target?: string }) => Promise<void>) | null>(null);
  const sendVoteRef = useRef<((data: { id: string; drawingId: string }, options?: { target?: string }) => Promise<void>) | null>(null);
  useEffect(() => { profileRef.current = profile; }, [profile]);
  useEffect(() => { wordRef.current = word; }, [word]);
  useEffect(() => { profilesRef.current = onlineProfiles; }, [onlineProfiles]);
  useEffect(() => { eliminatedRef.current = eliminatedIds; }, [eliminatedIds]);
  useEffect(() => { eliminatedAiRef.current = eliminatedAiIndexes; }, [eliminatedAiIndexes]);
  useEffect(() => { isHostRef.current = isHost; }, [isHost]);
  useEffect(() => { aiCountRef.current = aiCount; }, [aiCount]);
  useEffect(() => {
    if (!voteDeadline) return;
    const update = () => setVoteSeconds(Math.max(0, Math.ceil((voteDeadline - Date.now()) / 1000)));
    update();
    const timer = window.setInterval(update, 250);
    return () => window.clearInterval(timer);
  }, [voteDeadline]);
  useEffect(() => {
    if (!drawDeadline) return;
    const update = () => setDrawSeconds(Math.max(0, Math.ceil((drawDeadline - Date.now()) / 1000)));
    update();
    const timer = window.setInterval(update, 250);
    return () => window.clearInterval(timer);
  }, [drawDeadline]);
  useEffect(() => () => {
    if (aiTimerRef.current !== null) window.clearTimeout(aiTimerRef.current);
    aiTimersRef.current.forEach(timer => window.clearTimeout(timer));
    if (voteTimerRef.current !== null) window.clearTimeout(voteTimerRef.current);
    void directoryRoomRef.current?.leave();
    void p2pRoomRef.current?.leave();
  }, []);
  useEffect(() => {
    const saved = window.localStorage.getItem("mimic-profile");
    if (saved) {
      try {
        const savedProfile = JSON.parse(saved) as Profile;
        setProfile(savedProfile); profileRef.current = savedProfile;
        const invitedRoom = new URLSearchParams(window.location.search).get("room");
        if (invitedRoom) window.setTimeout(() => connectOnline(false, invitedRoom), 0);
        else setScreen("home");
      } catch { /* 새 프로필 생성 */ }
    }
  }, []);
  useEffect(() => {
    if (!isSupabaseConfigured || screen !== "rooms") return;
    let active = true;
    const load = async () => {
      setIsRefreshingRooms(true);
      try {
        const rooms = await listRooms();
        if (!active) return;
        setPublicRooms(Object.fromEntries(rooms.map(room => [room.code, {
          code: room.code, name: room.name, hostName: room.host_name, players: room.players,
          visibility: room.visibility, updatedAt: new Date(room.updated_at).getTime()
        }])));
      } finally {
        if (active) setIsRefreshingRooms(false);
      }
    };
    void load();
    const timer = window.setInterval(load, 3000);
    return () => { active = false; window.clearInterval(timer); };
  }, [screen, roomRefreshKey]);
  useEffect(() => {
    if (!isSupabaseConfigured || screen !== "lobby" || !isHost || !hostTokenRef.current) return;
    const beat = () => heartbeatRoom(roomCode, hostTokenRef.current, Object.keys(profilesRef.current).length).catch(() => {});
    void beat();
    const timer = window.setInterval(beat, 5000);
    return () => window.clearInterval(timer);
  }, [screen, isHost, roomCode, onlineProfiles]);
  useEffect(() => {
    if (isSupabaseConfigured) return;
    if (screen !== "rooms" && !(screen === "lobby" && isHost)) return;
    const directory = joinRoom(DIRECTORY_CONFIG, "PUBLIC-ROOMS");
    directoryRoomRef.current = directory;
    const roomAction = directory.makeAction<PublicRoom>("room");
    const queryAction = directory.makeAction<{ requestedAt: number }>("query");
    const publish = (target?: string) => {
      if (!isHostRef.current || screen !== "lobby") return;
      const hosted = hostedRoomRef.current;
      roomAction.send({
        code: roomCode,
        name: hosted.name || `${profileRef.current.name}의 방`,
        hostName: profileRef.current.name,
        players: Object.keys(profilesRef.current).length,
        visibility: hosted.visibility,
        passwordHash: hosted.passwordHash,
        updatedAt: Date.now()
      }, target ? { target } : undefined);
    };
    roomAction.onMessage = room => {
      setPublicRooms(old => ({ ...old, [room.code]: room }));
      setIsRefreshingRooms(false);
    };
    queryAction.onMessage = (_query, context) => publish(context.peerId);
    directory.onPeerJoin = peerId => {
      publish(peerId);
      if (screen === "rooms") queryAction.send({ requestedAt: Date.now() }, { target: peerId });
    };
    publish();
    if (screen === "rooms") queryAction.send({ requestedAt: Date.now() });
    const refreshDoneTimer = window.setTimeout(() => setIsRefreshingRooms(false), 4500);
    const timer = window.setInterval(() => {
      publish();
      if (screen === "rooms") queryAction.send({ requestedAt: Date.now() });
      setPublicRooms(old => Object.fromEntries(Object.entries(old).filter(([, room]) => Date.now() - room.updatedAt < 12000)));
    }, 2500);
    return () => {
      window.clearInterval(timer);
      window.clearTimeout(refreshDoneTimer);
      if (directoryRoomRef.current === directory) directoryRoomRef.current = null;
      void directory.leave();
    };
  }, [screen, isHost, roomCode, roomRefreshKey]);
  const saveProfile = () => {
    const clean = { ...profile, name: profile.name.trim().slice(0, 12) };
    if (!clean.name) return;
    window.localStorage.setItem("mimic-profile", JSON.stringify(clean));
    setProfile(clean); profileRef.current = clean;
    const invitedRoom = new URLSearchParams(window.location.search).get("room");
    if (invitedRoom) connectOnline(false, invitedRoom);
    else setScreen("home");
  };
  const createOnlineRoom = async () => {
    if (roomVisibility === "private" && !roomPassword.trim()) return;
    const code = randomCode();
    const hostToken = crypto.randomUUID();
    hostTokenRef.current = hostToken;
    hostedRoomRef.current = {
      name: roomName.trim().slice(0, 20) || `${profileRef.current.name}의 방`,
      visibility: roomVisibility,
      passwordHash: roomVisibility === "private" ? hashPassword(roomPassword) : undefined
    };
    setCurrentRoomName(hostedRoomRef.current.name);
    if (isSupabaseConfigured) {
      await createRoomRecord({
        code, name: hostedRoomRef.current.name, hostName: profileRef.current.name,
        visibility: roomVisibility, password: roomPassword, hostToken
      });
    }
    connectOnline(true, code);
  };
  const joinListedRoom = async (room: PublicRoom) => {
    const passwordOkay = room.visibility !== "private" || (isSupabaseConfigured
      ? await verifyRoomPassword(room.code, passwordAttempts[room.code] || "")
      : hashPassword(passwordAttempts[room.code] || "") === room.passwordHash);
    if (!passwordOkay) {
      setPasswordErrors(old => ({ ...old, [room.code]: true }));
      return;
    }
    connectOnline(false, room.code);
  };
  const returnToLobbyAfterWin = () => window.setTimeout(() => {
    eliminatedRef.current = []; eliminatedAiRef.current = [];
    setEliminatedIds([]); setEliminatedAiIndexes([]); setGameWinner(null);
    setRoundEliminatedId(null); setRoundEliminatedAiIndex(null); setDrawings([]); setSelected(""); setScreen("lobby");
  }, 3000);
  const finishOnlineRound = useCallback(() => {
    const humanDrawings = Object.values(submittedRef.current);
    const activeCount = Object.keys(profilesRef.current).filter(id => !eliminatedRef.current.includes(id)).length;
    const activeAiIndexes = Array.from({ length: aiCountRef.current }, (_, index) => index).filter(index => !eliminatedAiRef.current.includes(index));
    if (humanDrawings.length < activeCount || aiReadyCountRef.current < activeAiIndexes.length) return;
    const aiDrawings: Drawing[] = activeAiIndexes.map(index => {
      const identity = getAiIdentity(index, wordRef.current);
      return { id: `ai-${index}`, author: identity.name, image: pseudoAiSketch(wordRef.current, index), isAI: true };
    });
    const complete = [...humanDrawings, ...aiDrawings];
    const voteEndsAt = Date.now() + 10000;
    setDrawDeadline(0);
    voteGateOpenRef.current = false;
    setDrawings(complete);
    setVoteSeconds(10);
    setVoteDeadline(voteEndsAt);
    setAiStatus("모든 그림이 도착했습니다!");
    sendControlRef.current?.({ type: "gallery", drawings: complete, voteEndsAt });
    if (voteTimerRef.current !== null) window.clearTimeout(voteTimerRef.current);
    voteTimerRef.current = window.setTimeout(() => {
      voteGateOpenRef.current = true;
      finishOnlineVoteRef.current();
    }, 10000);
    window.setTimeout(() => setScreen("vote"), 450);
  }, []);
  const startAiDrawing = useCallback(() => {
    if (aiTimerRef.current !== null) window.clearTimeout(aiTimerRef.current);
    aiTimersRef.current.forEach(timer => window.clearTimeout(timer));
    aiTimersRef.current = [];
    aiReadyRef.current = false;
    aiReadyCountRef.current = 0;
    setAiPlayerStatus("drawing");
    const activeAiIndexes = Array.from({ length: aiCountRef.current }, (_, index) => index).filter(index => !eliminatedAiRef.current.includes(index));
    const aiStatuses = Object.fromEntries(activeAiIndexes.map(index => [`__ai_${index}`, "drawing"])) as Record<string, PlayerStatus>;
    setPlayerStatuses(old => ({ ...old, ...aiStatuses }));
    activeAiIndexes.forEach(index => {
      sendStatusRef.current?.({ id: `__ai_${index}`, status: "drawing" });
      const timer = window.setTimeout(() => {
        aiReadyCountRef.current += 1;
        const allDone = aiReadyCountRef.current >= activeAiIndexes.length;
        aiReadyRef.current = allDone;
        if (allDone) setAiPlayerStatus("done");
        setPlayerStatuses(old => ({ ...old, [`__ai_${index}`]: "done" }));
        sendStatusRef.current?.({ id: `__ai_${index}`, status: "done" });
        finishOnlineRound();
      }, 3000 + Math.floor(Math.random() * 4000));
      aiTimersRef.current.push(timer);
    });
  }, [finishOnlineRound]);
  const finishOnlineVote = useCallback(() => {
    if (!voteGateOpenRef.current || Object.keys(votesRef.current).length < Object.keys(profilesRef.current).length) return;
    const counts: Record<string, number> = {};
    Object.values(votesRef.current).forEach(id => { counts[id] = (counts[id] || 0) + 1; });
    const skipCount = counts.__skip__ || 0;
    const candidateCounts = Object.entries(counts).filter(([id]) => id !== "__skip__").sort((a, b) => b[1] - a[1]);
    const topCount = candidateCounts[0]?.[1] || 0;
    const tiedCandidates = candidateCounts.filter(([, count]) => count === topCount);
    const winner = tiedCandidates.length === 1 && topCount >= skipCount ? tiedCandidates[0][0] : undefined;
    const eliminatedId = winner?.startsWith("human-") ? winner.slice(6) : null;
    const eliminatedAiIndex = winner?.startsWith("ai-") ? Number(winner.slice(3)) : null;
    if (eliminatedId && !eliminatedRef.current.includes(eliminatedId)) {
      eliminatedRef.current = [...eliminatedRef.current, eliminatedId];
      setEliminatedIds(eliminatedRef.current);
    }
    if (eliminatedAiIndex !== null && Number.isFinite(eliminatedAiIndex) && !eliminatedAiRef.current.includes(eliminatedAiIndex)) {
      eliminatedAiRef.current = [...eliminatedAiRef.current, eliminatedAiIndex];
      setEliminatedAiIndexes(eliminatedAiRef.current);
    }
    const livingHumans = Object.keys(profilesRef.current).filter(id => !eliminatedRef.current.includes(id)).length;
    const livingAi = Array.from({ length: aiCountRef.current }, (_, index) => index).filter(index => !eliminatedAiRef.current.includes(index)).length;
    const gameOverWinner: "human" | "ai" | null = livingHumans === 0 ? "ai" : livingAi === 0 ? "human" : null;
    setRoundEliminatedId(eliminatedId);
    setRoundEliminatedAiIndex(eliminatedAiIndex);
    setGameWinner(gameOverWinner);
    sendControlRef.current?.({ type: "result", eliminatedId, eliminatedAiIndex, winner: gameOverWinner });
    setScreen("result");
    if (gameOverWinner) returnToLobbyAfterWin();
  }, []);
  finishOnlineVoteRef.current = finishOnlineVote;
  const connectOnline = (host: boolean, requestedCode?: string) => {
    p2pRoomRef.current?.leave();
    setChatMessages([]); setChatInput("");
    eliminatedRef.current = []; eliminatedAiRef.current = [];
    setEliminatedIds([]); setEliminatedAiIndexes([]); setGameWinner(null);
    const code = (requestedCode || randomCode()).trim().toUpperCase();
    if (code.length < 4) return;
    setRoomCode(code); setIsOnline(true); setIsHost(host); isHostRef.current = host; setConnectionText("친구를 기다리는 중...");
    const mine: OnlineProfile = { ...profileRef.current, id: selfId, host };
    const initial = { [selfId]: mine };
    setOnlineProfiles(initial); profilesRef.current = initial;
    const p2pRoom = joinRoom({ appId: "mimic-ai-game-2026-v1" }, code);
    p2pRoomRef.current = p2pRoom;
    const profileAction = p2pRoom.makeAction<OnlineProfile>("profile");
    const roomMetaAction = p2pRoom.makeAction<RoomMeta>("room-meta");
    const chatAction = p2pRoom.makeAction<ChatMessage>("chat");
    const controlAction = p2pRoom.makeAction<ControlMessage>("control");
    const drawingAction = p2pRoom.makeAction<Drawing>("drawing");
    const statusAction = p2pRoom.makeAction<{ id: string; status: PlayerStatus }>("status");
    const voteAction = p2pRoom.makeAction<{ id: string; drawingId: string }>("vote");
    sendProfileRef.current = profileAction.send;
    sendRoomMetaRef.current = roomMetaAction.send;
    sendChatRef.current = chatAction.send;
    sendControlRef.current = controlAction.send;
    sendDrawingRef.current = drawingAction.send;
    sendStatusRef.current = statusAction.send;
    sendVoteRef.current = voteAction.send;
    profileAction.onMessage = data => {
      setOnlineProfiles(old => {
        const next = { ...old, [data.id]: data };
        profilesRef.current = next;
        return next;
      });
      setConnectionText("실시간 연결됨");
    };
    roomMetaAction.onMessage = data => {
      setCurrentRoomName(data.name);
      setAiCount(data.aiCount || 1);
      aiCountRef.current = data.aiCount || 1;
    };
    chatAction.onMessage = data => setChatMessages(old => [...old.slice(-49), data]);
    controlAction.onMessage = data => {
      if (data.type === "start") {
        voteGateOpenRef.current = false; setVoteDeadline(0);
        setDrawDeadline(data.drawEndsAt); setDrawSeconds(Math.max(0, Math.ceil((data.drawEndsAt - Date.now()) / 1000)));
        eliminatedRef.current = data.eliminatedIds; setEliminatedIds(data.eliminatedIds);
        const statuses = Object.fromEntries(Object.keys(profilesRef.current).map(id => [id, data.eliminatedIds.includes(id) ? "eliminated" : "drawing"])) as Record<string, PlayerStatus>;
        const activeAiIndexes = Array.from({ length: aiCountRef.current }, (_, index) => index).filter(index => !eliminatedAiRef.current.includes(index));
        const aiStatuses = Object.fromEntries(activeAiIndexes.map(index => [`__ai_${index}`, "drawing"])) as Record<string, PlayerStatus>;
        setPlayerStatuses({ ...statuses, ...aiStatuses }); votesRef.current = {}; setRoundEliminatedId(null); setRoundEliminatedAiIndex(null);
        aiReadyRef.current = false; aiReadyCountRef.current = 0; setAiPlayerStatus("drawing"); setHasSubmitted(false); setHasVoted(false);
        wordRef.current = data.word; setWord(data.word); setDrawings([]); setSelected(""); submittedRef.current = {}; setScreen("draw");
      } else if (data.type === "gallery") {
        setDrawDeadline(0); setDrawings(data.drawings); setAiStatus("모든 그림이 도착했습니다!"); setHasVoted(false); setVoteDeadline(data.voteEndsAt); setScreen("vote");
      } else {
        if (data.eliminatedId && !eliminatedRef.current.includes(data.eliminatedId)) {
          eliminatedRef.current = [...eliminatedRef.current, data.eliminatedId];
          setEliminatedIds(eliminatedRef.current);
        }
        if (data.eliminatedAiIndex !== null && data.eliminatedAiIndex !== undefined && !eliminatedAiRef.current.includes(data.eliminatedAiIndex)) {
          eliminatedAiRef.current = [...eliminatedAiRef.current, data.eliminatedAiIndex];
          setEliminatedAiIndexes(eliminatedAiRef.current);
        }
        setGameWinner(data.winner || null);
        setRoundEliminatedId(data.eliminatedId); setRoundEliminatedAiIndex(data.eliminatedAiIndex ?? null); setScreen("result");
        if (data.winner) returnToLobbyAfterWin();
      }
    };
    drawingAction.onMessage = (data, context) => {
      if (!isHostRef.current) return;
      submittedRef.current[context.peerId] = data;
      finishOnlineRound();
    };
    statusAction.onMessage = data => {
      setPlayerStatuses(old => ({ ...old, [data.id]: data.status }));
      if (data.id.startsWith("__ai_") && data.status === "done") {
        setPlayerStatuses(old => {
          const next = { ...old, [data.id]: data.status };
          const allDone = Array.from({ length: aiCountRef.current }, (_, index) => index).filter(index => !eliminatedAiRef.current.includes(index)).every(index => next[`__ai_${index}`] === "done");
          if (allDone) setAiPlayerStatus("done");
          return next;
        });
      }
    };
    voteAction.onMessage = data => {
      if (!isHostRef.current) return;
      votesRef.current[data.id] = data.drawingId;
      finishOnlineVote();
    };
    p2pRoom.onPeerJoin = peerId => {
      profileAction.send(mine, { target: peerId });
      if (isHostRef.current) roomMetaAction.send({ name: hostedRoomRef.current.name || `${profileRef.current.name}의 방`, visibility: hostedRoomRef.current.visibility, aiCount: aiCountRef.current }, { target: peerId });
      setConnectionText("실시간 연결됨");
    };
    p2pRoom.onPeerLeave = peerId => {
      setOnlineProfiles(old => {
        const departedWasHost = Boolean(old[peerId]?.host);
        const next = { ...old }; delete next[peerId];
        if (departedWasHost) {
          const nextHostId = Object.keys(next).sort()[0];
          Object.keys(next).forEach(id => { next[id] = { ...next[id], host: id === nextHostId }; });
          const promoted = nextHostId === selfId;
          isHostRef.current = promoted;
          setIsHost(promoted);
          if (promoted) setConnectionText("방장이 나가 새 방장이 되었습니다");
        }
        profilesRef.current = next; return next;
      });
    };
    setScreen("lobby");
  };
  const startOnlineGame = () => {
    if (!isHost || Object.keys(onlineProfiles).length < 2) return;
    const nextWord = randomWord(wordRef.current);
    const drawEndsAt = Date.now() + 60000;
    const statuses = Object.fromEntries(Object.keys(onlineProfiles).map(id => [id, eliminatedRef.current.includes(id) ? "eliminated" : "drawing"])) as Record<string, PlayerStatus>;
    voteGateOpenRef.current = false; setVoteDeadline(0);
    if (voteTimerRef.current !== null) window.clearTimeout(voteTimerRef.current);
    const activeAiIndexes = Array.from({ length: aiCountRef.current }, (_, index) => index).filter(index => !eliminatedAiRef.current.includes(index));
    const aiStatuses = Object.fromEntries(activeAiIndexes.map(index => [`__ai_${index}`, "drawing"])) as Record<string, PlayerStatus>;
    setPlayerStatuses({ ...statuses, ...aiStatuses }); votesRef.current = {}; setRoundEliminatedId(null); setRoundEliminatedAiIndex(null);
    setHasSubmitted(false); setHasVoted(false); setDrawDeadline(drawEndsAt); setDrawSeconds(60);
    wordRef.current = nextWord; setWord(nextWord); setDrawings([]); setSelected(""); submittedRef.current = {}; setScreen("draw");
    sendControlRef.current?.({ type: "start", word: nextWord, eliminatedIds: eliminatedRef.current, drawEndsAt });
    startAiDrawing();
  };
  const chooseAiCount = (count: number) => {
    if (!isHost) return;
    setAiCount(count); aiCountRef.current = count;
    sendRoomMetaRef.current?.({
      name: currentRoomName || hostedRoomRef.current.name || `${profileRef.current.name}의 방`,
      visibility: hostedRoomRef.current.visibility,
      aiCount: count
    });
  };
  const sendChatMessage = () => {
    const text = chatInput.trim().slice(0, 120);
    if (!text) return;
    const message: ChatMessage = {
      id: `${selfId}-${Date.now()}`, senderId: selfId,
      senderName: profileRef.current.name, text, sentAt: Date.now()
    };
    setChatMessages(old => [...old.slice(-49), message]);
    setChatInput("");
    sendChatRef.current?.(message);
  };
  const leaveOnline = () => {
    if (isHostRef.current && isSupabaseConfigured && hostTokenRef.current) {
      void deleteRoomRecord(roomCode, hostTokenRef.current);
      hostTokenRef.current = "";
    }
    if (aiTimerRef.current !== null) window.clearTimeout(aiTimerRef.current);
    aiTimerRef.current = null; aiReadyRef.current = false;
    if (voteTimerRef.current !== null) window.clearTimeout(voteTimerRef.current);
    voteTimerRef.current = null; voteGateOpenRef.current = false;
    void p2pRoomRef.current?.leave();
    p2pRoomRef.current = null; setIsOnline(false); setIsHost(false); isHostRef.current = false; setOnlineProfiles({});
    setChatMessages([]); setChatInput("");
    window.history.replaceState({}, "", window.location.pathname);
    setScreen("home");
  };
  const submitOnlineVote = (choice = selected) => {
    if (!choice || hasVoted) return;
    if (choice === "__skip__") setSelected("");
    votesRef.current[selfId] = choice;
    setHasVoted(true);
    if (isHost) finishOnlineVote();
    else sendVoteRef.current?.({ id: selfId, drawingId: choice });
  };
  const startGame = () => { setWord(randomWord(word)); setDrawings([]); setTurn(0); setSelected(""); setDrawDeadline(Date.now() + 60000); setDrawSeconds(60); setScreen("draw"); };
  const submitHuman = (image: string) => {
    if (isOnline) {
      if (hasSubmitted) return;
      const mine: Drawing = { id: `human-${selfId}`, author: profile.name, image, isAI: false };
      setHasSubmitted(true);
      setPlayerStatuses(old => ({ ...old, [selfId]: "done" }));
      sendStatusRef.current?.({ id: selfId, status: "done" });
      if (isHost) {
        submittedRef.current[selfId] = mine;
        setDrawings(Object.values(submittedRef.current));
        finishOnlineRound();
      } else {
        sendDrawingRef.current?.(mine);
      }
      return;
    }
    setDrawings(old => [...old, { id: `human-${turn}`, author: `플레이어 ${turn + 1}`, image, isAI: false }]);
    if (turn + 1 < players) {
      setTurn(turn + 1); setDrawDeadline(Date.now() + 60000); setDrawSeconds(60);
    } else {
      setDrawDeadline(0); setScreen("ai");
    }
  };
  const generateAI = useCallback(async () => {
    setAiStatus("AI가 펜을 고르는 중...");
    try {
      const response = await fetch("/api/generate", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ word }) });
      if (!response.ok) throw new Error("fallback");
      const data = await response.json();
      setDrawings(old => [...old, { id: "ai", author: "MIMIC BOT", image: data.image, isAI: true }]);
      setAiStatus("GPT 이미지 완성!");
    } catch {
      setDrawings(old => [...old, { id: "ai", author: "MIMIC BOT", image: pseudoAiSketch(word), isAI: true }]);
      setAiStatus("데모 AI 스케치 완성!");
    }
    window.setTimeout(() => setScreen("vote"), 550);
  }, [word]);
  useEffect(() => { if (screen === "ai" && !isOnline) generateAI(); }, [screen, generateAI, isOnline]);
  const gallery = [...drawings].sort((a, b) => a.id.localeCompare(b.id));
  const picked = drawings.find(item => item.id === selected);
  const fooled = picked ? !picked.isAI : false;

  return <main>
    <header className="site-header">
      <button className="brand" onClick={() => setScreen(profile.name ? "home" : "profile")}><span className="brand-dot" /> MIMIC<span>.AI</span></button>
      {profile.name && <button className="profile-chip" onClick={() => setScreen("profile")} aria-label="프로필 수정">
        <span className={`mini-avatar ${profile.shape}`} style={{ background: profile.color }}>{profile.face}</span>
        <strong>{profile.name}</strong><small>EDIT</small>
      </button>}
    </header>
    {screen === "profile" && <section className="profile-screen">
      <div className="profile-intro">
        <div className="eyebrow">CREATE YOUR HUMAN</div>
        <h1>당신은<br /><em>누구인가요?</em></h1>
        <p>게임에서 사용할 이름과 캐릭터를 만드세요.<br />당신은 이제부터 AI 입니다!</p>
      </div>
      <div className="creator-card">
        <div className="avatar-stage">
          <div className={`avatar-preview ${profile.shape}`} style={{ background: profile.color }}>
            <span>{profile.face}</span><i /><b />
          </div>
          <span className="avatar-shadow" />
        </div>
        <label className="name-field"><span>PLAYER NAME</span><input autoFocus maxLength={12} placeholder="이름을 입력하세요" value={profile.name} onChange={e => setProfile({ ...profile, name: e.target.value })} onKeyDown={e => { if (e.key === "Enter") saveProfile(); }} /></label>
        <div className="creator-section"><span className="creator-label">BODY COLOR</span><div className="avatar-options">{AVATAR_COLORS.map(color => <button key={color} className={`avatar-color ${profile.color === color ? "active" : ""}`} style={{ background: color }} onClick={() => setProfile({ ...profile, color })} aria-label={`캐릭터 색상 ${color}`} />)}</div></div>
        <div className="creator-section"><span className="creator-label">FACE</span><div className="face-options">{FACES.map(face => <button key={face} className={profile.face === face ? "active" : ""} onClick={() => setProfile({ ...profile, face })}>{face}</button>)}</div></div>
        <div className="creator-section"><span className="creator-label">SHAPE</span><div className="shape-options">{SHAPES.map((shape, index) => <button key={shape} className={profile.shape === shape ? "active" : ""} onClick={() => setProfile({ ...profile, shape })}><i className={shape} />{["동글", "네모", "말랑"][index]}</button>)}</div></div>
        <button className="primary profile-submit" disabled={!profile.name.trim()} onClick={saveProfile}>이 캐릭터로 시작 →</button>
      </div>
    </section>}
    {screen === "home" && <section className="hero">
      <div className="eyebrow">DRAW LIKE A MACHINE</div>
      <h1>너 <em>누구야.</em></h1>
      <p className="hero-copy"><strong>{profile.name}</strong>, 당신이 인간이라는 사실은 아무도 몰라야 합니다.<br />망설이는 손끝 하나면 정체가 드러납니다. 기계처럼 그리고, 끝까지 살아남으세요.</p>
      <div className="hero-actions"><button className="primary" onClick={() => setScreen("rooms")}>온라인 플레이 <span>↗</span></button><button className="secondary" onClick={() => { setIsOnline(false); setPlayers(2); startGame(); }}>한 기기 데모</button></div>
      <div className="join-room"><span>친구 방에 참여</span><div><input value={joinCode} maxLength={6} placeholder="초대 코드" onChange={e => setJoinCode(e.target.value.toUpperCase())} onKeyDown={e => { if (e.key === "Enter") connectOnline(false, joinCode); }} /><button onClick={() => connectOnline(false, joinCode)} disabled={joinCode.trim().length < 4}>입장 →</button></div></div>
      <div className="how-grid"><article><strong>같은 제시어</strong><p>모두에게 하나의 기묘한 제시어가 공개됩니다.</p></article><article><strong>사람처럼? AI처럼!</strong><p>색과 굵기만으로 AI 같은 그림을 완성하세요.</p></article><article><strong>속이고 찾아내기</strong><p>진짜 AI 그림에 투표하고 정체를 공개합니다.</p></article></div>
      <div className="hero-orbit" aria-hidden="true"><span>HUMAN?</span><span>AI?</span><i /></div>
    </section>}
    {screen === "rooms" && <section className="panel room-browser">
      <div className="room-browser-head">
        <div><div className="eyebrow">PLAY WITH OTHERS</div><h2>함께 그릴<br /><em>사람을 찾으세요.</em></h2><p>방을 만들면 지금 접속 중인 다른 사람의 게시판에 나타납니다.</p></div>
        <div className="room-create-card">
          <label><span>방 이름</span><input maxLength={20} value={roomName} onChange={e => setRoomName(e.target.value)} placeholder={`${profile.name}의 방`} /></label>
          <div className="visibility-tabs"><button className={roomVisibility === "public" ? "active" : ""} onClick={() => setRoomVisibility("public")}>공개 방</button><button className={roomVisibility === "private" ? "active" : ""} onClick={() => setRoomVisibility("private")}>비공개 방</button></div>
          {roomVisibility === "private" && <label><span>비밀번호</span><input type="password" maxLength={12} value={roomPassword} onChange={e => setRoomPassword(e.target.value)} placeholder="목록에서 참가할 때 필요" /></label>}
          <button className="primary create-public-room" disabled={roomVisibility === "private" && !roomPassword.trim()} onClick={createOnlineRoom}>방 만들기 <span>＋</span></button>
        </div>
      </div>
      <div className="room-board">
        <div className="room-board-title"><strong>열린 방</strong><button aria-label="방 목록 새로고침" className={isRefreshingRooms ? "refreshing" : ""} onClick={() => { setPublicRooms({}); setIsRefreshingRooms(true); setRoomRefreshKey(key => key + 1); }} disabled={isRefreshingRooms}>↻</button></div>
        {Object.values(publicRooms).length > 0 ? Object.values(publicRooms).sort((a, b) => b.updatedAt - a.updatedAt).map(room => <article key={room.code} className={`public-room-row ${room.visibility}`}>
          <span className="room-live-dot" /><div className="room-row-info"><strong>{room.visibility === "private" ? "🔒 " : ""}{room.name}</strong><small>{room.hostName} · ROOM / {room.code}</small></div><b>{room.players} / 4명</b>
          {room.visibility === "private" && <input className={passwordErrors[room.code] ? "wrong" : ""} type="password" placeholder={passwordErrors[room.code] ? "비밀번호가 달라요" : "비밀번호"} value={passwordAttempts[room.code] || ""} onChange={e => { setPasswordAttempts(old => ({ ...old, [room.code]: e.target.value })); setPasswordErrors(old => ({ ...old, [room.code]: false })); }} onKeyDown={e => { if (e.key === "Enter") joinListedRoom(room); }} />}
          <button onClick={() => joinListedRoom(room)} disabled={room.players >= 4}>참가하기 →</button>
        </article>) : <div className="empty-rooms"><strong>아직 열린 방이 없습니다.</strong><p>첫 공개 방을 만들면 다른 접속자들이 바로 참가할 수 있어요.</p></div>}
      </div>
      <div className="direct-join"><div><input value={joinCode} maxLength={6} placeholder="ROOM CODE" onChange={e => setJoinCode(e.target.value.toUpperCase())} onKeyDown={e => { if (e.key === "Enter") connectOnline(false, joinCode); }} /><button onClick={() => connectOnline(false, joinCode)} disabled={joinCode.trim().length < 4}>입장 →</button></div></div>
    </section>}
    {screen === "lobby" && <section className="panel lobby">
      <div className="lobby-title"><div><h2 className="room-name-heading">{currentRoomName || `${Object.values(onlineProfiles).find(item => item.host)?.name || profile.name}의 방`}</h2><div className="eyebrow">ASSEMBLE HUMANS</div></div><div className="room-card"><span>초대 코드</span><strong>{roomCode}</strong><button onClick={() => { navigator.clipboard?.writeText(`${location.origin}${location.pathname}?room=${roomCode}`); setCopied(true); }}>{copied ? "초대 링크 복사 완료 ✓" : "초대 링크 복사"}</button></div></div>
      <div className="ai-count-control"><span>AI 참가자</span><div>{[1, 2, 3].map(count => <button key={count} className={aiCount === count ? "active" : ""} disabled={!isHost} onClick={() => chooseAiCount(count)}>{count}명</button>)}</div></div>
      <div className="players">{Object.values(onlineProfiles).sort((a, b) => Number(Boolean(b.host)) - Number(Boolean(a.host))).map(item => <div className="player-card" key={item.id}><span className={`mini-avatar ${item.shape}`} style={{ background: item.color }}>{item.face}</span><div><strong>{item.name}</strong><small>{item.host ? "방장" : "게스트"} · 실시간 접속</small></div><i>READY</i></div>)}{Object.keys(onlineProfiles).length < 2 && <button className="add-player" onClick={() => { navigator.clipboard?.writeText(`${location.origin}${location.pathname}?room=${roomCode}`); setCopied(true); }}>{copied ? "복사 완료 ✓" : "초대 +"}</button>}</div>
      <div className="room-chat">
        <div className="chat-head"><strong>ROOM CHAT</strong><span>{Object.keys(onlineProfiles).length}명 접속</span></div>
        <div className="chat-messages">{chatMessages.length ? chatMessages.map(message => <div key={message.id} className={message.senderId === selfId ? "mine" : ""}><strong>{message.senderName}</strong><p>{message.text}</p></div>) : <p className="chat-empty">첫 메시지를 보내보세요.</p>}</div>
        <div className="chat-compose"><input maxLength={120} value={chatInput} placeholder="메시지 입력" onChange={event => setChatInput(event.target.value)} onKeyDown={event => { if (event.key === "Enter") sendChatMessage(); }} /><button onClick={sendChatMessage} disabled={!chatInput.trim()}>전송 →</button></div>
      </div>
      <div className="lobby-footer"><p>{Object.keys(onlineProfiles).length}명 접속 · 최소 2명 · 최대 4명</p>{isHost ? <button className="primary" disabled={Object.keys(onlineProfiles).length < 2} onClick={startOnlineGame}>게임 시작 →</button> : <span className="waiting-host">방장이 시작하기를 기다리는 중...</span>}</div>
    </section>}
    {screen === "draw" && <section className="game-screen">
      <div className="game-top"><div><span className="round">ROUND 01</span><span className="turn">{isOnline ? `${profile.name} 그리는 중` : `플레이어 ${turn + 1} 차례`}</span></div><div className="prompt"><small>오늘의 제시어</small><strong>{word}</strong></div><div className="timer"><small>TIME LEFT</small><strong>{`${String(Math.floor(drawSeconds / 60)).padStart(2, "0")}:${String(drawSeconds % 60).padStart(2, "0")}`}</strong></div></div>
      {isOnline && <div className="drawing-statuses">
        {Object.values(onlineProfiles).map(item => <div key={item.id} className={playerStatuses[item.id] || "drawing"}><span className={`mini-avatar ${item.shape}`} style={{ background: item.color }}>{item.face}</span><strong>{item.name}</strong><i>{playerStatuses[item.id] === "done" ? "제출 완료" : playerStatuses[item.id] === "eliminated" ? "탈락 · 투표만 가능" : "그리는 중..."}</i></div>)}
        {Array.from({ length: aiCount }, (_, index) => index).filter(index => !eliminatedAiIndexes.includes(index)).map(index => { const identity = getAiIdentity(index, word); return <div key={`ai-status-${index}`} className={playerStatuses[`__ai_${index}`] || "drawing"}><span className={`mini-avatar ${identity.shape} ai-avatar`} style={{ background: identity.color }}>{identity.face}</span><strong>{identity.name}</strong><i>{playerStatuses[`__ai_${index}`] === "done" ? "제출 완료" : "그리는 중..."}</i></div>; })}
      </div>}
      {isOnline && eliminatedIds.includes(selfId)
        ? <div className="eliminated-wait"><span>OUT</span><h2>이번 라운드는<br />그림을 그릴 수 없어요.</h2><p>다른 사람의 그림이 완성되면 투표에 참여할 수 있습니다.</p></div>
        : <><DrawingBoard key={isOnline ? word : turn} player={isOnline ? profile.name : `플레이어 ${turn + 1}`} onSubmit={submitHuman} submitted={isOnline && hasSubmitted} deadline={drawDeadline} /><p className="pass-note">{isOnline ? "친구들도 각자의 화면에서 동시에 그림을 그리고 있습니다." : "그림 제출 후 다음 플레이어에게 화면을 넘겨주세요. 그림은 투표 전까지 비공개입니다."}</p></>}
    </section>}
    {screen === "ai" && <section className="loading-screen"><div className="scanner"><div className="bot-face">⌁</div><i /></div><div className="eyebrow">MACHINE AT WORK</div><h2>{aiStatus || "AI가 그림을 그리고 있어요..."}</h2><p>같은 흰 배경, 같은 펜 규칙으로 한 장을 추가합니다.</p></section>}
    {screen === "vote" && <section className="panel vote">
      <div className="section-top"><span>ROUND 01 / VOTE</span><span className="status-pill orange">정체 비공개</span></div>
      <div className="vote-heading"><div><div className="eyebrow">ELIMINATE A PLAYER</div><h2>사람을<br />죽여주세요.</h2></div><p>게임 안에서 탈락시킬 그림을 한 장 선택하세요.<br />가장 많은 표를 받은 사람은 다음 라운드부터 투표만 할 수 있습니다.</p></div>
      <div className="gallery">{gallery.map((item, index) => <button key={item.id} disabled={isOnline && hasVoted} className={`art-card ${selected === item.id ? "selected" : ""}`} onClick={() => setSelected(item.id)}><span>DRAWING / 0{index + 1}</span><img src={item.image} alt={`후보 그림 ${index + 1}`} /><b>{selected === item.id ? "선택됨 ✓" : "이 그림에 투표"}</b></button>)}</div>
      <div className="vote-submit"><span>{isOnline && voteSeconds > 0 ? `결과 공개까지 ${voteSeconds}초` : selected ? "선택 완료. 이 그림의 주인에게 투표합니다." : "탈락시킬 사람의 그림을 선택하세요."}</span><div className="vote-actions">{isOnline && <button className="skip-button" disabled={hasVoted} onClick={() => submitOnlineVote("__skip__")}>투표 건너뛰기</button>}<button className="primary" disabled={!selected || (isOnline && hasVoted)} onClick={isOnline ? () => submitOnlineVote() : () => setScreen("result")}>{isOnline && hasVoted ? "투표 완료 ✓" : "투표 완료 →"}</button></div></div>
    </section>}
    {screen === "result" && (isOnline || picked) && <section className="result-screen">
      <div className="result-copy"><div className="eyebrow">VOTE RESULT</div><h2>{gameWinner ? <>{gameWinner === "human" ? "인간" : "AI"}<br /><em>승리</em></> : isOnline ? (roundEliminatedId ? <>{onlineProfiles[roundEliminatedId]?.name || "한 사람"}<br /><em>탈락입니다.</em></> : roundEliminatedAiIndex !== null ? <>{getAiIdentity(roundEliminatedAiIndex, word).name}<br /><em>제거 완료</em></> : <>이번에는<br /><em>아무도 죽지 않았습니다.</em></>) : (fooled ? <>완벽하게<br /><em>속았습니다.</em></> : <>정확하게<br /><em>찾았습니다.</em></>)}</h2><p>{gameWinner ? "3초 후 대기실로 돌아갑니다." : isOnline ? (roundEliminatedId ? "가장 많은 표를 받았습니다. 다음 라운드부터 그림은 그릴 수 없지만 투표에는 계속 참여합니다." : roundEliminatedAiIndex !== null ? "AI 한 명을 찾아 제거했습니다." : "동률 또는 건너뛰기로 이번 라운드에는 탈락자가 없습니다.") : (fooled ? `${picked?.author}의 그림은 사람이 그렸습니다. AI처럼 보이는 데 성공했네요.` : "선택한 그림은 AI가 그린 그림입니다.")}</p>{!gameWinner && (!isOnline || isHost ? <button className="primary" onClick={isOnline ? startOnlineGame : startGame}>다음 라운드 →</button> : <span className="waiting-host">방장이 다음 라운드를 준비 중...</span>)}</div>
      <div className={`reveal-stack ${drawings.length >= 5 ? "many" : ""}`}>{drawings.map(item => <article key={item.id} className={item.id === selected ? "picked" : ""}><img src={item.image} alt={`${item.author}의 그림`} /><div><span>{item.isAI ? "AI" : "HUMAN"}</span><strong>{item.author}</strong>{item.id === selected && <b>YOUR PICK</b>}</div></article>)}</div>
    </section>}
    <footer><span>MIMIC.AI / 2026</span></footer>
  </main>;
}
