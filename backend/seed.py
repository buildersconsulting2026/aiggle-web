"""목업 데이터 시딩 — 실제 디스코드 채널 구조 반영"""
from main import Base, engine, SessionLocal, User, Room, Message
from datetime import datetime, timedelta

Base.metadata.drop_all(bind=engine)
Base.metadata.create_all(bind=engine)

db = SessionLocal()

# ─── 사용자 (실제 팀원) ───
users = [
    ("담담", "leader", "#58a6ff"),
    ("삼쬐", "designer", "#bc8cff"),
    ("짱구", "marketer", "#f778ba"),
    ("프렌즈", "content", "#3fb950"),
    ("GLM", "ai", "#6e40c9"),
]
for name, role, color in users:
    db.add(User(name=name, role=role, avatar_color=color))

# ─── 채팅방 (실제 디스코드 채널 ID 매핑) ───
rooms = [
    ("일반",     "channel", "1521021005206655047"),
    ("공유",     "channel", "1523323184982786269"),
    ("개발",     "channel", "1523214326197125251"),
    ("PM 브리핑", "channel", "1526550777919963146"),
]
for name, rtype, discord_id in rooms:
    db.add(Room(name=name, type=rtype, discord_channel_id=discord_id))

db.commit()

# ─── 목업 메시지 (최근 실제 컨텍스트 반영) ───
now = datetime.utcnow()
mock = [
    # 공유 채널 (room_id=2)
    (1, 2, "MVP 웹 채팅 프로토타입 완성했어요 — FastAPI + WebSocket + React", None, [], 2),
    (2, 2, "프론트엔드 대시보드 + 우측 슬라이드 채팅 패널까지 다 구현했어요", None, [], 2),
    (5, 2, "삼쬐님 작업 이어서 진행하겠습니다. 디스코드 채널 구조 병합 + 회의록 탭 추가 예정이에요.", None, ["삼쬐"], 1),
    (2, 2, "디스코드 실시간 연동은 Bot Token 필요해요. 나중에 연결하면 실시간 메시지 동기화도 가능해요.", None, ["GLM"], 1),

    # 개발 채널 (room_id=3)
    (1, 3, "whisper-serve 포트 3000번 정상 작동 중이에요", None, [], 3),
    (2, 3, "cloudflared 터널로 외부 접속 가능합니다", None, [], 2),
    (5, 3, "MVP 웹에 whisper-serve 통합하는 작업 진행 중이에요. 회의록/음성요약 탭으로 붙일 예정이에요.", None, ["담담"], 1),

    # PM 브리핑 (room_id=4)
    (5, 4, "삼쬐: MVP 웹 채팅 프로토타입 완성 — 백엔드/프론트엔드/한국어 IME 수정 완료", None, [], 1),
    (5, 4, "다음 미션: 디스코드 채널 구조 병합 + whisper-serve 통합 탭", None, [], 1),

    # 일반 (room_id=1)
    (1, 1, "AIGGLE 팀 — 개입 판단을 파는 상주 AI 매니저 🎯", None, [], 48),
    (5, 1, "dogfooding 중 — 우리가 만든 AI 매니저를 우리가 매일 쓰며 발견#N을 판단 기출문제집으로 축적 중", None, [], 24),
]
for uid, rid, content, pid, mentions, hours_ago in mock:
    db.add(Message(
        room_id=rid, user_id=uid, content=content,
        parent_id=pid, mentions=mentions,
        created_at=now - timedelta(hours=hours_ago),
    ))

# 스레드 답글
db.add(Message(
    room_id=2, user_id=2, content="빌드 결과 dist 폴더에 정상 생성됐어요",
    parent_id=1, mentions=[], created_at=now - timedelta(hours=1, minutes=30),
))
db.add(Message(
    room_id=2, user_id=5, content="확인했습니다. 이제 디스코드 채널 구조 반영해서 씨드 업데이트할게요.",
    parent_id=1, mentions=[], created_at=now - timedelta(hours=1),
))

db.commit()
db.close()
print("✅ Seed data inserted! (5 users, 4 channels with Discord IDs, 12+ messages)")
