/**
 * What the ranking is sorted on, as SQL.
 *
 * Shared rather than written twice: the leaderboard renders the standing and
 * `crowns.ts` reads the podium out of it, and two copies of this ORDER BY
 * would be two rankings the day one of them changed. Both expect the users
 * table aliased `u`.
 *
 * The order is the arena first — masters beaten is the one thing that cannot
 * be bought with time — then the Pokedex, then duels, then raw experience,
 * with the older account ahead when everything else ties.
 */
export const RANKING_SCORES = `(SELECT COUNT(*) FROM master_victories v WHERE v.user_id = u.id)          AS masters,
			        (SELECT COUNT(DISTINCT c.pokedex_id) FROM cards c WHERE c.user_id = u.id) AS dex_owned,
			        (SELECT COUNT(*) FROM duels d WHERE d.winner_id = u.id)                   AS duels,
			        (SELECT COALESCE(MAX(c.xp), 0) FROM cards c WHERE c.user_id = u.id)       AS best_xp`

export const RANKING_ORDER = `ORDER BY masters DESC, dex_owned DESC, duels DESC, best_xp DESC, u.created_at ASC`
