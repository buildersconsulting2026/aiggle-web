"""
AIGGLE Chat — FastAPI Backend
멀티 채팅방 + 스레드 + WebSocket 실시간 메시징
"""
from fastapi import FastAPI, WebSocket, WebSocketDisconnect, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from fastapi.responses import StreamingResponse
from sqlalchemy import create_engine, Column, Integer, String, Text, DateTime, ForeignKey, JSON
from sqlalchemy.orm import declarative_base, sessionmaker, relationship
from pydantic import BaseModel
from typing import Optional
from datetime import datetime
import json
import os
import re
import httpx
import urllib.parse

# ─── Database ───
DB_PATH = os.path.join(os.path.dirname(__file__), "..", "data", "aiggle.db")
os.makedirs(os.path.dirname(DB_PATH), exist_ok=True)
engine = create_engine(f"sqlite:///{DB_PATH}", connect_args={"check_same_thread": False})
SessionLocal = sessionmaker(bind=engine)
Base = declarative_base()


# ─── Models ───
class User(Base):
    __tablename__ = "users"
    id = Column(Integer, primary_key=True)
    name = Column(String(50), unique=True, nullable=False)
    role = Column(String(20), default="member")
    avatar_color = Column(String(20), default="#58a6ff")
    created_at = Column(DateTime, default=datetime.utcnow)


class Room(Base):
    __tablename__ = "rooms"
    id = Column(Integer, primary_key=True)
    name = Column(String(100), nullable=False)
    type = Column(String(20), default="channel")
    discord_channel_id = Column(String(50), nullable=True)
    created_at = Column(DateTime, default=datetime.utcnow)


class Message(Base):
    __tablename__ = "messages"
    id = Column(Integer, primary_key=True)
    room_id = Column(Integer, ForeignKey("rooms.id"), nullable=False)
    user_id = Column(Integer, ForeignKey("users.id"), nullable=False)
    content = Column(Text, nullable=False)
    parent_id = Column(Integer, ForeignKey("messages.id"), nullable=True)
    mentions = Column(JSON, default=list)
    created_at = Column(DateTime, default=datetime.utcnow)
    discord_message_id = Column(String(50), nullable=True)  # Discord 메시지 ID (되먹임 방지)
    origin = Column(String(10), default="web")  # "web" | "discord"
    user = relationship("User")


Base.metadata.create_all(bind=engine)


# ─── Pydantic Schemas ───
class UserCreate(BaseModel):
    name: str
    role: str = "member"


class UserOut(BaseModel):
    id: int
    name: str
    role: str
    avatar_color: str


class RoomOut(BaseModel):
    id: int
    name: str
    type: str
    discord_channel_id: Optional[str] = None


# ─── App ───
app = FastAPI(title="AIGGLE Chat")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)


# ─── WebSocket Manager ───
class ConnectionManager:
    def __init__(self):
        self.active: dict[int, set[WebSocket]] = {}

    async def connect(self, ws: WebSocket, room_id: int):
        await ws.accept()
        if room_id not in self.active:
            self.active[room_id] = set()
        self.active[room_id].add(ws)

    def disconnect(self, ws: WebSocket, room_id: int):
        if room_id in self.active:
            self.active[room_id].discard(ws)

    async def broadcast(self, room_id: int, data: dict):
        if room_id in self.active:
            dead = []
            for ws in self.active[room_id]:
                try:
                    await ws.send_json(data)
                except Exception:
                    dead.append(ws)
            for ws in dead:
                self.active[room_id].discard(ws)


manager = ConnectionManager()

AVATAR_COLORS = {
    "담담": "#58a6ff",
    "삼쬐": "#bc8cff",
    "짱구": "#f778ba",
    "프렌즈": "#3fb950",
    "GLM": "#6e40c9",
}


def msg_to_dict(db, msg: Message) -> dict:
    reply_count = db.query(Message).filter(Message.parent_id == msg.id).count()
    content = msg.content
    # (구버전 호환) [discord:ID] 접두사가 남아있다면 제거 — 마이그레이션 후에는 미사용
    if content.startswith("[discord:"):
        bracket_end = content.find("] ")
        if bracket_end > 0:
            content = content[bracket_end + 2:]
    return {
        "id": msg.id,
        "room_id": msg.room_id,
        "user_id": msg.user_id,
        "user_name": msg.user.name if msg.user else "Unknown",
        "user_role": msg.user.role if msg.user else "member",
        "user_color": msg.user.avatar_color if msg.user else "#58a6ff",
        "content": content,
        "parent_id": msg.parent_id,
        "mentions": msg.mentions or [],
        "created_at": msg.created_at.isoformat() if msg.created_at else None,
        "reply_count": reply_count,
        "origin": msg.origin or "web",
    }


# ─── REST API ───
@app.post("/api/users", response_model=UserOut)
def create_user(user: UserCreate):
    db = SessionLocal()
    existing = db.query(User).filter(User.name == user.name).first()
    if existing:
        result = UserOut(id=existing.id, name=existing.name, role=existing.role, avatar_color=existing.avatar_color)
        db.close()
        return result
    color = AVATAR_COLORS.get(user.name, "#58a6ff")
    db_user = User(name=user.name, role=user.role, avatar_color=color)
    db.add(db_user)
    db.commit()
    db.refresh(db_user)
    result = UserOut(id=db_user.id, name=db_user.name, role=db_user.role, avatar_color=db_user.avatar_color)
    db.close()
    return result


@app.get("/api/users", response_model=list[UserOut])
def list_users():
    db = SessionLocal()
    users = db.query(User).all()
    result = [UserOut(id=u.id, name=u.name, role=u.role, avatar_color=u.avatar_color) for u in users]
    db.close()
    return result


@app.get("/api/rooms", response_model=list[RoomOut])
def list_rooms():
    db = SessionLocal()
    rooms = db.query(Room).order_by(Room.id).all()
    result = [RoomOut(id=r.id, name=r.name, type=r.type, discord_channel_id=r.discord_channel_id) for r in rooms]
    db.close()
    return result


@app.post("/api/rooms", response_model=RoomOut)
def create_room(name: str, room_type: str = "channel", discord_channel_id: Optional[str] = None):
    db = SessionLocal()
    room = Room(name=name, type=room_type, discord_channel_id=discord_channel_id)
    db.add(room)
    db.commit()
    db.refresh(room)
    result = RoomOut(id=room.id, name=room.name, type=room.type, discord_channel_id=room.discord_channel_id)
    db.close()
    return result


@app.get("/api/rooms/{room_id}/messages")
def get_messages(room_id: int, limit: int = 100):
    db = SessionLocal()
    messages = (
        db.query(Message)
        .filter(Message.room_id == room_id, Message.parent_id.is_(None))
        .order_by(Message.created_at)
        .limit(limit)
        .all()
    )
    result = [msg_to_dict(db, m) for m in messages]
    db.close()
    return result


@app.get("/api/messages/{message_id}/threads")
def get_threads(message_id: int):
    db = SessionLocal()
    threads = (
        db.query(Message)
        .filter(Message.parent_id == message_id)
        .order_by(Message.created_at)
        .all()
    )
    result = [msg_to_dict(db, m) for m in threads]
    db.close()
    return result


# ─── WebSocket ───
@app.websocket("/ws/{room_id}")
async def ws_endpoint(ws: WebSocket, room_id: int):
    await manager.connect(ws, room_id)
    try:
        while True:
            raw = await ws.receive_text()
            data = json.loads(raw)

            db = SessionLocal()
            msg = Message(
                room_id=room_id,
                user_id=data["user_id"],
                content=data["content"],
                parent_id=data.get("parent_id"),
                mentions=data.get("mentions", []),
                origin="web",
            )
            db.add(msg)
            db.commit()
            db.refresh(msg)
            resp = msg_to_dict(db, msg)

            # 웹에서 온 메시지를 Discord로 포워드
            room = db.query(Room).filter(Room.id == room_id).first()
            sender = db.query(User).filter(User.id == data["user_id"]).first()
            if room and sender and room.discord_channel_id:
                # 쓰레드 답글이면 부모 메시지의 discord_message_id를 찾아서 답글로 전송
                reply_to_discord_id = None
                parent_db_id = data.get("parent_id")
                if parent_db_id:
                    parent_msg = db.query(Message).filter(Message.id == parent_db_id).first()
                    if parent_msg and parent_msg.discord_message_id:
                        reply_to_discord_id = parent_msg.discord_message_id

                discord_msg_id = await send_to_discord(
                    room, sender.name, data["content"], data.get("mentions", []),
                    reply_to_discord_id=reply_to_discord_id,
                )
                if discord_msg_id:
                    msg.discord_message_id = discord_msg_id
                    db.commit()
                    resp["discord_message_id"] = discord_msg_id

            db.close()
            await manager.broadcast(room_id, resp)

    except WebSocketDisconnect:
        manager.disconnect(ws, room_id)
    except Exception as e:
        print(f"WS error: {e}")
        manager.disconnect(ws, room_id)


# ─── Discord Sync ───
DISCORD_BOT_TOKEN = os.environ.get("DISCORD_BOT_TOKEN", "")
# .env에서 토큰 로드 (Hermes .env 우선)
if not DISCORD_BOT_TOKEN:
    hermes_env = os.path.expanduser("~/.hermes/.env")
    if os.path.exists(hermes_env):
        for line in open(hermes_env):
            line = line.strip()
            if line.startswith("DISCORD_BOT_TOKEN="):
                DISCORD_BOT_TOKEN = line.split("=", 1)[1]
                break

# Discord username → AIGGLE 팀원 매핑
DISCORD_NAME_MAP = {
    "speculate_2": "삼쬐",
    "damdam52": "담담",
    "soraisgood.": "짱구",
    "songmu_50580": "프렌즈",
}

# AIGGLE 표시명 → Discord user ID (멘션 핑 변환용)
AIGGLE_NAME_TO_DISCORD_ID = {
    "GLM": "1521009886564188293",
    "삼쬐": "233969142456123402",
    "담담": "1521022912578981920",
    "짱구": "866467280481419274",
}

DISCORD_ID_MAP = {
    "1521021005206655047": 1,   # 일반
    "1523323184982786269": 2,   # 공유
    "1523214326197125251": 3,   # 개발
    "1526550777919963146": 4,   # PM 브리핑
}


@app.post("/api/discord/sync")
def sync_discord(room_id: int = 0):
    """Discord 채널에서 실제 메시지를 가져와 DB에 동기화"""
    if not DISCORD_BOT_TOKEN:
        return {"error": "DISCORD_BOT_TOKEN not configured"}

    db = SessionLocal()
    synced = 0
    errors = []

    rooms = db.query(Room).filter(Room.discord_channel_id.isnot(None)).all()
    if room_id:
        rooms = [r for r in rooms if r.id == room_id]

    headers = {"Authorization": f"Bot {DISCORD_BOT_TOKEN}"}

    for room in rooms:
        try:
            url = f"https://discord.com/api/v10/channels/{room.discord_channel_id}/messages?limit=50"
            resp = httpx.get(url, headers=headers, timeout=15)
            if resp.status_code != 200:
                errors.append(f"Room {room.name}: HTTP {resp.status_code}")
                continue

            msgs = resp.json()
            for m in reversed(msgs):  # 오래된 순으로 저장
                discord_msg_id = m.get("id", "")

                # 중복 체크: discord_message_id 컬럼으로 (되먹임 방지 핵심)
                existing = db.query(Message).filter(
                    Message.discord_message_id == discord_msg_id
                ).first()
                if existing:
                    continue

                # 작성자 매핑
                author = m.get("author", {})

                # 봇이 보낸 메시지 중 웹에서 포워드된 것 ([이름] 형식)은 건너뛰기
                # — 되먹임 방지: 웹→Discord로 갔던 메시지가 다시 sync되어 웹에 중복 노출되는 것 차단
                if author.get("bot"):
                    content_preview = m.get("content", "")
                    if content_preview.startswith("[") and "] " in content_preview:
                        continue  # 웹에서 포워드된 봇 메시지 — skip

                discord_global_name = author.get("global_name", "")
                discord_username_raw = author.get("username", "")

                # 이름 매핑: username 우선, 그 다음 global_name
                aiggle_name = DISCORD_NAME_MAP.get(discord_username_raw) or \
                              DISCORD_NAME_MAP.get(discord_global_name) or \
                              discord_global_name or discord_username_raw

                # AIGGLE 사용자 찾기 또는 생성
                user = db.query(User).filter(User.name == aiggle_name).first()
                if not user:
                    if author.get("bot"):
                        user = db.query(User).filter(User.name == "GLM").first()
                    if not user:
                        user = User(name=aiggle_name, role="member", avatar_color="#8b949e")
                        db.add(user)
                        db.commit()
                        db.refresh(user)

                content = m.get("content", "").strip()
                if not content:
                    continue

                # 멘션 파싱
                mentions = []
                for mention in m.get("mentions", []):
                    mentioned_name = mention.get("global_name") or mention.get("username", "")
                    if mentioned_name:
                        mentions.append(mentioned_name)

                # Discord 답글 → 웹 parent_id 매핑
                # message_reference.message_id → DB에서 parent 찾기
                parent_db_id = None
                msg_ref = m.get("message_reference")
                if msg_ref and msg_ref.get("message_id"):
                    ref_discord_id = msg_ref["message_id"]
                    parent_msg = db.query(Message).filter(
                        Message.discord_message_id == ref_discord_id
                    ).first()
                    if parent_msg:
                        parent_db_id = parent_msg.id

                msg = Message(
                    room_id=room.id,
                    user_id=user.id,
                    content=content,
                    parent_id=parent_db_id,
                    mentions=mentions,
                    discord_message_id=discord_msg_id,
                    origin="discord",
                    created_at=datetime.fromisoformat(
                        m["timestamp"].replace("Z", "+00:00")
                    ).replace(tzinfo=None) if m.get("timestamp") else datetime.utcnow(),
                )
                db.add(msg)
                synced += 1

            db.commit()
        except Exception as e:
            errors.append(f"Room {room.name}: {str(e)}")

    db.close()
    return {"synced": synced, "errors": errors}


@app.get("/api/discord/status")
def discord_status():
    """Discord 봇 연결 상태 확인"""
    if not DISCORD_BOT_TOKEN:
        return {"connected": False, "reason": "no token"}

    try:
        resp = httpx.get(
            "https://discord.com/api/v10/users/@me",
            headers={"Authorization": f"Bot {DISCORD_BOT_TOKEN}"},
            timeout=10,
        )
        if resp.status_code == 200:
            data = resp.json()
            return {
                "connected": True,
                "bot_name": data.get("username", "?"),
                "bot_id": data.get("id", "?"),
            }
    except Exception:
        pass
    return {"connected": False, "reason": "api error"}


# ─── Discord 전송 (웹 → Discord) ───
def convert_mentions_to_discord(content: str) -> str:
    """웹의 @멘션을 Discord <@ID> 형식으로 변환.
    @GLM, @삼쬐, @담담 등 → <@디스코드ID>"""
    for name, discord_uid in AIGGLE_NAME_TO_DISCORD_ID.items():
        content = re.sub(rf"@{re.escape(name)}", f"<@{discord_uid}>", content)
    return content


async def send_to_discord(
    room: Room,
    sender_name: str,
    content: str,
    mentions: list[str],
    reply_to_discord_id: Optional[str] = None,
) -> Optional[str]:
    """웹에서 작성된 메시지를 Discord 채널로 전송.
    reply_to_discord_id가 있으면 해당 Discord 메시지에 답글로 전송.
    성공 시 Discord message_id 반환, 실패 시 None."""
    if not DISCORD_BOT_TOKEN or not room.discord_channel_id:
        return None

    # @멘션을 실제 Discord 핑(<@ID>)으로 변환
    discord_content = convert_mentions_to_discord(content)
    # Discord 포맷: "[삼쬐] 안녕하세요" 형태
    discord_content = f"[{sender_name}] {discord_content}"
    if len(discord_content) > 2000:
        discord_content = discord_content[:1997] + "..."

    headers = {
        "Authorization": f"Bot {DISCORD_BOT_TOKEN}",
        "Content-Type": "application/json",
    }
    # 답글이면 message_reference 설정 + 핑 허용, 일반이면 그냥 전송
    payload: dict = {
        "content": discord_content,
        "allowed_mentions": {"parse": ["users"]},
    }
    if reply_to_discord_id:
        payload["message_reference"] = {
            "message_id": reply_to_discord_id,
            "channel_id": room.discord_channel_id,
        }

    try:
        async with httpx.AsyncClient(timeout=10) as client:
            resp = await client.post(
                f"https://discord.com/api/v10/channels/{room.discord_channel_id}/messages",
                headers=headers,
                json=payload,
            )
            if resp.status_code in (200, 201):
                return resp.json().get("id")
            else:
                print(f"Discord send failed: {resp.status_code} {resp.text[:200]}")
                return None
    except Exception as e:
        print(f"Discord send error: {e}")
        return None


# ─── whisper-serve 프록시 (회의록/음성요약) ───
WHISPER_SERVE_URL = os.environ.get("WHISPER_SERVE_URL", "http://localhost:3000")
PROXY_PREFIX = "/meetings"


def _rewrite_html(content: bytes, base: str) -> bytes:
    """whisper-serve HTML의 절대 경로를 /meetings 기반으로 재작성 + 내부 nav 숨김"""
    text = content.decode("utf-8", errors="replace")

    # CSS/JS src, href 재작성: "/api/..." → "/meetings/api/..."
    text = re.sub(r'(href|src)="/', rf'\1="{base}/', text)

    # JavaScript fetch/XHR 재작성: fetch('/api/...') → fetch('/meetings/api/...')
    text = re.sub(r"fetch\(['\"]/", rf"fetch('{base}/", text)
    text = re.sub(r'fetch\("/', rf'fetch("{base}/', text)

    # window.location, window.open 등
    text = re.sub(r'window\.location\s*=\s*["\']/', rf'window.location="{base}/', text)

    # <a href="/"> 같은 루트 링크들
    text = re.sub(r'action="/', rf'action="{base}/', text)

    # 상대경로 fetch(./)나 fetch('api/')도 처리
    text = re.sub(r"fetch\(['\"]\.?/?api", rf"fetch('{base}/api", text)

    # 내부 nav 바 숨김 (사이드바 워크스페이스 탭과 중복)
    text = text.replace("</head>", "<style>.nav{display:none!important}</style>\n</head>")

    return text.encode("utf-8")


@app.api_route("/meetings/{path:path}", methods=["GET", "POST", "PUT", "DELETE"])
async def whisper_proxy(path: str, request: Request):
    """whisper-serve (포트 3000) 로 요청을 전달하는 리버스 프록시
    HTML 응답의 경로를 /meetings 기반으로 재작성하여 iframe에서도 정상 작동."""
    target_url = f"{WHISPER_SERVE_URL}/{path}"
    headers = dict(request.headers)
    headers.pop("host", None)

    body = await request.body()

    async with httpx.AsyncClient(timeout=300) as client:
        if request.method == "GET":
            resp = await client.get(target_url, headers=headers, params=request.query_params)
        elif request.method == "POST":
            resp = await client.post(target_url, headers=headers, params=request.query_params, content=body)
        elif request.method == "PUT":
            resp = await client.put(target_url, headers=headers, params=request.query_params, content=body)
        elif request.method == "DELETE":
            resp = await client.delete(target_url, headers=headers, params=request.query_params)

    content_type = resp.headers.get("content-type", "application/json")

    # HTML 응답인 경우 경로 재작성
    if "text/html" in content_type:
        rewritten = _rewrite_html(resp.content, PROXY_PREFIX)
        return StreamingResponse(
            iter([rewritten]),
            status_code=resp.status_code,
            media_type=content_type,
            headers={k: v for k, v in resp.headers.items() if k.lower() not in ("transfer-encoding", "content-encoding", "content-length")}
        )

    return StreamingResponse(
        iter([resp.content]),
        status_code=resp.status_code,
        media_type=content_type,
        headers={k: v for k, v in resp.headers.items() if k.lower() not in ("transfer-encoding", "content-encoding")}
    )


# ─── Static files (프론트엔드 빌드 결과 서빙) ───
frontend_dist = os.path.join(os.path.dirname(__file__), "..", "frontend", "dist")
if os.path.exists(frontend_dist):
    app.mount("/", StaticFiles(directory=frontend_dist, html=True), name="frontend")


if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8000)
