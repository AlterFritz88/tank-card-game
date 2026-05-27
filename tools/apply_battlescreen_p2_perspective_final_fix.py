from __future__ import annotations

from pathlib import Path
import re
import sys

ROOT = Path(sys.argv[1]) if len(sys.argv) > 1 else Path.cwd()
CANDIDATES = [
    ROOT / "tank-card-game" / "src" / "components" / "BattleScreen.tsx",
    ROOT / "src" / "components" / "BattleScreen.tsx",
]
path = next((item for item in CANDIDATES if item.exists()), None)
if path is None:
    raise SystemExit(
        "Не нашел BattleScreen.tsx. Запусти скрипт из корня репозитория "
        "или передай путь к корню первым аргументом."
    )

text = path.read_text(encoding="utf-8")
original = text
warnings: list[str] = []
changes: list[str] = []

def warn(msg: str) -> None:
    warnings.append(msg)


def changed(msg: str) -> None:
    changes.append(msg)


def sub_once(pattern: str, repl: str, s: str, label: str, flags: int = re.DOTALL) -> str:
    ns, count = re.subn(pattern, repl, s, count=1, flags=flags)
    if count:
        changed(label)
    else:
        warn(f"не найден блок: {label}")
    return ns


def replace_all(s: str, old: str, new: str, label: str) -> str:
    count = s.count(old)
    if count:
        changed(f"{label}: {count}")
        return s.replace(old, new)
    return s


def replace_once(s: str, old: str, new: str, label: str) -> str:
    if old in s:
        changed(label)
        return s.replace(old, new, 1)
    warn(f"не найден фрагмент: {label}")
    return s

# ---------------------------------------------------------------------------
# 0. Make sure BattleScreen reads mode/localPlayerId and can work with null battle.
# ---------------------------------------------------------------------------
if "humanPlayerId" not in text:
    text = sub_once(
        r"const\s*\{\s*battle,\s*selectedCardInstanceId,\s*selectedAttacker,\s*selectCard,\s*selectAttacker,\s*dispatch,\s*reset,\s*\}\s*=\s*useBattleStore\(\);",
        '''const {
    battle: rawBattle,
    mode,
    localPlayerId,
    selectedCardInstanceId,
    selectedAttacker,
    selectCard,
    selectAttacker,
    dispatch,
    reset,
  } = useBattleStore();

  if (!rawBattle) {
    return null;
  }

  const battle = rawBattle;
  const humanPlayerId: PlayerId = mode === "pvp" ? localPlayerId : "player";
  const opponentPlayerId: PlayerId =
    humanPlayerId === "player" ? "bot" : "player";
  const botAiEnabled = mode === "ai";
  const isHumanTurn =
    battle.status === "active" && battle.activePlayer === humanPlayerId;''',
        text,
        "store destructuring + humanPlayerId",
    )
else:
    # Some previous patches created humanPlayerId but missed these helpers.
    if "opponentPlayerId" not in text:
        text = sub_once(
            r"const\s+humanPlayerId:\s*PlayerId\s*=\s*mode\s*===\s*\"pvp\"\s*\?\s*localPlayerId\s*:\s*\"player\"\s*;",
            '''const humanPlayerId: PlayerId = mode === "pvp" ? localPlayerId : "player";
  const opponentPlayerId: PlayerId =
    humanPlayerId === "player" ? "bot" : "player";''',
            text,
            "add opponentPlayerId",
        )
    if "botAiEnabled" not in text:
        text = sub_once(
            r"const\s+opponentPlayerId:\s*PlayerId\s*=\s*humanPlayerId\s*===\s*\"player\"\s*\?\s*\"bot\"\s*:\s*\"player\"\s*;",
            '''const opponentPlayerId: PlayerId =
    humanPlayerId === "player" ? "bot" : "player";
  const botAiEnabled = mode === "ai";''',
            text,
            "add botAiEnabled",
        )

# ---------------------------------------------------------------------------
# 1. Disable local AI/start roll in PVP. AI mode remains intact.
# ---------------------------------------------------------------------------
if 'if (mode === "pvp") return;' not in text:
    text = sub_once(
        r"useEffect\(\(\)\s*=>\s*\{\s*if\s*\(battle\.status\s*!==\s*\"starting\"\)",
        'useEffect(() => {\n    if (mode === "pvp") return;\n\n    if (battle.status !== "starting")',
        text,
        "disable client start-roll in PVP",
    )
    text = text.replace("}, [battle.status]);", "}, [battle.status, mode]);", 1)

if 'if (!botAiEnabled) return;' not in text:
    text = sub_once(
        r"useEffect\(\(\)\s*=>\s*\{\s*if\s*\(debugPaused\)\s*return;\s*if\s*\(battle\.status\s*!==\s*\"active\"\)\s*return;\s*if\s*\(battle\.activePlayer\s*!==\s*\"bot\"\)\s*return;",
        'useEffect(() => {\n    if (!botAiEnabled) return;\n    if (debugPaused) return;\n    if (battle.status !== "active") return;\n    if (battle.activePlayer !== "bot") return;',
        text,
        "disable bot AI effect outside AI mode",
    )

if 'if (!botAiEnabled) {\n      setThinkingCardIndex(null);' not in text:
    text = sub_once(
        r"useEffect\(\(\)\s*=>\s*\{\s*if\s*\(debugPaused\)\s*\{\s*setThinkingCardIndex\(null\);\s*return;\s*\}",
        'useEffect(() => {\n    if (!botAiEnabled) {\n      setThinkingCardIndex(null);\n      return;\n    }\n\n    if (debugPaused) {\n      setThinkingCardIndex(null);\n      return;\n    }',
        text,
        "disable bot-thinking animation outside AI mode",
    )

# ---------------------------------------------------------------------------
# 2. Second player controls side `bot`: all local interaction must use humanPlayerId.
# ---------------------------------------------------------------------------
# Turn checks.
text = replace_all(text, 'battle.activePlayer !== "player"', 'battle.activePlayer !== humanPlayerId', "active player negative checks")
text = replace_all(text, 'battle.activePlayer === "player"', 'battle.activePlayer === humanPlayerId', "active player positive checks")

# Actions sent from UI.
text = replace_all(text, 'playerId: "player"', 'playerId: humanPlayerId', "action playerId")
text = replace_all(text, 'ownerId: "player"', 'ownerId: humanPlayerId', "preview ownerId")

# Unit/HQ ownership tests.
text = replace_all(text, 'unit.ownerId === "player"', 'unit.ownerId === humanPlayerId', "own unit test")
text = replace_all(text, 'owner === "player"', 'owner === humanPlayerId', "own hq test")

# Ranges must be calculated for the local side, not always for player.
text = re.sub(
    r"getTargetsInRange\(\s*battle,\s*\"player\"\s*,",
    "getTargetsInRange(\n        battle,\n        humanPlayerId,",
    text,
)
text = re.sub(
    r"getAvailableMoveCells\(\s*battle,\s*\"player\"\s*,",
    "getAvailableMoveCells(battle, humanPlayerId,",
    text,
)

# Selected HQ id must be local-side hq.
text = replace_all(text, 'id: "player_hq"', 'id: `${humanPlayerId}_hq`', "select local HQ")

# Spawn selected card into own spawn zone and use own hand.
if "const isOwnSpawn" not in text:
    text = replace_once(
        text,
        'if (!isPlayerSpawn(position)) return;\n\n      const cardInstance = battle.player.hand.find(',
        'const isOwnSpawn =\n        humanPlayerId === "player" ? isPlayerSpawn(position) : isBotSpawn(position);\n      if (!isOwnSpawn) return;\n\n      const cardInstance = battle[humanPlayerId].hand.find(',
        "own spawn zone + own hand",
    )
else:
    text = replace_all(text, 'const cardInstance = battle.player.hand.find(', 'const cardInstance = battle[humanPlayerId].hand.find(', "own hand for play card")

text = replace_all(text, 'playSpawnCardAnimation(\n        "player",', 'playSpawnCardAnimation(\n        humanPlayerId,', "spawn animation owner multiline")
text = replace_all(text, 'playSpawnCardAnimation("player",', 'playSpawnCardAnimation(humanPlayerId,', "spawn animation owner inline")

# ---------------------------------------------------------------------------
# 3. Top/bottom panels are relative: bottom = local player, top = opponent.
# ---------------------------------------------------------------------------
text = replace_all(text, 'renderTimerPanel("player")', 'renderTimerPanel(humanPlayerId)', "bottom timer")
text = replace_all(text, 'renderTimerPanel("bot")', 'renderTimerPanel(opponentPlayerId)', "top timer")
text = replace_all(text, 'deckRefs.current.player = element;', 'deckRefs.current[humanPlayerId] = element;', "bottom deck ref")
text = replace_all(text, 'deckRefs.current.bot = element;', 'deckRefs.current[opponentPlayerId] = element;', "top deck ref")
text = replace_all(text, 'handRefs.current.player = element;', 'handRefs.current[humanPlayerId] = element;', "bottom hand ref")
text = replace_all(text, 'handRefs.current.bot = element;', 'handRefs.current[opponentPlayerId] = element;', "top hand ref")
text = replace_all(text, 'renderDeckStack(battle.player.deck.length)', 'renderDeckStack(battle[humanPlayerId].deck.length)', "bottom deck count")
text = replace_all(text, 'renderDeckStack(player.deck.length)', 'renderDeckStack(player.deck.length)', "noop deck count")
text = replace_all(text, 'battle.player.hand.map(', 'battle[humanPlayerId].hand.map(', "bottom hand map")
text = replace_all(text, 'battle.bot.hand.map((cardInstance, index)', 'battle[opponentPlayerId].hand.map((cardInstance, index)', "top hand map card")
text = replace_all(text, 'battle.bot.hand.map((_, index)', 'battle[opponentPlayerId].hand.map((_, index)', "top thinking map")
text = replace_all(text, 'const player = battle.bot;', 'const player = battle[opponentPlayerId];', "enemy deck player source")

# Spawn animation: hide opponent cards, show local card face.
text = replace_all(text, 'if (effect.owner === "bot") {', 'if (effect.owner !== humanPlayerId) {', "spawn effect opponent card back")

# Timer/HQ labels should be relative.
text = replace_all(text, 'const isPlayer = owner === "player";', 'const isLocalPlayer = owner === humanPlayerId;', "relative owner label var")
text = replace_all(text, 'const showPlayerReminder = isPlayer && active;', 'const showPlayerReminder = isLocalPlayer && active;', "relative turn reminder")
text = replace_all(text, 'isPlayer ? "Ваш штаб" : "Штаб врага"', 'isLocalPlayer ? "Ваш штаб" : "Штаб врага"', "relative hq title")
text = replace_all(text, 'isPlayer ? "BASE" : "ENEMY"', 'isLocalPlayer ? "BASE" : "ENEMY"', "relative hq badge")

# ---------------------------------------------------------------------------
# 4. Board perspective: render coordinates in reverse for second player.
# This is the key fix for HQ/spawn visual position.
# ---------------------------------------------------------------------------
if "visualRows" not in text:
    # This handles formatted and compact source variants.
    text = sub_once(
        r"const\s+rows\s*=\s*\[0,\s*1,\s*2\]\s*as\s*const;\s*const\s+cols\s*=\s*\[0,\s*1,\s*2,\s*3,\s*4\]\s*as\s*const;",
        '''const rows = [0, 1, 2] as const;
  const cols = [0, 1, 2, 3, 4] as const;
  const visualRows: readonly number[] =
    humanPlayerId === "player" ? rows : [...rows].reverse();
  const visualCols: readonly number[] =
    humanPlayerId === "player" ? cols : [...cols].reverse();''',
        text,
        "add visualRows/visualCols",
    )

# Replace render loops, handling several possible formatting variants.
loop_patterns = [
    ('{rows.map((row) => cols.map((col) => {', '{visualRows.map((row) => visualCols.map((col) => {'),
    ('rows.map((row) => cols.map((col) => {', 'visualRows.map((row) => visualCols.map((col) => {'),
    ('{rows.map((row) =>\n            cols.map((col) => {', '{visualRows.map((row) =>\n            visualCols.map((col) => {'),
]
for old, new in loop_patterns:
    if old in text:
        text = text.replace(old, new)
        changed("replace board render loop with visual rows/cols")

# Extra regex fallback for formatted code.
text, count = re.subn(
    r"rows\.map\(\(row\)\s*=>\s*cols\.map\(\(col\)\s*=>\s*\{",
    "visualRows.map((row) => visualCols.map((col) => {",
    text,
)
if count:
    changed(f"regex board loop replacement: {count}")

# ---------------------------------------------------------------------------
# 5. PVP timer: temporary guard so both clients do not tick the server at once.
# ---------------------------------------------------------------------------
if 'if (mode === "pvp" && localPlayerId !== "player") return;' not in text:
    text = sub_once(
        r"useEffect\(\(\)\s*=>\s*\{\s*if\s*\(debugPaused\)\s*return;\s*if\s*\(battle\.status\s*!==\s*\"active\"\)\s*return;\s*let\s+lastTickTime",
        'useEffect(() => {\n    if (debugPaused) return;\n    if (battle.status !== "active") return;\n    if (mode === "pvp" && localPlayerId !== "player") return;\n\n    let lastTickTime',
        text,
        "single timer tick source in PVP",
    )

# ---------------------------------------------------------------------------
# 6. Cleanup common accidental double replacements from older patch attempts.
# ---------------------------------------------------------------------------
text = text.replace('battle[humanPlayerId][humanPlayerId].deck.length', 'battle[humanPlayerId].deck.length')
text = text.replace('battle[humanPlayerId][humanPlayerId].hand', 'battle[humanPlayerId].hand')
text = text.replace('battle[opponentPlayerId][opponentPlayerId].hand', 'battle[opponentPlayerId].hand')
text = text.replace('battle[opponentPlayerId][opponentPlayerId].deck.length', 'battle[opponentPlayerId].deck.length')
text = text.replace('const isLocalPlayer = owner === humanPlayerId;\n    const isLocalPlayer = owner === humanPlayerId;', 'const isLocalPlayer = owner === humanPlayerId;')

# ---------------------------------------------------------------------------
# 7. Sanity checks: fail loudly if the key fixes are still absent.
# ---------------------------------------------------------------------------
required = {
    "humanPlayerId": "нет humanPlayerId — клиент не знает, какая сторона локальная",
    "opponentPlayerId": "нет opponentPlayerId — верхняя зона не сможет стать противником",
    "visualRows": "нет visualRows — поле не перевернется для второго игрока",
    "visualRows.map": "рендер поля всё ещё не использует visualRows",
    "battle.activePlayer !== humanPlayerId": "клики всё ещё могут быть привязаны к player",
    "unit.ownerId === humanPlayerId": "выбор своих юнитов всё ещё может быть привязан к player",
    "battle[humanPlayerId].hand": "нижняя рука всё ещё может быть привязана к player",
    "battle[opponentPlayerId].hand": "верхняя рука всё ещё может быть привязана к bot",
}
missing = [message for key, message in required.items() if key not in text]

if text == original:
    raise SystemExit("Скрипт не внес изменений. Возможно, файл уже обновлен. Проверь sanity checks вручную.")

if missing:
    print("ОШИБКА: часть обязательных правок не применена:")
    for item in missing:
        print(f"- {item}")
    print("\nФайл НЕ перезаписан, чтобы не оставить полуправку.")
    if warnings:
        print("\nПредупреждения:")
        for item in warnings:
            print(f"- {item}")
    raise SystemExit(1)

backup = path.with_suffix(path.suffix + ".p2-final.bak")
if not backup.exists():
    backup.write_text(original, encoding="utf-8")
path.write_text(text, encoding="utf-8")

print(f"Готово: обновлен {path}")
print(f"Бэкап: {backup}")
print("\nПримененные изменения:")
for item in changes:
    print(f"- {item}")
if warnings:
    print("\nПредупреждения — не критично, если sanity checks прошли:")
    for item in warnings:
        print(f"- {item}")
