/**
 * How deep inside its own tile a thing stands.
 *
 * The world is drawn in 2.5D: the ground is flat, everything else is an
 * upright billboard, and what hides what is decided by the depth buffer alone.
 * A larger Z is nearer the camera, so a sprite one row further down the screen
 * naturally covers one further up — which is exactly the rule we want.
 *
 * The rule has one hole, and these two constants are what plug it: a
 * **character standing on the same row as a bush or a building**. With the same
 * offset for both, their quads land on the same plane, the depth test has
 * nothing to choose with, and which one wins flips from row to row — the
 * building covered the player on every other line. Characters are therefore
 * planted a hair in front of scenery, so a tie is impossible and the character
 * is never swallowed by the tile it is standing on.
 *
 * Objects on the rows *below* still cover the character, because a whole row
 * of depth dwarfs this nudge.
 */

/** Scenery: trees, bushes, huts. Slightly forward so the base reads as planted. */
export const OBJECT_Z = 0.9

/** Players and trainers, just in front of the scenery sharing their row. */
export const ACTOR_Z = 0.94
