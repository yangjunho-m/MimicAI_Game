"use client";

import { PointerEvent, useCallback, useEffect, useRef, useState } from "react";
import { joinRoom, selfId } from "trystero";

type Screen = "profile" | "home" | "lobby" | "draw" | "ai" | "vote" | "result";
type Drawing = { id: string; author: string; image: string; isAI: boolean };
type Profile = { name: string; color: string; face: string; shape: string };
type OnlineProfile = Profile & { id: string; host?: boolean };
type ControlMessage =
  | { type: "start"; word: string; eliminatedIds: string[] }
  | { type: "gallery"; drawings: Drawing[] }
  | { type: "result"; eliminatedId: string | null };
type PlayerStatus = "drawing" | "done" | "eliminated";
const WORDS = ["우주에서 라면을 먹는 고양이", "비 오는 날의 놀이공원", "춤추는 선인장", "달에 간 붕어빵"];
const COLORS = ["#171717", "#ff5d3b", "#6e56cf", "#168c73", "#f4b400"];
const AVATAR_COLORS = ["#ff5d3b", "#6e56cf", "#168c73", "#f4b400", "#ef8eb8", "#58a6d8"];
const FACES = ["•ᴗ•", "¬‿¬", "•̀ᴗ•́", "◕‿◕", "×‿×", "•_•"];
const SHAPES = ["round", "square", "blob"];
const randomCode = () => Math.random().toString(36).slice(2, 6).toUpperCase();

function pseudoAiSketch(word: string) {
  const canvas = document.createElement("canvas");
  canvas.width = 900; canvas.height = 620;
  const c = canvas.getContext("2d")!;
  c.fillStyle = "#fff"; c.fillRect(0, 0, canvas.width, canvas.height);
  c.lineCap = "round"; c.lineJoin = "round";
  const seed = [...word].reduce((a, v) => a + v.charCodeAt(0), 0) + Math.floor(Math.random() * 10000);
  const wobble = (n: number, amount = 10) => Math.sin(seed * .17 + n * 1.9) * amount;
  const line = (color = "#171717", width = 9) => { c.strokeStyle = color; c.lineWidth = width + wobble(width, 1.5); };
  const dot = (x: number, y: number, r = 8) => { c.fillStyle = "#171717"; c.beginPath(); c.arc(x, y, r, 0, Math.PI * 2); c.fill(); };
  const roughArc = (cx: number, cy: number, rx: number, ry: number, start = 0, end = Math.PI * 2, rotation = 0, roughness = 7) => {
    const steps = Math.max(24, Math.round(54 * Math.abs(end - start) / (Math.PI * 2)));
    c.beginPath();
    for (let i = 0; i <= steps; i++) {
      const angle = start + (end - start) * (i / steps);
      const shake = Math.sin(angle * 5 + seed * .11) * roughness + Math.sin(angle * 11 + seed * .07) * roughness * .35;
      const localX = Math.cos(angle) * (rx + shake);
      const localY = Math.sin(angle) * (ry + shake * .65);
      const x = cx + localX * Math.cos(rotation) - localY * Math.sin(rotation);
      const y = cy + localX * Math.sin(rotation) + localY * Math.cos(rotation);
      if (i === 0) c.moveTo(x, y); else c.lineTo(x, y);
    }
    if (Math.abs(end - start) >= Math.PI * 1.99) c.closePath();
    c.stroke();
  };
  const accent = COLORS[(seed % 4) + 1];
  line();

  if (word.includes("놀이공원")) {
    roughArc(455, 285, 175 + wobble(1), 171 + wobble(3), 0, Math.PI * 2, wobble(4, .035), 9);
    for (let i = 0; i < 8; i++) { const a = i * Math.PI / 4; c.beginPath(); c.moveTo(455, 285); c.lineTo(455 + Math.cos(a) * 175, 285 + Math.sin(a) * 175); c.stroke(); }
    line(accent, 12); c.beginPath(); c.moveTo(335, 520); c.lineTo(455, 285); c.lineTo(575, 520); c.stroke();
    line(); for (let i = 0; i < 6; i++) { c.beginPath(); c.moveTo(155 + i * 125, 80 + wobble(i, 18)); c.lineTo(145 + i * 125, 125 + wobble(i + 2, 14)); c.stroke(); }
  } else if (word.includes("선인장")) {
    line(accent, 16); c.beginPath(); c.moveTo(445, 500); c.bezierCurveTo(415, 390, 430, 230, 455, 125); c.stroke();
    c.beginPath(); c.moveTo(430, 330); c.bezierCurveTo(345, 350, 330, 285, 340, 235); c.moveTo(465, 275); c.bezierCurveTo(555, 295, 575, 230, 565, 180); c.stroke();
    line(); roughArc(455, 520, 150, 38, 0, Math.PI * 2, wobble(5, .04), 5);
    for (let i = 0; i < 14; i++) { const x = 350 + (i * 47) % 220, y = 150 + (i * 71) % 300; c.beginPath(); c.moveTo(x, y); c.lineTo(x + wobble(i, 12), y - 13); c.stroke(); }
    dot(420, 205); dot(480, 205); c.beginPath(); c.arc(452, 235, 35, .1, Math.PI - .1); c.stroke();
  } else if (word.includes("붕어빵")) {
    line(accent, 13); roughArc(430, 340, 190 + wobble(2), 95 + wobble(6, 5), 0, Math.PI * 2, -.08 + wobble(7, .025), 8);
    c.beginPath(); c.moveTo(590, 325); c.lineTo(715, 245); c.lineTo(690, 385); c.closePath(); c.stroke();
    line(); roughArc(680, 145, 75, 72, .3, Math.PI * 1.7, wobble(8, .03), 6);
    c.beginPath(); c.moveTo(300, 295); c.quadraticCurveTo(430, 340, 300, 395); c.moveTo(370, 255); c.lineTo(420, 425); c.moveTo(455, 248); c.lineTo(490, 425); c.stroke();
    dot(280, 330, 9);
    for (let i = 0; i < 10; i++) dot(120 + ((i * 83) % 650), 80 + ((i * 47) % 130), 3 + (i % 3));
  } else {
    roughArc(440, 255, 120 + wobble(1), 116 + wobble(9, 5), 0, Math.PI * 2, wobble(10, .04), 7);
    c.beginPath(); c.moveTo(350, 185); c.lineTo(390 + wobble(1), 95); c.lineTo(430, 165); c.moveTo(475, 165); c.lineTo(520 + wobble(2), 95); c.lineTo(545, 190); c.stroke();
    dot(400, 250); dot(480, 250); c.beginPath(); c.moveTo(430, 290); c.quadraticCurveTo(450, 315, 475, 290); c.stroke();
    line(accent, 13); roughArc(445, 440, 185 + wobble(11, 8), 75 + wobble(12, 5), 0, Math.PI * 2, wobble(13, .025), 7);
    for (let i = 0; i < 5; i++) { c.beginPath(); c.moveTo(300 + i * 70, 410 + wobble(i)); c.quadraticCurveTo(345 + i * 45, 455, 330 + i * 75, 475 + wobble(i + 4)); c.stroke(); }
  }
  return canvas.toDataURL("image/png");
}

function DrawingBoard({ onSubmit, player }: { onSubmit: (image: string) => void; player: string }) {
  const ref = useRef<HTMLCanvasElement>(null);
  const drawing = useRef(false);
  const [color, setColor] = useState(COLORS[0]);
  const [width, setWidth] = useState(8);
  const history = useRef<ImageData[]>([]);
  useEffect(() => { const canvas = ref.current!; const c = canvas.getContext("2d")!; c.fillStyle = "#fff"; c.fillRect(0, 0, canvas.width, canvas.height); }, []);
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
      <button className="primary compact" onClick={() => onSubmit(ref.current!.toDataURL("image/png"))}>그림 제출 →</button>
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
  const [connectionText, setConnectionText] = useState("연결 중...");
  const [playerStatuses, setPlayerStatuses] = useState<Record<string, PlayerStatus>>({});
  const [eliminatedIds, setEliminatedIds] = useState<string[]>([]);
  const [roundEliminatedId, setRoundEliminatedId] = useState<string | null>(null);
  const [players, setPlayers] = useState(2);
  const [turn, setTurn] = useState(0);
  const [drawings, setDrawings] = useState<Drawing[]>([]);
  const [word, setWord] = useState(WORDS[0]);
  const [aiStatus, setAiStatus] = useState("");
  const [selected, setSelected] = useState("");
  const [copied, setCopied] = useState(false);
  const p2pRoomRef = useRef<ReturnType<typeof joinRoom> | null>(null);
  const profileRef = useRef(profile);
  const wordRef = useRef(word);
  const profilesRef = useRef<Record<string, OnlineProfile>>({});
  const eliminatedRef = useRef<string[]>([]);
  const submittedRef = useRef<Record<string, Drawing>>({});
  const votesRef = useRef<Record<string, string>>({});
  const sendProfileRef = useRef<((data: OnlineProfile, options?: { target?: string }) => Promise<void>) | null>(null);
  const sendControlRef = useRef<((data: ControlMessage, options?: { target?: string }) => Promise<void>) | null>(null);
  const sendDrawingRef = useRef<((data: Drawing, options?: { target?: string }) => Promise<void>) | null>(null);
  const sendStatusRef = useRef<((data: { id: string; status: PlayerStatus }, options?: { target?: string }) => Promise<void>) | null>(null);
  const sendVoteRef = useRef<((data: { id: string; drawingId: string }, options?: { target?: string }) => Promise<void>) | null>(null);
  useEffect(() => { profileRef.current = profile; }, [profile]);
  useEffect(() => { wordRef.current = word; }, [word]);
  useEffect(() => { profilesRef.current = onlineProfiles; }, [onlineProfiles]);
  useEffect(() => { eliminatedRef.current = eliminatedIds; }, [eliminatedIds]);
  useEffect(() => () => { void p2pRoomRef.current?.leave(); }, []);
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
  const saveProfile = () => {
    const clean = { ...profile, name: profile.name.trim().slice(0, 12) };
    if (!clean.name) return;
    window.localStorage.setItem("mimic-profile", JSON.stringify(clean));
    setProfile(clean); profileRef.current = clean;
    const invitedRoom = new URLSearchParams(window.location.search).get("room");
    if (invitedRoom) connectOnline(false, invitedRoom);
    else setScreen("home");
  };
  const finishOnlineRound = useCallback(() => {
    const humanDrawings = Object.values(submittedRef.current);
    const activeCount = Object.keys(profilesRef.current).filter(id => !eliminatedRef.current.includes(id)).length;
    if (humanDrawings.length < activeCount) return;
    const aiDrawing: Drawing = { id: `ai-${Date.now()}`, author: "MIMIC BOT", image: pseudoAiSketch(wordRef.current), isAI: true };
    const complete = [...humanDrawings, aiDrawing];
    setDrawings(complete);
    setAiStatus("모든 그림이 도착했습니다!");
    sendControlRef.current?.({ type: "gallery", drawings: complete });
    window.setTimeout(() => setScreen("vote"), 450);
  }, []);
  const finishOnlineVote = useCallback(() => {
    if (Object.keys(votesRef.current).length < Object.keys(profilesRef.current).length) return;
    const counts: Record<string, number> = {};
    Object.values(votesRef.current).forEach(id => { counts[id] = (counts[id] || 0) + 1; });
    const winner = Object.entries(counts).sort((a, b) => b[1] - a[1])[0]?.[0];
    const eliminatedId = winner?.startsWith("human-") ? winner.slice(6) : null;
    if (eliminatedId && !eliminatedRef.current.includes(eliminatedId)) {
      eliminatedRef.current = [...eliminatedRef.current, eliminatedId];
      setEliminatedIds(eliminatedRef.current);
    }
    setRoundEliminatedId(eliminatedId);
    sendControlRef.current?.({ type: "result", eliminatedId });
    setScreen("result");
  }, []);
  const connectOnline = (host: boolean, requestedCode?: string) => {
    p2pRoomRef.current?.leave();
    const code = (requestedCode || randomCode()).trim().toUpperCase();
    if (code.length < 4) return;
    setRoomCode(code); setIsOnline(true); setIsHost(host); setConnectionText("친구를 기다리는 중...");
    const mine: OnlineProfile = { ...profileRef.current, id: selfId, host };
    const initial = { [selfId]: mine };
    setOnlineProfiles(initial); profilesRef.current = initial;
    const p2pRoom = joinRoom({ appId: "mimic-ai-game-2026-v1" }, code);
    p2pRoomRef.current = p2pRoom;
    const profileAction = p2pRoom.makeAction<OnlineProfile>("profile");
    const controlAction = p2pRoom.makeAction<ControlMessage>("control");
    const drawingAction = p2pRoom.makeAction<Drawing>("drawing");
    const statusAction = p2pRoom.makeAction<{ id: string; status: PlayerStatus }>("status");
    const voteAction = p2pRoom.makeAction<{ id: string; drawingId: string }>("vote");
    sendProfileRef.current = profileAction.send;
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
    controlAction.onMessage = data => {
      if (data.type === "start") {
        eliminatedRef.current = data.eliminatedIds; setEliminatedIds(data.eliminatedIds);
        const statuses = Object.fromEntries(Object.keys(profilesRef.current).map(id => [id, data.eliminatedIds.includes(id) ? "eliminated" : "drawing"])) as Record<string, PlayerStatus>;
        setPlayerStatuses(statuses); votesRef.current = {}; setRoundEliminatedId(null);
        wordRef.current = data.word; setWord(data.word); setDrawings([]); setSelected(""); submittedRef.current = {}; setScreen("draw");
      } else if (data.type === "gallery") {
        setDrawings(data.drawings); setAiStatus("모든 그림이 도착했습니다!"); setScreen("vote");
      } else {
        if (data.eliminatedId && !eliminatedRef.current.includes(data.eliminatedId)) {
          eliminatedRef.current = [...eliminatedRef.current, data.eliminatedId];
          setEliminatedIds(eliminatedRef.current);
        }
        setRoundEliminatedId(data.eliminatedId); setScreen("result");
      }
    };
    drawingAction.onMessage = (data, context) => {
      if (!host) return;
      submittedRef.current[context.peerId] = data;
      finishOnlineRound();
    };
    statusAction.onMessage = data => setPlayerStatuses(old => ({ ...old, [data.id]: data.status }));
    voteAction.onMessage = data => {
      if (!host) return;
      votesRef.current[data.id] = data.drawingId;
      finishOnlineVote();
    };
    p2pRoom.onPeerJoin = peerId => {
      profileAction.send(mine, { target: peerId });
      setConnectionText("실시간 연결됨");
    };
    p2pRoom.onPeerLeave = peerId => {
      setOnlineProfiles(old => {
        const next = { ...old }; delete next[peerId]; profilesRef.current = next; return next;
      });
    };
    setScreen("lobby");
  };
  const startOnlineGame = () => {
    if (!isHost || Object.keys(onlineProfiles).length < 2) return;
    const nextWord = WORDS[Math.floor(Math.random() * WORDS.length)];
    const statuses = Object.fromEntries(Object.keys(onlineProfiles).map(id => [id, eliminatedRef.current.includes(id) ? "eliminated" : "drawing"])) as Record<string, PlayerStatus>;
    setPlayerStatuses(statuses); votesRef.current = {}; setRoundEliminatedId(null);
    wordRef.current = nextWord; setWord(nextWord); setDrawings([]); setSelected(""); submittedRef.current = {}; setScreen("draw");
    sendControlRef.current?.({ type: "start", word: nextWord, eliminatedIds: eliminatedRef.current });
  };
  const leaveOnline = () => {
    void p2pRoomRef.current?.leave();
    p2pRoomRef.current = null; setIsOnline(false); setIsHost(false); setOnlineProfiles({});
    window.history.replaceState({}, "", window.location.pathname);
    setScreen("home");
  };
  const submitOnlineVote = () => {
    if (!selected) return;
    votesRef.current[selfId] = selected;
    setAiStatus("다른 플레이어의 투표를 기다리는 중...");
    setScreen("ai");
    if (isHost) finishOnlineVote();
    else sendVoteRef.current?.({ id: selfId, drawingId: selected });
  };
  const startGame = () => { setWord(WORDS[Math.floor(Math.random() * WORDS.length)]); setDrawings([]); setTurn(0); setSelected(""); setScreen("draw"); };
  const submitHuman = (image: string) => {
    if (isOnline) {
      const mine: Drawing = { id: `human-${selfId}`, author: profile.name, image, isAI: false };
      setPlayerStatuses(old => ({ ...old, [selfId]: "done" }));
      sendStatusRef.current?.({ id: selfId, status: "done" });
      if (isHost) {
        submittedRef.current[selfId] = mine;
        setDrawings(Object.values(submittedRef.current));
        setScreen("ai");
        finishOnlineRound();
      } else {
        sendDrawingRef.current?.(mine);
        setScreen("ai");
        setAiStatus("다른 플레이어의 그림을 기다리는 중...");
      }
      return;
    }
    setDrawings(old => [...old, { id: `human-${turn}`, author: `플레이어 ${turn + 1}`, image, isAI: false }]);
    if (turn + 1 < players) setTurn(turn + 1); else setScreen("ai");
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
        <div className="eyebrow"><span>00</span> CREATE YOUR HUMAN</div>
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
      <div className="eyebrow"><span>01</span> DRAW LIKE A MACHINE</div>
      <h1>사람인 걸<br /><em>들키지 마.</em></h1>
      <p className="hero-copy"><strong>{profile.name}</strong>님은 사람입니다. 하지만 오늘만큼은 AI처럼 그리세요.<br />서로의 그림 사이에 숨은 진짜 AI를 찾아내는 드로잉 블러핑 게임.</p>
      <div className="hero-actions"><button className="primary" onClick={() => connectOnline(true)}>온라인 방 만들기 <span>↗</span></button><button className="secondary" onClick={() => { setIsOnline(false); setPlayers(2); startGame(); }}>한 기기 데모</button></div>
      <div className="join-room"><span>친구 방에 참여</span><div><input value={joinCode} maxLength={6} placeholder="초대 코드" onChange={e => setJoinCode(e.target.value.toUpperCase())} onKeyDown={e => { if (e.key === "Enter") connectOnline(false, joinCode); }} /><button onClick={() => connectOnline(false, joinCode)} disabled={joinCode.trim().length < 4}>입장 →</button></div></div>
      <div className="how-grid"><article><b>01</b><strong>같은 제시어</strong><p>모두에게 하나의 기묘한 제시어가 공개됩니다.</p></article><article><b>02</b><strong>사람처럼? AI처럼!</strong><p>색과 굵기만으로 AI 같은 그림을 완성하세요.</p></article><article><b>03</b><strong>속이고 찾아내기</strong><p>진짜 AI 그림에 투표하고 정체를 공개합니다.</p></article></div>
      <div className="hero-orbit" aria-hidden="true"><span>HUMAN?</span><span>AI?</span><i /></div>
    </section>}
    {screen === "lobby" && <section className="panel lobby">
      <div className="section-top"><span>ROOM / {roomCode}</span><span className="status-pill">{connectionText}</span></div>
      <div className="lobby-title"><div><div className="eyebrow"><span>02</span> ASSEMBLE HUMANS</div><h2>들키지 않을<br />사람을 모으세요.</h2></div><div className="room-card"><span>초대 코드</span><strong>{roomCode}</strong><button onClick={() => { navigator.clipboard?.writeText(`${location.origin}${location.pathname}?room=${roomCode}`); setCopied(true); }}>{copied ? "초대 링크 복사 완료 ✓" : "초대 링크 복사"}</button></div></div>
      <div className="players">{Object.values(onlineProfiles).map((item, index) => <div className="player-card" key={item.id}><span className={`mini-avatar ${item.shape}`} style={{ background: item.color }}>{item.face}</span><div><strong>{item.name}</strong><small>{item.host ? "방장" : "게스트"} · 실시간 접속</small></div><i>READY</i></div>)}{Object.keys(onlineProfiles).length < 2 && <div className="add-player">초대 링크를 친구에게 보내세요</div>}</div>
      <div className="lobby-footer"><p>{Object.keys(onlineProfiles).length}명 접속 · 최소 2명 · 최대 4명</p>{isHost ? <button className="primary" disabled={Object.keys(onlineProfiles).length < 2} onClick={startOnlineGame}>게임 시작 →</button> : <span className="waiting-host">방장이 시작하기를 기다리는 중...</span>}</div>
    </section>}
    {screen === "draw" && <section className="game-screen">
      <div className="game-top"><div><span className="round">ROUND 01</span><span className="turn">{isOnline ? `${profile.name} 그리는 중` : `플레이어 ${turn + 1} 차례`}</span></div><div className="prompt"><small>오늘의 제시어</small><strong>{word}</strong></div><div className="timer"><small>TIME LEFT</small><strong>∞</strong></div></div>
      {isOnline && <div className="drawing-statuses">{Object.values(onlineProfiles).map(item => <div key={item.id} className={playerStatuses[item.id] || "drawing"}><span className={`mini-avatar ${item.shape}`} style={{ background: item.color }}>{item.face}</span><strong>{item.name}</strong><i>{playerStatuses[item.id] === "done" ? "제출 완료" : playerStatuses[item.id] === "eliminated" ? "탈락 · 투표만 가능" : "그리는 중..."}</i></div>)}</div>}
      {isOnline && eliminatedIds.includes(selfId)
        ? <div className="eliminated-wait"><span>OUT</span><h2>이번 라운드는<br />그림을 그릴 수 없어요.</h2><p>다른 사람의 그림이 완성되면 투표에 참여할 수 있습니다.</p></div>
        : <><DrawingBoard key={isOnline ? word : turn} player={isOnline ? profile.name : `플레이어 ${turn + 1}`} onSubmit={submitHuman} /><p className="pass-note">{isOnline ? "친구들도 각자의 화면에서 동시에 그림을 그리고 있습니다." : "그림 제출 후 다음 플레이어에게 화면을 넘겨주세요. 그림은 투표 전까지 비공개입니다."}</p></>}
    </section>}
    {screen === "ai" && <section className="loading-screen"><div className="scanner"><div className="bot-face">⌁</div><i /></div><div className="eyebrow"><span>03</span> MACHINE AT WORK</div><h2>{aiStatus || "AI가 그림을 그리고 있어요..."}</h2><p>같은 흰 배경, 같은 펜 규칙으로 한 장을 추가합니다.</p></section>}
    {screen === "vote" && <section className="panel vote">
      <div className="section-top"><span>ROUND 01 / VOTE</span><span className="status-pill orange">정체 비공개</span></div>
      <div className="vote-heading"><div><div className="eyebrow"><span>04</span> ELIMINATE A PLAYER</div><h2>사람을<br />죽여주세요.</h2></div><p>게임 안에서 탈락시킬 그림을 한 장 선택하세요.<br />가장 많은 표를 받은 사람은 다음 라운드부터 투표만 할 수 있습니다.</p></div>
      <div className="gallery">{gallery.map((item, index) => <button key={item.id} className={`art-card ${selected === item.id ? "selected" : ""}`} onClick={() => setSelected(item.id)}><span>DRAWING / 0{index + 1}</span><img src={item.image} alt={`후보 그림 ${index + 1}`} /><b>{selected === item.id ? "선택됨 ✓" : "이 그림에 투표"}</b></button>)}</div>
      <div className="vote-submit"><span>{selected ? "선택 완료. 이 그림의 주인에게 투표합니다." : "탈락시킬 사람의 그림을 선택하세요."}</span><button className="primary" disabled={!selected} onClick={isOnline ? submitOnlineVote : () => setScreen("result")}>투표 완료 →</button></div>
    </section>}
    {screen === "result" && picked && <section className="result-screen">
      <div className="result-copy"><div className="eyebrow"><span>05</span> VOTE RESULT</div><h2>{isOnline ? (roundEliminatedId ? <>{onlineProfiles[roundEliminatedId]?.name || "한 사람"}<br /><em>탈락입니다.</em></> : <>이번에는<br /><em>사람이 살았습니다.</em></>) : (fooled ? <>완벽하게<br /><em>속았습니다.</em></> : <>정확하게<br /><em>찾았습니다.</em></>)}</h2><p>{isOnline ? (roundEliminatedId ? "가장 많은 표를 받았습니다. 다음 라운드부터 그림은 그릴 수 없지만 투표에는 계속 참여합니다." : "AI 그림이 가장 많은 표를 받아 사람 플레이어는 탈락하지 않았습니다.") : (fooled ? `${picked.author}의 그림은 사람이 그렸습니다. AI처럼 보이는 데 성공했네요.` : "선택한 그림은 MIMIC BOT이 그린 진짜 AI 그림입니다.")}</p>{!isOnline && <div className="score-row"><div><small>탐정 점수</small><strong>{fooled ? "+0" : "+1"}</strong></div><div><small>인간 위장 보너스</small><strong>{fooled ? "+2" : "+0"}</strong></div></div>}{!isOnline || isHost ? <button className="primary" onClick={isOnline ? startOnlineGame : startGame}>다음 라운드 →</button> : <span className="waiting-host">방장이 다음 라운드를 준비 중...</span>}<button className="text-button" onClick={isOnline ? leaveOnline : () => setScreen("home")}>게임 종료</button></div>
      <div className="reveal-stack">{drawings.map(item => <article key={item.id} className={item.id === selected ? "picked" : ""}><img src={item.image} alt={`${item.author}의 그림`} /><div><span>{item.isAI ? "AI" : "HUMAN"}</span><strong>{item.author}</strong>{item.id === selected && <b>YOUR PICK</b>}</div></article>)}</div>
    </section>}
    <footer><span>MIMIC.AI / 2026</span><span>HUMANS PRETENDING TO BE MACHINES</span></footer>
  </main>;
}
