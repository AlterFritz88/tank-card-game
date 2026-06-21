import { useEffect, useMemo, useState, type CSSProperties } from "react";

import { HEADQUARTERS } from "../game/headquarters";
import type { PlayerProgress } from "../game/playerProgress";
import type { HeadquartersId } from "../game/types";
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

type SupportTicket = {
  id: string;
  createdAt: number;
  playerId: string;
  nickname: string;
  contact: string;
  message: string;
  pageUrl: string;
  userAgent: string;
  status: "new";
};

type AdminOverview = {
  generatedAt: number;
  runtime: AdminRuntimeStats;
  accounts: AdminPlayerAccount[];
  profiles: AdminPlayerProfile[];
  supportTickets: SupportTicket[];
};

type AdminApiResult =
  | ({ ok: true } & Omit<AdminOverview, "supportTickets"> & {
      supportTickets?: SupportTicket[];
    })
  | { ok: false; message?: string };

type AdminSupportTicketsResult =
  | { ok: true; generatedAt: number; supportTickets: SupportTicket[] }
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

function getWinRate(wins: number, losses: number): string {
  const total = wins + losses;
  if (total <= 0) return "0%";

  return `${Math.round((wins / total) * 100)}%`;
}

function getOwnedCopyTotal(profile: PlayerProgress): number {
  return Object.values(profile.ownedCardCopies).reduce(
    (total, copies) => total + copies,
    0
  );
}

function getAccountTypeLabel(profile: PlayerProgress): string {
  return profile.accountType === "premium" ? "Премиум" : "Базовый";
}

function getHeadquartersTitle(headquartersId: string): string {
  return HEADQUARTERS[headquartersId as HeadquartersId]?.title ?? headquartersId;
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

  const allPlayersStats = useMemo(() => {
    const profiles = overview?.profiles ?? [];

    return profiles.reduce(
      (stats, { profile }) => ({
        matches: stats.matches + getTotalMatches(profile),
        wins: stats.wins + profile.battleStats.wins,
        losses: stats.losses + profile.battleStats.losses,
        ironTracks: stats.ironTracks + profile.ironTracks,
        goldTracks: stats.goldTracks + profile.goldTracks,
        freeXp: stats.freeXp + profile.freeXp,
        premiumPlayers:
          stats.premiumPlayers + (profile.accountType === "premium" ? 1 : 0),
        tutorialCompleted:
          stats.tutorialCompleted + (profile.tutorialCompleted ? 1 : 0),
        savedDecks: stats.savedDecks + profile.savedDecks.length,
        ownedCopies: stats.ownedCopies + getOwnedCopyTotal(profile),
      }),
      {
        matches: 0,
        wins: 0,
        losses: 0,
        ironTracks: 0,
        goldTracks: 0,
        freeXp: 0,
        premiumPlayers: 0,
        tutorialCompleted: 0,
        savedDecks: 0,
        ownedCopies: 0,
      }
    );
  }, [overview]);

  const supportTickets = overview?.supportTickets ?? [];

  const selectedPlayer = useMemo(() => {
    if (!overview || !selectedPlayerId) return null;

    return overview.profiles.find((profile) => profile.playerId === selectedPlayerId) ?? null;
  }, [overview, selectedPlayerId]);

  const selectedHeadquartersStats = useMemo(() => {
    const profile = selectedPlayer?.profile;
    if (!profile) return [];

    const headquartersIds = new Set<string>([
      ...Object.keys(profile.headquartersMatchCounts),
      ...Object.keys(profile.headquartersXp),
      ...Object.keys(profile.headquartersBattleStats),
      ...profile.unlockedHeadquartersIds,
    ]);

    return Array.from(headquartersIds)
      .map((headquartersId) => {
        const stats = profile.headquartersBattleStats[headquartersId as HeadquartersId] ?? {
          wins: 0,
          losses: 0,
        };
        const matches =
          profile.headquartersMatchCounts[headquartersId as HeadquartersId] ??
          stats.wins + stats.losses;

        return {
          headquartersId,
          title: getHeadquartersTitle(headquartersId),
          matches,
          wins: stats.wins,
          losses: stats.losses,
          xp: profile.headquartersXp[headquartersId as HeadquartersId] ?? 0,
          unlocked: profile.unlockedHeadquartersIds.includes(
            headquartersId as HeadquartersId
          ),
          researched: profile.researchedHeadquartersIds.includes(
            headquartersId as HeadquartersId
          ),
        };
      })
      .sort((left, right) => right.matches - left.matches || right.xp - left.xp);
  }, [selectedPlayer]);

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
        supportTickets: Array.isArray(result.supportTickets)
          ? result.supportTickets
          : [],
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

  const loadSupportTickets = async (nextToken = token) => {
    if (!nextToken.trim()) {
      setError("Введите ADMIN_TOKEN");
      return;
    }

    setLoading(true);
    setError(null);

    try {
      const response = await fetch(
        `${ADMIN_HTTP_SERVER_URL}/api/admin/support-tickets`,
        {
          headers: {
            Authorization: `Bearer ${nextToken.trim()}`,
          },
        }
      );
      const result = await readJsonResponse<AdminSupportTicketsResult>(response);

      if (!result.ok) throw new Error(result.message ?? "Админ API вернул ошибку");

      setOverview((currentOverview) =>
        currentOverview
          ? {
              ...currentOverview,
              generatedAt: result.generatedAt,
              supportTickets: Array.isArray(result.supportTickets)
                ? result.supportTickets
                : [],
            }
          : currentOverview
      );
      setNotice(`Обращения обновлены: ${result.supportTickets.length}`);
    } catch (reason) {
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
              <MetricCard label="Обращения" value={supportTickets.length} />
              <MetricCard
                label="PVP награды"
                value={overview.runtime.completedPvpRewardClaims}
              />
            </section>

            <section style={styles.supportTicketsPanel}>
              <div style={styles.tableHeader}>
                <div>
                  <h2 style={styles.sectionTitle}>Обращения в поддержку</h2>
                  <div style={styles.statsHint}>
                    Последние {supportTickets.length} сообщений
                  </div>
                </div>
                <button
                  type="button"
                  style={styles.secondaryButton}
                  onClick={() => void loadSupportTickets(token)}
                  disabled={loading}
                >
                  Обновить обращения
                </button>
              </div>

              {supportTickets.length > 0 ? (
                <div style={styles.supportTicketList}>
                  {supportTickets.map((ticket) => (
                    <article key={ticket.id} style={styles.supportTicketCard}>
                      <div style={styles.supportTicketHeader}>
                        <div>
                          <div style={styles.supportTicketTitle}>
                            {ticket.nickname || "Игрок без ника"}
                          </div>
                          <div style={styles.muted}>{ticket.playerId || "playerId не указан"}</div>
                        </div>
                        <div style={styles.supportTicketDate}>
                          {formatDate(ticket.createdAt)}
                        </div>
                      </div>
                      {ticket.contact ? (
                        <div style={styles.supportTicketMeta}>
                          Контакт: <b>{ticket.contact}</b>
                        </div>
                      ) : null}
                      <p style={styles.supportTicketMessage}>{ticket.message}</p>
                      <div style={styles.supportTicketFooter}>
                        <span>{ticket.status === "new" ? "Новое" : ticket.status}</span>
                        {ticket.pageUrl ? (
                          <span title={ticket.pageUrl}>{ticket.pageUrl}</span>
                        ) : null}
                      </div>
                    </article>
                  ))}
                </div>
              ) : (
                <div style={styles.emptyState}>
                  Пока нет сообщений от игроков.
                </div>
              )}
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

            <section style={styles.statsPanel}>
              <div style={styles.tableHeader}>
                <h2 style={styles.sectionTitle}>Статистика всех игроков</h2>
                <div style={styles.statsHint}>
                  Клик по игроку в таблице откроет подробности
                </div>
              </div>
              <div style={styles.statsGrid}>
                <StatTile label="Матчи" value={allPlayersStats.matches} />
                <StatTile label="Победы" value={allPlayersStats.wins} />
                <StatTile label="Поражения" value={allPlayersStats.losses} />
                <StatTile
                  label="Процент побед"
                  value={getWinRate(allPlayersStats.wins, allPlayersStats.losses)}
                />
                <StatTile label="Железные траки" value={allPlayersStats.ironTracks} />
                <StatTile label="Золотые траки" value={allPlayersStats.goldTracks} />
                <StatTile label="Свободный опыт" value={allPlayersStats.freeXp} />
                <StatTile label="Премиум" value={allPlayersStats.premiumPlayers} />
                <StatTile
                  label="Прошли обучение"
                  value={allPlayersStats.tutorialCompleted}
                />
                <StatTile label="Колоды" value={allPlayersStats.savedDecks} />
                <StatTile label="Копии карт" value={allPlayersStats.ownedCopies} />
              </div>

              {selectedPlayer ? (
                <div style={styles.playerDetailPanel}>
                  <div style={styles.playerDetailHeader}>
                    <div>
                      <h3 style={styles.playerDetailTitle}>
                        {accountById.get(selectedPlayer.playerId)?.username ??
                          selectedPlayer.profile.nickname}
                      </h3>
                      <div style={styles.muted}>{selectedPlayer.playerId}</div>
                    </div>
                    <div style={styles.playerDetailBadges}>
                      <span style={styles.badge}>
                        {getAccountTypeLabel(selectedPlayer.profile)}
                      </span>
                      <span style={styles.badge}>
                        {selectedPlayer.profile.tutorialCompleted
                          ? "Обучение пройдено"
                          : "Обучение не пройдено"}
                      </span>
                    </div>
                  </div>

                  <div style={styles.playerDetailGrid}>
                    <StatTile
                      label="Матчи"
                      value={getTotalMatches(selectedPlayer.profile)}
                    />
                    <StatTile
                      label="Победы"
                      value={selectedPlayer.profile.battleStats.wins}
                    />
                    <StatTile
                      label="Поражения"
                      value={selectedPlayer.profile.battleStats.losses}
                    />
                    <StatTile
                      label="Процент побед"
                      value={getWinRate(
                        selectedPlayer.profile.battleStats.wins,
                        selectedPlayer.profile.battleStats.losses
                      )}
                    />
                    <StatTile
                      label="Железные"
                      value={selectedPlayer.profile.ironTracks}
                    />
                    <StatTile
                      label="Золотые"
                      value={selectedPlayer.profile.goldTracks}
                    />
                    <StatTile
                      label="Свободный опыт"
                      value={selectedPlayer.profile.freeXp}
                    />
                    <StatTile
                      label="Копии карт"
                      value={getOwnedCopyTotal(selectedPlayer.profile)}
                    />
                    <StatTile
                      label="Открытые штабы"
                      value={selectedPlayer.profile.unlockedHeadquartersIds.length}
                    />
                    <StatTile
                      label="Исследованные карты"
                      value={selectedPlayer.profile.researchedCardIds.length}
                    />
                    <StatTile
                      label="Сохранённые колоды"
                      value={selectedPlayer.profile.savedDecks.length}
                    />
                  </div>

                  <div style={styles.headquartersStatsWrap}>
                    <h4 style={styles.subsectionTitle}>Статистика по штабам</h4>
                    {selectedHeadquartersStats.length > 0 ? (
                      <div style={styles.headquartersStatsGrid}>
                        {selectedHeadquartersStats.map((item) => (
                          <div key={item.headquartersId} style={styles.hqStatsCard}>
                            <div style={styles.hqStatsTitle}>{item.title}</div>
                            <div style={styles.hqStatsRows}>
                              <span>Матчи: {item.matches}</span>
                              <span>
                                {item.wins} побед / {item.losses} поражений
                              </span>
                              <span>Опыт штаба: {item.xp}</span>
                              <span>
                                {item.unlocked
                                  ? "Куплен"
                                  : item.researched
                                    ? "Исследован"
                                    : "Не открыт"}
                              </span>
                            </div>
                          </div>
                        ))}
                      </div>
                    ) : (
                      <div style={styles.muted}>Игрок ещё не играл на штабах.</div>
                    )}
                  </div>
                </div>
              ) : (
                <div style={styles.statsHint}>
                  Выберите игрока в таблице ниже, чтобы увидеть его статистику по штабам.
                </div>
              )}
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

function StatTile({ label, value }: { label: string; value: number | string }) {
  return (
    <div style={styles.statTile}>
      <div style={styles.statValue}>{value}</div>
      <div style={styles.statLabel}>{label}</div>
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
  statsPanel: {
    padding: 18,
    marginBottom: 16,
    background: "rgba(12,13,11,0.78)",
    boxShadow: "inset 0 0 0 1px rgba(216,174,92,0.18)",
  },
  statsHint: {
    color: "rgba(244,229,191,0.62)",
    fontSize: 13,
    fontWeight: 800,
  },
  statsGrid: {
    display: "grid",
    gridTemplateColumns: "repeat(auto-fit, minmax(130px, 1fr))",
    gap: 10,
  },
  statTile: {
    minHeight: 74,
    padding: "12px 14px",
    background:
      "linear-gradient(180deg, rgba(30,31,27,0.78), rgba(8,9,7,0.74))",
    boxShadow: "inset 0 0 0 1px rgba(216,174,92,0.12)",
  },
  statValue: {
    color: "#f4d37e",
    fontFamily: "var(--font-display)",
    fontSize: 27,
    fontWeight: 700,
    lineHeight: 1,
  },
  statLabel: {
    marginTop: 7,
    color: "rgba(244,229,191,0.65)",
    fontSize: 11,
    fontWeight: 900,
    letterSpacing: "0.07em",
    textTransform: "uppercase",
  },
  playerDetailPanel: {
    marginTop: 16,
    padding: 16,
    background: "rgba(5,7,6,0.52)",
    boxShadow: "inset 0 0 0 1px rgba(216,174,92,0.12)",
  },
  playerDetailHeader: {
    display: "flex",
    alignItems: "flex-start",
    justifyContent: "space-between",
    gap: 14,
    marginBottom: 14,
  },
  playerDetailTitle: {
    margin: 0,
    color: "#fff1bf",
    fontFamily: "var(--font-display)",
    fontSize: 28,
    fontWeight: 700,
    letterSpacing: "0.07em",
    textTransform: "uppercase",
  },
  playerDetailBadges: {
    display: "flex",
    gap: 8,
    flexWrap: "wrap",
    justifyContent: "flex-end",
  },
  badge: {
    padding: "6px 9px",
    color: "#f4d37e",
    background: "rgba(216,174,92,0.1)",
    boxShadow: "inset 0 0 0 1px rgba(216,174,92,0.2)",
    fontSize: 11,
    fontWeight: 900,
    letterSpacing: "0.07em",
    textTransform: "uppercase",
  },
  playerDetailGrid: {
    display: "grid",
    gridTemplateColumns: "repeat(auto-fit, minmax(120px, 1fr))",
    gap: 8,
  },
  headquartersStatsWrap: {
    marginTop: 16,
  },
  subsectionTitle: {
    margin: "0 0 10px",
    color: "#d6ad53",
    fontFamily: "var(--font-display)",
    fontSize: 20,
    fontWeight: 700,
    letterSpacing: "0.08em",
    textTransform: "uppercase",
  },
  headquartersStatsGrid: {
    display: "grid",
    gridTemplateColumns: "repeat(auto-fit, minmax(230px, 1fr))",
    gap: 10,
  },
  hqStatsCard: {
    padding: 12,
    background: "rgba(15,16,13,0.72)",
    boxShadow: "inset 0 0 0 1px rgba(216,174,92,0.12)",
  },
  hqStatsTitle: {
    color: "#fff1bf",
    fontFamily: "var(--font-display)",
    fontSize: 17,
    fontWeight: 700,
    letterSpacing: "0.06em",
    textTransform: "uppercase",
  },
  hqStatsRows: {
    display: "grid",
    gap: 4,
    marginTop: 8,
    color: "rgba(244,229,191,0.72)",
    fontSize: 13,
    fontWeight: 700,
  },
  supportTicketsPanel: {
    padding: 18,
    marginBottom: 16,
    background: "rgba(12,13,11,0.78)",
    boxShadow: "inset 0 0 0 1px rgba(216,174,92,0.18)",
  },
  supportTicketList: {
    display: "grid",
    gridTemplateColumns: "repeat(auto-fit, minmax(310px, 1fr))",
    gap: 12,
  },
  supportTicketCard: {
    padding: 14,
    background:
      "linear-gradient(180deg, rgba(30,31,27,0.82), rgba(8,9,7,0.76))",
    boxShadow: "inset 0 0 0 1px rgba(216,174,92,0.14)",
  },
  supportTicketHeader: {
    display: "flex",
    justifyContent: "space-between",
    gap: 12,
    alignItems: "flex-start",
  },
  supportTicketTitle: {
    color: "#fff1bf",
    fontFamily: "var(--font-display)",
    fontSize: 18,
    fontWeight: 700,
    letterSpacing: "0.06em",
    textTransform: "uppercase",
  },
  supportTicketDate: {
    color: "rgba(244,229,191,0.58)",
    fontSize: 12,
    fontWeight: 800,
    whiteSpace: "nowrap",
  },
  supportTicketMeta: {
    marginTop: 10,
    color: "rgba(244,229,191,0.7)",
    fontSize: 13,
    fontWeight: 700,
  },
  supportTicketMessage: {
    margin: "12px 0",
    whiteSpace: "pre-wrap",
    color: "rgba(255,246,221,0.92)",
    fontSize: 14,
    lineHeight: 1.48,
    fontWeight: 650,
  },
  supportTicketFooter: {
    display: "flex",
    justifyContent: "space-between",
    gap: 12,
    color: "rgba(244,229,191,0.48)",
    fontSize: 11,
    fontWeight: 800,
    textTransform: "uppercase",
    overflow: "hidden",
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
