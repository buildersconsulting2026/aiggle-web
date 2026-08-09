"""DB 마이그레이션: discord_message_id, origin 컬럼 추가 + 기존 [discord:ID] 정리"""
import sqlite3
import re
import os

db_path = os.path.join(os.path.dirname(__file__), "..", "data", "aiggle.db")
conn = sqlite3.connect(db_path)
c = conn.cursor()

# 기존 컬럼 확인
c.execute("PRAGMA table_info(messages)")
cols = [row[1] for row in c.fetchall()]
print("기존 컬럼:", cols)

# 새 컬럼 추가
if "discord_message_id" not in cols:
    c.execute("ALTER TABLE messages ADD COLUMN discord_message_id VARCHAR(50)")
    print("discord_message_id 컬럼 추가")
else:
    print("discord_message_id 이미 존재")

if "origin" not in cols:
    c.execute("ALTER TABLE messages ADD COLUMN origin VARCHAR(10) DEFAULT 'web'")
    print("origin 컬럼 추가")
else:
    print("origin 이미 존재")

# 기존 [discord:ID] 접두사 메시지 정리
c.execute("SELECT id, content FROM messages WHERE content LIKE '[discord:%'")
rows = c.fetchall()
print(f"기존 discord 메시지 {len(rows)}개 정리 중...")
updated = 0
for msg_id, content in rows:
    match = re.match(r"^\[discord:(\d+)\]\s*(.*)$", content, re.DOTALL)
    if match:
        discord_id = match.group(1)
        clean_content = match.group(2)
        c.execute(
            "UPDATE messages SET content=?, discord_message_id=?, origin=? WHERE id=?",
            (clean_content, discord_id, "discord", msg_id),
        )
        updated += 1
print(f"  {updated}개 메시지 정리 완료")

conn.commit()
conn.close()
print("마이그레이션 완료!")
