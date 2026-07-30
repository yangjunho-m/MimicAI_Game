"use client";

import { PointerEvent, useCallback, useEffect, useRef, useState } from "react";

type Screen = "profile" | "home" | "lobby" | "draw" | "ai" | "vote" | "result";
type Drawing = { id: string; author: string; image: string; isAI: boolean };
type Profile = { name: string; color: string; face: string; shape: string };
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
  const accent = COLORS[(seed % 4) + 1];
  line();

  if (word.includes("놀이공원")) {
    c.beginPath(); c.arc(455, 285, 175 + wobble(1), 0, Math.PI * 2); c.stroke();
    for (let i = 0; i < 8; i++) { const a = i * Math.PI / 4; c.beginPath(); c.moveTo(455, 285); c.lineTo(455 + Math.cos(a) * 175, 285 + Math.sin(a) * 175); c.stroke(); }
    line(accent, 12); c.beginPath(); c.moveTo(335, 520); c.lineTo(455, 285); c.lineTo(575, 520); c.stroke();
    line(); for (let i = 0; i < 6; i++) { c.beginPath(); c.moveTo(155 + i * 125, 80 + wobble(i, 18)); c.lineTo(145 + i * 125, 125 + wobble(i + 2, 14)); c.stroke(); }
  } else if (word.includes("선인장")) {
    line(accent, 16); c.beginPath(); c.moveTo(445, 500); c.bezierCurveTo(415, 390, 430, 230, 455, 125); c.stroke();
    c.beginPath(); c.moveTo(430, 330); c.bezierCurveTo(345, 350, 330, 285, 340, 235); c.moveTo(465, 275); c.bezierCurveTo(555, 295, 575, 230, 565, 180); c.stroke();
    line(); c.beginPath(); c.ellipse(455, 520, 150, 38, 0, 0, Math.PI * 2); c.stroke();
    for (let i = 0; i < 14; i++) { const x = 350 + (i * 47) % 220, y = 150 + (i * 71) % 300; c.beginPath(); c.moveTo(x, y); c.lineTo(x + wobble(i, 12), y - 13); c.stroke(); }
    dot(420, 205); dot(480, 205); c.beginPath(); c.arc(452, 235, 35, .1, Math.PI - .1); c.stroke();
  } else if (word.includes("붕어빵")) {
    line(accent, 13); c.beginPath(); c.ellipse(430, 340, 190 + wobble(2), 95, -.08, 0, Math.PI * 2); c.stroke();
    c.beginPath(); c.moveTo(590, 325); c.lineTo(715, 245); c.lineTo(690, 385); c.closePath(); c.stroke();
    line(); c.beginPath(); c.arc(680, 145, 75, .3, Math.PI * 1.7); c.stroke();
    c.beginPath(); c.moveTo(300, 295); c.quadraticCurveTo(430, 340, 300, 395); c.moveTo(370, 255); c.lineTo(420, 425); c.moveTo(455, 248); c.lineTo(490, 425); c.stroke();
    dot(280, 330, 9);
    for (let i = 0; i < 10; i++) dot(120 + ((i * 83) % 650), 80 + ((i * 47) % 130), 3 + (i % 3));
  } else {
    c.beginPath(); c.arc(440, 255, 120 + wobble(1), 0, Math.PI * 2); c.stroke();
    c.beginPath(); c.moveTo(350, 185); c.lineTo(390 + wobble(1), 95); c.lineTo(430, 165); c.moveTo(475, 165); c.lineTo(520 + wobble(2), 95); c.lineTo(545, 190); c.stroke();
    dot(400, 250); dot(480, 250); c.beginPath(); c.moveTo(430, 290); c.quadraticCurveTo(450, 315, 475, 290); c.stroke();
    line(accent, 13); c.beginPath(); c.ellipse(445, 440, 185, 75, 0, 0, Math.PI * 2); c.stroke();
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
  const [room] = useState(randomCode);
  const [players, setPlayers] = useState(2);
  const [turn, setTurn] = useState(0);
  const [drawings, setDrawings] = useState<Drawing[]>([]);
  const [word, setWord] = useState(WORDS[0]);
  const [aiStatus, setAiStatus] = useState("");
  const [selected, setSelected] = useState("");
  const [copied, setCopied] = useState(false);
  useEffect(() => {
    const saved = window.localStorage.getItem("mimic-profile");
    if (saved) {
      try { setProfile(JSON.parse(saved)); setScreen("home"); } catch { /* 새 프로필 생성 */ }
    }
  }, []);
  const saveProfile = () => {
    const clean = { ...profile, name: profile.name.trim().slice(0, 12) };
    if (!clean.name) return;
    window.localStorage.setItem("mimic-profile", JSON.stringify(clean));
    setProfile(clean);
    setScreen("home");
  };
  const startGame = () => { setWord(WORDS[Math.floor(Math.random() * WORDS.length)]); setDrawings([]); setTurn(0); setSelected(""); setScreen("draw"); };
  const submitHuman = (image: string) => {
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
  useEffect(() => { if (screen === "ai") generateAI(); }, [screen, generateAI]);
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
      <div className="hero-actions"><button className="primary" onClick={() => setScreen("lobby")}>새 게임 만들기 <span>↗</span></button><button className="secondary" onClick={() => { setPlayers(2); startGame(); }}>2인 빠른 데모</button></div>
      <div className="how-grid"><article><b>01</b><strong>같은 제시어</strong><p>모두에게 하나의 기묘한 제시어가 공개됩니다.</p></article><article><b>02</b><strong>사람처럼? AI처럼!</strong><p>색과 굵기만으로 AI 같은 그림을 완성하세요.</p></article><article><b>03</b><strong>속이고 찾아내기</strong><p>진짜 AI 그림에 투표하고 정체를 공개합니다.</p></article></div>
      <div className="hero-orbit" aria-hidden="true"><span>HUMAN?</span><span>AI?</span><i /></div>
    </section>}
    {screen === "lobby" && <section className="panel lobby">
      <div className="section-top"><span>ROOM / {room}</span><span className="status-pill">대기 중</span></div>
      <div className="lobby-title"><div><div className="eyebrow"><span>02</span> ASSEMBLE HUMANS</div><h2>들키지 않을<br />사람을 모으세요.</h2></div><div className="room-card"><span>초대 코드</span><strong>{room}</strong><button onClick={() => { navigator.clipboard?.writeText(room); setCopied(true); }}>{copied ? "복사 완료 ✓" : "코드 복사"}</button></div></div>
      <div className="players">{Array.from({ length: players }).map((_, index) => <div className="player-card" key={index}><span>P{index + 1}</span><div><strong>플레이어 {index + 1}</strong><small>{index === 0 ? "방장 · 준비 완료" : "게스트 · 준비 완료"}</small></div><i>READY</i></div>)}{players < 4 && <button className="add-player" onClick={() => setPlayers(players + 1)}>＋ 데모 플레이어 추가</button>}</div>
      <div className="lobby-footer"><p>최소 2명 · 최대 4명 · 총 1라운드</p><button className="primary" onClick={startGame}>게임 시작 →</button></div>
    </section>}
    {screen === "draw" && <section className="game-screen">
      <div className="game-top"><div><span className="round">ROUND 01</span><span className="turn">플레이어 {turn + 1} 차례</span></div><div className="prompt"><small>오늘의 제시어</small><strong>{word}</strong></div><div className="timer"><small>TIME LEFT</small><strong>∞</strong></div></div>
      <DrawingBoard key={turn} player={`플레이어 ${turn + 1}`} onSubmit={submitHuman} /><p className="pass-note">그림 제출 후 다음 플레이어에게 화면을 넘겨주세요. 그림은 투표 전까지 비공개입니다.</p>
    </section>}
    {screen === "ai" && <section className="loading-screen"><div className="scanner"><div className="bot-face">⌁</div><i /></div><div className="eyebrow"><span>03</span> MACHINE AT WORK</div><h2>{aiStatus || "AI가 그림을 그리고 있어요..."}</h2><p>같은 흰 배경, 같은 펜 규칙으로 한 장을 추가합니다.</p></section>}
    {screen === "vote" && <section className="panel vote">
      <div className="section-top"><span>ROUND 01 / VOTE</span><span className="status-pill orange">정체 비공개</span></div>
      <div className="vote-heading"><div><div className="eyebrow"><span>04</span> SPOT THE MACHINE</div><h2>AI가 그린<br />그림은 무엇일까요?</h2></div><p>그림을 자세히 보고 한 장을 선택하세요.<br />선의 망설임까지 연기했을지도 모릅니다.</p></div>
      <div className="gallery">{gallery.map((item, index) => <button key={item.id} className={`art-card ${selected === item.id ? "selected" : ""}`} onClick={() => setSelected(item.id)}><span>DRAWING / 0{index + 1}</span><img src={item.image} alt={`후보 그림 ${index + 1}`} /><b>{selected === item.id ? "선택됨 ✓" : "이 그림에 투표"}</b></button>)}</div>
      <div className="vote-submit"><span>{selected ? "선택 완료. 정체를 확인해 보세요." : "AI라고 생각하는 그림을 선택하세요."}</span><button className="primary" disabled={!selected} onClick={() => setScreen("result")}>정체 공개 →</button></div>
    </section>}
    {screen === "result" && picked && <section className="result-screen">
      <div className="result-copy"><div className="eyebrow"><span>05</span> IDENTITY REVEALED</div><h2>{fooled ? <>완벽하게<br /><em>속았습니다.</em></> : <>정확하게<br /><em>찾았습니다.</em></>}</h2><p>{fooled ? `${picked.author}의 그림은 사람이 그렸습니다. AI처럼 보이는 데 성공했네요.` : "선택한 그림은 MIMIC BOT이 그린 진짜 AI 그림입니다."}</p><div className="score-row"><div><small>탐정 점수</small><strong>{fooled ? "+0" : "+1"}</strong></div><div><small>인간 위장 보너스</small><strong>{fooled ? "+2" : "+0"}</strong></div></div><button className="primary" onClick={startGame}>다음 라운드 →</button><button className="text-button" onClick={() => setScreen("home")}>게임 종료</button></div>
      <div className="reveal-stack">{drawings.map(item => <article key={item.id} className={item.id === selected ? "picked" : ""}><img src={item.image} alt={`${item.author}의 그림`} /><div><span>{item.isAI ? "AI" : "HUMAN"}</span><strong>{item.author}</strong>{item.id === selected && <b>YOUR PICK</b>}</div></article>)}</div>
    </section>}
    <footer><span>MIMIC.AI / 2026</span><span>HUMANS PRETENDING TO BE MACHINES</span></footer>
  </main>;
}
