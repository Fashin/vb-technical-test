import { ask, VirtualBrainError } from '../virtualbrain/client'
import { MAX_ROUNDS, sanitizeLine, type BattleFighter, type Side } from './engine'

/**
 * The chatbot's account of a fight, asked for once, before the first blow.
 *
 * Shared by the arena and by player duels: both want the same thing — one
 * attack and one line of commentary per side per round — and neither should
 * own the prompt. The engine then decides what that script actually does
 * (`engine.ts`), so nothing here can change the outcome of anything.
 *
 * Everything in the answer is treated as a suggestion. A missing field, a
 * bogus type, a script that stops after three rounds or plain prose instead of
 * JSON all fall back to improvised moves, so an unavailable or badly-prompted
 * model costs the fight its commentary instead of breaking it.
 */

export interface Script {
	intro: string
	/** Raw rounds, read lazily: each one is checked against the field it lands on. */
	rounds: unknown[]
	degraded: boolean
}

/** Pull the first JSON object out of whatever the model replied with. */
function extractJson(text: string): unknown {
	const start = text.indexOf('{')
	const end = text.lastIndexOf('}')
	if (start === -1 || end <= start) return null
	try {
		return JSON.parse(text.slice(start, end + 1))
	} catch {
		return null
	}
}

/**
 * The attacks a fighter really knows, spelled out for the model.
 *
 * Without it the model invents plausible-sounding moves, and the engine has to
 * take them: the fight then shows a Pokemon using something it cannot learn.
 * Given the real list, the script picks from it — and when PokeAPI gave us
 * nothing, nothing is claimed either.
 */
function describeMoves(fighter: BattleFighter): string {
	if (fighter.moves.length === 0) return ''
	const listed = fighter.moves
		.map((move) => `${move.name} (${move.type}, ${move.category}, ${move.power})`)
		.join(', ')
	return `\n  attaques connues : ${listed}`
}

function describeTeam(side: Side): string {
	return side.team
		.map(
			(f: BattleFighter) =>
				`- ${f.name} niveau ${f.level} (${f.types.join('/')}) — ${f.hp}/${f.maxHp} PV, Atq ${f.attack},` +
				` Déf ${f.defense}, Atq.Spé ${f.specialAttack}, Déf.Spé ${f.specialDefense}, Vit ${f.speed}` +
				describeMoves(f),
		)
		.join('\n')
}

/**
 * @param headline One line setting the scene, e.g. "Combat d'arène : A affronte B."
 */
export async function requestScript(player: Side, opponent: Side, headline: string): Promise<Script> {
	const opening = `${player.name} et ${opponent.name} entrent sur le terrain !`

	const query = [
		headline,
		'',
		`Équipe de ${player.name} (le premier entre en jeu, les suivants remplacent les K.O.) :`,
		describeTeam(player),
		'',
		`Équipe de ${opponent.name} (même règle) :`,
		describeTeam(opponent),
		'',
		`Écris le script complet du combat : ${MAX_ROUNDS} rounds au maximum, dans l’ordre.`,
		'Pour chaque round, choisis pour chaque camp une attaque prise dans la liste « attaques',
		'connues » du Pokémon qui combat, en recopiant son nom, son type, sa catégorie et sa',
		'puissance tels qu’ils sont donnés ; n’invente une attaque que si aucune liste n’est fournie.',
		'Puis écris',
		'UNE phrase de commentaire par attaque (20 mots maximum, au présent).',
		'Ne calcule ni les dégâts ni les PV et n’annonce aucun K.O. : le moteur du jeu s’en charge.',
		'',
		'Réponds uniquement par ce JSON, sans texte autour :',
		'{"intro":"une phrase d’ouverture","rounds":[{"player":{"move":{"name":"Lance-Flammes",' +
			'"type":"fire","category":"special","power":90},"line":"..."},"master":{"move":{"name":"Surf",' +
			'"type":"water","category":"special","power":90},"line":"..."}}]}',
		'',
		'Types acceptés : normal, fire, water, electric, grass, ice, fighting, poison, ground,',
		'flying, psychic, bug, rock, ghost, dragon, dark, steel, fairy.',
		'"category" vaut "physical" ou "special", "power" est un entier entre 10 et 120.',
	].join('\n')

	try {
		const answer = await ask(query)
		const parsed = extractJson(answer.text) as { intro?: unknown; rounds?: unknown } | null
		const rounds = Array.isArray(parsed?.rounds) ? parsed.rounds.slice(0, MAX_ROUNDS) : []

		return { intro: sanitizeLine(parsed?.intro, opening), rounds, degraded: rounds.length === 0 }
	} catch (cause) {
		// The fight keeps working without the chatbot; it just stops narrating.
		const reason = cause instanceof VirtualBrainError ? cause.code : 'unknown'
		console.warn('[battle] falling back to improvised moves:', reason)
		return { intro: opening, rounds: [], degraded: true }
	}
}
