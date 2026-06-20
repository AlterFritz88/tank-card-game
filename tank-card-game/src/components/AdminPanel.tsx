import { useEffect, useMemo, useState, type CSSProperties } from "react";

import type { PlayerProgress } from "../game/playerProgress";
import { getDefaultWebSocketUrl } from "../network/webSocketUrl";

type AdminRuntimeStats = {
  roomsTotal: number;
  matchmakingRooms: number;
  activeBattles: number;
  finishedRooms: number;
  connectedPvpPlayers: number;
  activeGameSessions: number;
  completedPvpRewardClaims: number;
};

type AdminPlayerAccount = {
  userId: string;
  username: string;
  email: string;
  legalAcceptedAt: number;
  legalVersion: string;
  createdAt: number;
  lastLoginAt: number;
};

type AdminPlayerProfile = {
  playerId: string;
  profile: PlayerProgress;
};

type AdminOverview = {
  generatedAt: number;
  runtime: AdminRuntimeStats;
  accounts: AdminPlayerAccount[];
  profiles: AdminPlayerProfile[];
};

type AdminApiResult =
  | ({ ok: true } & AdminOverview)
  | { ok: false; message?: string };

type ProfileImportMeta = ImportMeta & {
  env?: {
    VITE_PROFILE_SERVER_URL?: string;
    VITE_PVP_SERVER_URL?: string;
  };
};

const ADMIN_TOKEN_STORAGE_KEY = "tank-card-game:admin-token";
const profileImportMetaEnv = (import.meta as ProfileImportMeta).env ?? {};
const ADMIN_HTTP_SERVER_URL = (
  profileImportMetaEnv.VITE_PROFILE_SERVER_URL ??
  profileImportMetaEnv.VITE_PVP_SERVER_URL ??
  getDefaultWebSocketUrl()
)
  .replace(/^wss:/, "https:")
  .replace(/^ws:/, "http:");

function formatDate(timestamp: number): string {
  if (!timestamp) return "—";

  return new Intl.DateTimeFormat("ru-RU", {
    dateStyle: "short",
    timeStyle: "short",
  }).format(timestamp);
}

function getTotalMatches(profile: PlayerProgress): number {
  return profile.battleStats.wins + profile.battleStats.losses;
}

function getAccountTypeLabel(profile: PlayerProgress): string {
  return profile.accountType === "premium" ? "Премиум" : "Базовый";
}

function getErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

async function readJsonResponse<T>(response: Response): Promise<T> {
  const result = (await response.json()) as T & { ok?: boolean; message?: string };

  if (!response.ok || result.ok === false) {
    throw new Error(result.message ?? "Админ API вернул ошибку");
  }

  return result;
}

export function AdminPanel() {
  const [token, setToken] = useState(() => {
    try {
      return window.localStorage.getItem(ADMIN_TOKEN_STORAGE_KEY) ?? "";
    } catch {
      return "";
    }
  });
  const [draftToken, setDraftToken] = useState(token);
  const [overview, setOverview] = useState<AdminOverview | null>(null);
  const [selectedPlayerId, setSelectedPlayerId] = useState("");
  const [ironTracks, setIronTracks] = useState("");
  const [goldTracks, setGoldTracks] = useState("");
  const [query, setQuery] = useState("");
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const accountById = useMemo(() => {
    return new Map(overview?.accounts.map((account) => [account.userId, account]));
  }, [overview]);

  const filteredProfiles = useMemo(() => {
    const normalizedQuery = query.trim().toLowerCase();
    const profiles = overview?.profiles ?? [];

    if (!normalizedQuery) return profiles;

    return profiles.filter(({ playerId, profile }) => {
      const account = accountById.get(playerId);
      const haystack = [
        playerId,
        profile.nickname,
        account?.username,
        account?.email,
      ]
        .filter(Boolean)
        .join(" ")
        .toLowerCase();

      return haystack.includes(normalizedQuery);
    });
  }, [accountById, overview, query]);

  const loadOverview = async (nextToken = token) => {
    if (!nextToken.trim()) {
      setError("Введите ADMIN_TOKEN");
      return;
    }

    setLoading(true);
    setError(null);

    try {
      const response = await fetch(`${ADMIN_HTTP_SERVER_URL}/api/admin/overview`, {
        headers: {
          Authorization: `Bearer ${nextToken.trim()}`,
        },
      });
      const result = await readJsonResponse<AdminApiResult>(response);

      if (!result.ok) throw new Error(result.message ?? "Админ API вернул ошибку");

      setOverview({
        generatedAt: result.generatedAt,
        runtime: result.runtime,
        accounts: result.accounts,
        profiles: result.profiles,
      });
      setToken(nextToken.trim());
      setDraftToken(nextToken.trim());
      try {
        window.localStorage.setItem(ADMIN_TOKEN_STORAGE_KEY, nextToken.trim());
      } catch {
        // localStorage can be unavailable in private contexts; the entered token
        // still remains in component state for the current session.
      }
    } catch (reason) {
      setOverview(null);
      setError(getErrorMessage(reason));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (token) void loadOverview(token);
    // Load once from stored token. Manual refresh uses the latest state value.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const submitToken = (event: React.FormEvent) => {
    event.preventDefault();
    void loadOverview(draftToken);
  };

  const creditTracks = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!selectedPlayerId) {
      setError("Выберите игрока");
      return;
    }

    setSaving(true);
    setError(null);
    setNotice(null);

    try {
      const response = await fetch(`${ADMIN_HTTP_SERVER_URL}/api/admin/credit-tracks`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          playerId: selectedPlayerId,
          ironTracks: Number(ironTracks) || 0,
          goldTracks: Number(goldTracks) || 0,
        }),
      });
      await readJsonResponse<{ ok: true; profile: PlayerProgress } | { ok: false; message?: string }>(
        response
      );

      setNotice("Траки начислены");
      setIronTracks("");
      setGoldTracks("");
      await loadOverview(token);
    } catch (reason) {
      setError(getErrorMessage(reason));
    } finally {
      setSaving(false);
    }
  };

  return (
    <main style={styles.page}>
      <div style={styles.backdrop} />
      <section style={styles.shell}>
        <header style={styles.header}>
          <div>
            <div style={styles.kicker}>PANZERSHREK</div>
            <h1 style={styles.title}>Админ-панель</h1>
          </div>
          <a href="/" style={styles.homeLink}>
            В игру
          </a>
        </header>

        <form style={styles.tokenPanel} onSubmit={submitToken}>
          <label style={styles.label}>
            Admin token
            <input
              value={draftToken}
              onChange={(event) => setDraftToken(event.target.value)}
              type="password"
              style={styles.input}
              placeholder="ADMIN_TOKEN"
            />
          </label>
          <button type="submit" style={styles.primaryButton} disabled={loading}>
            {loading ? "Загрузка..." : "Подключиться"}
          </button>
          {overview ? (
            <button
              type="button"
              style={styles.secondaryButton}
              onClick={() => void loadOverview(token)}
              disabled={loading}
            >
              Обновить
            </button>
          ) : null}
        </form>

        {error ? <div style={styles.error}>{error}</div> : null}
        {notice ? <div style={styles.notice}>{notice}</div> : null}

        {overview ? (
          <>
            <section style={styles.metricsGrid}>
              <MetricCard label="Играют сейчас" value={overview.runtime.activeGameSessions} />
              <MetricCard label="PVP игроки" value={overview.runtime.connectedPvpPlayers} />
              <MetricCard label="Активные бои" value={overview.runtime.activeBattles} />
              <MetricCard label="В очереди" value={overview.runtime.matchmakingRooms} />
              <MetricCard label="Комнат всего" value={overview.runtime.roomsTotal} />
              <MetricCard label="Аккаунты" value={overview.accounts.length} />
              <MetricCard label="Профили" value={overview.profiles.length} />
              <MetricCard
                label="PVP награды"
                value={overview.runtime.completedPvpRewardClaims}
              />
            </section>

            <section style={styles.toolsGrid}>
              <form style={styles.creditPanel} onSubmit={creditTracks}>
                <h2 style={styles.sectionTitle}>Начислить траки</h2>
                <label style={styles.label}>
                  Игрок
                  <select
                    value={selectedPlayerId}
                    onChange={(event) => setSelectedPlayerId(event.target.value)}
                    style={styles.input}
                  >
                    <option value="">Выберите профиль</option>
                    {overview.profiles.map(({ playerId, profile }) => {
                      const account = accountById.get(playerId);

                      return (
                        <option key={playerId} value={playerId}>
                          {account?.username ?? profile.nickname} ({playerId})
                        </option>
                      );
                    })}
                  </select>
                </label>
                <div style={styles.inlineFields}>
                  <label style={styles.label}>
                    Железные
                    <input
                      value={ironTracks}
                      onChange={(event) => setIronTracks(event.target.value)}
                      type="number"
                      min="0"
                      step="1"
                      style={styles.input}
                      placeholder="0"
                    />
                  </label>
                  <label style={styles.label}>
                    Золотые
                    <input
                      value={goldTracks}
                      onChange={(event) => setGoldTracks(event.target.value)}
                      type="number"
                      min="0"
                      step="1"
                      style={styles.input}
                      placeholder="0"
                    />
                  </label>
                </div>
                <button type="submit" style={styles.primaryButton} disabled={saving}>
                  {saving ? "Начисляю..." : "Начислить"}
                </button>
              </form>

              <div style={styles.infoPanel}>
                <h2 style={styles.sectionTitle}>Срез данных</h2>
                <div style={styles.infoLine}>
                  Обновлено: <b>{formatDate(overview.generatedAt)}</b>
                </div>
                <div style={styles.infoLine}>
                  Завершённые комнаты: <b>{overview.runtime.finishedRooms}</b>
                </div>
                <div style={styles.infoLine}>
                  Хранилище: <b>player-accounts.json / player-profiles.json</b>
                </div>
              </div>
            </section>

            <section style={styles.tablePanel}>
              <div style={styles.tableHeader}>
                <h2 style={styles.sectionTitle}>Пользователи и прогресс</h2>
                <input
                  value={query}
                  onChange={(event) => setQuery(event.target.value)}
                  style={{ ...styles.input, ...styles.searchInput }}
                  placeholder="Поиск по нику, email или playerId"
                />
              </div>

              <div style={styles.tableWrap}>
                <table style={styles.table}>
                  <thead>
                    <tr>
                      <th style={styles.th}>Игрок</th>
                      <th style={styles.th}>Профиль</th>
                      <th style={styles.th}>Матчи</th>
                      <th style={styles.th}>Валюты</th>
                      <th style={styles.th}>Прогресс</th>
                      <th style={styles.th}>Активность</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filteredProfiles.map(({ playerId, profile }) => {
                      const account = accountById.get(playerId);

                      return (
                        <tr
                          key={playerId}
                          style={styles.tr}
                          onClick={() => setSelectedPlayerId(playerId)}
                        >
                          <td style={styles.td}>
                            <b>{account?.username ?? profile.nickname}</b>
                            <span style={styles.muted}>{playerId}</span>
                            {account?.email ? (
                              <span style={styles.muted}>{account.email}</span>
                            ) : null}
                          </td>
                          <td style={styles.td}>
                            <span>{getAccountTypeLabel(profile)}</span>
                            <span style={styles.muted}>
                              Любимый штаб: {profile.favoriteHeadquartersId ?? "—"}
                            </span>
                          </td>
                          <td style={styles.td}>
                            <span>{getTotalMatches(profile)} всего</span>
                            <span style={styles.muted}>
                              {profile.battleStats.wins} побед /{" "}
                              {profile.battleStats.losses} поражений
                            </span>
                          </td>
                          <td style={styles.td}>
                            <span>Железные: {profile.ironTracks}</span>
                            <span>Золотые: {profile.goldTracks}</span>
                            <span style={styles.muted}>Свободный опыт: {profile.freeXp}</span>
                          </td>
                          <td style={styles.td}>
                            <span>Штабы: {profile.unlockedHeadquartersIds.length}</span>
                            <span>Карты: {Object.keys(profile.ownedCardCopies).length}</span>
                            <span style={styles.muted}>Колоды: {profile.savedDecks.length}</span>
                          </td>
                          <td style={styles.td}>
                            <span>{account ? "Аккаунт" : "Гость"}</span>
                            <span style={styles.muted}>
                              Вход: {formatDate(account?.lastLoginAt ?? 0)}
                            </span>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </section>
          </>
        ) : (
          <section style={styles.emptyState}>
            Введите админский ключ, чтобы открыть мониторинг пользователей и прогресса.
          </section>
        )}
      </section>
    </main>
  );
}

function MetricCard({ label, value }: { label: string; value: number }) {
  return (
    <div style={styles.metricCard}>
      <div style={styles.metricValue}>{value}</div>
      <div style={styles.metricLabel}>{label}</div>
    </div>
  );
}

const styles: Record<string, CSSProperties> = {
  page: {
    minHeight: "100vh",
    color: "#f4e5bf",
    background:
      "radial-gradient(circle at 50% 10%, rgba(189, 139, 50, 0.18), transparent 34%), linear-gradient(180deg, #20231d 0%, #070907 100%)",
    fontFamily: "var(--font-body)",
  },
  backdrop: {
    position: "fixed",
    inset: 0,
    pointerEvents: "none",
    background:
      "linear-gradient(90deg, rgba(0,0,0,0.76), transparent 22%, transparent 78%, rgba(0,0,0,0.76)), repeating-linear-gradient(0deg, rgba(255,255,255,0.025) 0 1px, transparent 1px 4px)",
    mixBlendMode: "overlay",
  },
  shell: {
    position: "relative",
    zIndex: 1,
    width: "min(1280px, calc(100vw - 28px))",
    margin: "0 auto",
    padding: "24px 0 46px",
  },
  header: {
    display: "flex",
    alignItems: "flex-start",
    justifyContent: "space-between",
    gap: 20,
    marginBottom: 18,
  },
  kicker: {
    color: "rgba(244,229,191,0.66)",
    fontFamily: "var(--font-display)",
    fontWeight: 700,
    letterSpacing: "0.18em",
  },
  title: {
    margin: 0,
    color: "#d6ad53",
    fontFamily: "var(--font-display)",
    fontSize: "clamp(36px, 6vw, 68px)",
    lineHeight: 0.92,
    fontWeight: 700,
    letterSpacing: "0.08em",
    textTransform: "uppercase",
    textShadow: "0 7px 18px rgba(0,0,0,0.72)",
  },
  homeLink: {
    display: "inline-flex",
    alignItems: "center",
    justifyContent: "center",
    minWidth: 116,
    minHeight: 40,
    padding: "8px 16px",
    color: "#fff0bd",
    textDecoration: "none",
    textTransform: "uppercase",
    letterSpacing: "0.08em",
    fontFamily: "var(--font-display)",
    fontWeight: 700,
    background:
      "linear-gradient(180deg, rgba(156,159,154,0.34), rgba(45,48,49,0.76))",
    boxShadow:
      "inset 0 0 0 1px rgba(216,174,92,0.28), 0 16px 34px rgba(0,0,0,0.38)",
  },
  tokenPanel: {
    display: "flex",
    alignItems: "flex-end",
    gap: 12,
    flexWrap: "wrap",
    padding: 18,
    marginBottom: 16,
    background: "rgba(12, 13, 11, 0.78)",
    boxShadow: "inset 0 0 0 1px rgba(216,174,92,0.18)",
  },
  label: {
    display: "grid",
    gap: 7,
    color: "rgba(244,229,191,0.78)",
    fontSize: 12,
    fontWeight: 800,
    letterSpacing: "0.06em",
    textTransform: "uppercase",
  },
  input: {
    minHeight: 38,
    padding: "8px 10px",
    border: "1px solid rgba(216,174,92,0.28)",
    borderRadius: 0,
    outline: "none",
    color: "#fff4d7",
    background: "rgba(5,7,6,0.72)",
    fontFamily: "var(--font-body)",
    fontSize: 14,
    fontWeight: 700,
  },
  primaryButton: {
    minHeight: 38,
    padding: "8px 18px",
    border: 0,
    color: "#1b1407",
    background: "linear-gradient(180deg, #e2c16d, #9e7427)",
    fontFamily: "var(--font-display)",
    fontSize: 15,
    fontWeight: 700,
    letterSpacing: "0.08em",
    textTransform: "uppercase",
    cursor: "pointer",
  },
  secondaryButton: {
    minHeight: 38,
    padding: "8px 18px",
    border: "1px solid rgba(216,174,92,0.22)",
    color: "#fff0bd",
    background: "rgba(76,78,73,0.48)",
    fontFamily: "var(--font-display)",
    fontSize: 15,
    fontWeight: 700,
    letterSpacing: "0.08em",
    textTransform: "uppercase",
    cursor: "pointer",
  },
  error: {
    marginBottom: 14,
    padding: "12px 14px",
    color: "#ffc3b5",
    background: "rgba(92, 25, 19, 0.7)",
    boxShadow: "inset 0 0 0 1px rgba(255,120,90,0.28)",
    fontWeight: 800,
  },
  notice: {
    marginBottom: 14,
    padding: "12px 14px",
    color: "#dff6b9",
    background: "rgba(35, 82, 39, 0.58)",
    boxShadow: "inset 0 0 0 1px rgba(167,224,117,0.26)",
    fontWeight: 800,
  },
  metricsGrid: {
    display: "grid",
    gridTemplateColumns: "repeat(auto-fit, minmax(140px, 1fr))",
    gap: 10,
    marginBottom: 16,
  },
  metricCard: {
    minHeight: 96,
    padding: 16,
    background:
      "linear-gradient(180deg, rgba(28,29,25,0.92), rgba(11,12,10,0.9))",
    boxShadow: "inset 0 0 0 1px rgba(216,174,92,0.18)",
  },
  metricValue: {
    color: "#f2cf7a",
    fontFamily: "var(--font-display)",
    fontSize: 38,
    fontWeight: 700,
    lineHeight: 0.95,
  },
  metricLabel: {
    marginTop: 8,
    color: "rgba(244,229,191,0.72)",
    fontSize: 12,
    fontWeight: 900,
    letterSpacing: "0.08em",
    textTransform: "uppercase",
  },
  toolsGrid: {
    display: "grid",
    gridTemplateColumns: "minmax(280px, 420px) 1fr",
    gap: 14,
    marginBottom: 16,
  },
  creditPanel: {
    display: "grid",
    gap: 12,
    padding: 18,
    background: "rgba(12,13,11,0.78)",
    boxShadow: "inset 0 0 0 1px rgba(216,174,92,0.18)",
  },
  infoPanel: {
    padding: 18,
    background: "rgba(12,13,11,0.62)",
    boxShadow: "inset 0 0 0 1px rgba(216,174,92,0.14)",
  },
  sectionTitle: {
    margin: 0,
    color: "#d6ad53",
    fontFamily: "var(--font-display)",
    fontSize: 24,
    fontWeight: 700,
    letterSpacing: "0.08em",
    textTransform: "uppercase",
  },
  inlineFields: {
    display: "grid",
    gridTemplateColumns: "1fr 1fr",
    gap: 10,
  },
  infoLine: {
    marginTop: 12,
    color: "rgba(244,229,191,0.78)",
    fontSize: 15,
  },
  tablePanel: {
    padding: 18,
    background: "rgba(12,13,11,0.78)",
    boxShadow: "inset 0 0 0 1px rgba(216,174,92,0.18)",
  },
  tableHeader: {
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 12,
    marginBottom: 14,
  },
  searchInput: {
    width: "min(420px, 100%)",
  },
  tableWrap: {
    overflowX: "auto",
    maxHeight: "58vh",
  },
  table: {
    width: "100%",
    borderCollapse: "collapse",
    minWidth: 980,
  },
  th: {
    position: "sticky",
    top: 0,
    zIndex: 1,
    padding: "10px 12px",
    color: "#f2cf7a",
    background: "rgba(8,9,7,0.98)",
    textAlign: "left",
    fontSize: 12,
    letterSpacing: "0.08em",
    textTransform: "uppercase",
  },
  tr: {
    cursor: "pointer",
    borderTop: "1px solid rgba(216,174,92,0.12)",
  },
  td: {
    padding: "12px",
    verticalAlign: "top",
    color: "rgba(255,246,221,0.9)",
    fontSize: 14,
  },
  muted: {
    display: "block",
    marginTop: 4,
    color: "rgba(244,229,191,0.54)",
    fontSize: 12,
  },
  emptyState: {
    padding: 28,
    color: "rgba(244,229,191,0.78)",
    background: "rgba(12,13,11,0.72)",
    boxShadow: "inset 0 0 0 1px rgba(216,174,92,0.16)",
    fontWeight: 800,
  },
};
