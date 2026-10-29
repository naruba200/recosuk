import type { GameMode } from './mode'
import { isGameMode } from './mode'
import { proxyCall } from './osu'
import { dataCache, type DataCache } from './dataCache'

/**
 * lazer user tags (batch 11, part 4): the FIXED vocabulary of
 * player-voted tags describing a beatmap's patterns / required
 * skillsets. Distinct from mapper tags (`SearchBeatmapset.tags`,
 * free text the mapper typed): user tags are voted in lazer after a
 * C grade or better and display after >=5 upvotes, and the beatmap
 * listing filters them server-side with `tag="{name}"` in the
 * search query (osu! wiki, "Beatmap tags").
 *
 * Vocabulary source: the official wiki tables at
 * https://osu.ppy.sh/wiki/da/Beatmap/Beatmap_tags (read 2026-10-29,
 * English rendering). Group + name + description are transcribed
 * from those tables — nothing is recalled or invented. The wiki
 * renders per-mode applicability as mode ICONS only, so no
 * applicability data could be read from the page: every bundled
 * tag has `modes: null` (unknown), and `tagsForMode` therefore
 * includes it in ALL modes, plainly commented at the type. The
 * LIVE `GET /tags` response is the only source of per-mode
 * applicability: when it carries mode data, `normalizeUserTags`
 * records it and the picker filters on it.
 *
 * The live response shape is NOT documented: `normalizeUserTags`
 * accepts a top-level array, `{tags: [...]}`, `{data: [...]}`
 * (plus grouped / map forms) and returns null for anything
 * unrecognised, so `loadUserTags` falls back to the bundled
 * vocabulary instead of crashing or inventing tags. Until the
 * Edge Function is redeployed with the `getBeatmapUserTags`
 * action, the proxy answers 400 and the same fallback applies —
 * filtering still works, because it only needs the (already
 * deployed) `searchBeatmapsets` action carrying the `tag="..."`
 * clause in `q`.
 */

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface UserTag {
  /** Full tag id as used in the search clause: "group/name". */
  id: string
  /** Category from the wiki tables (e.g. "skillset", "style"). */
  group: string
  /** Tag name within its group (e.g. "chordjack", "back and forth"). */
  name: string
  /** Wiki description of what the tag means. */
  description: string
  /**
   * Modes this tag applies to, from the LIVE `GET /tags` response
   * only. `null` = applicability unknown (every bundled tag, and
   * any live tag whose payload carries no usable mode data):
   * unknown tags are included in ALL modes, never dropped for
   * lack of mode data.
   */
  modes: GameMode[] | null
}

/** Wiki table order. "other" is not a wiki group: it only holds
 *  live items that arrive without any group information. */
export const USER_TAG_GROUPS: { id: string; label: string }[] = [
  { id: 'skillset', label: 'Skillset' },
  { id: 'jumps', label: 'Jumps' },
  { id: 'streams', label: 'Streams' },
  { id: 'tech', label: 'Tech' },
  { id: 'reading', label: 'Reading' },
  { id: 'gimmick', label: 'Gimmick' },
  { id: 'style', label: 'Style' },
  { id: 'expression', label: 'Expression' },
  { id: 'sliders', label: 'Sliders' },
  { id: 'additions', label: 'Additions' },
  { id: 'meta', label: 'Meta' },
  { id: 'context', label: 'Context' },
  { id: 'other', label: 'Other' },
]

export function userTagGroupLabel(group: string): string {
  const known = USER_TAG_GROUPS.find((g) => g.id === group)
  if (known) return known.label
  return group.charAt(0).toUpperCase() + group.slice(1)
}

// ---------------------------------------------------------------------------
// Bundled fallback vocabulary (wiki tables, 2026-10-29)
// ---------------------------------------------------------------------------

/** [group, name, description] — wiki order within each group.
 *  Where the wiki lists the same tag twice with different
 *  descriptions (per-mode variants), the descriptions are joined
 *  with " / " and the tag appears once. */
const BUNDLED_TUPLES: [string, string, string][] = [
  // Skillset
  ["skillset", "jumps", "Focuses heavily on jumps, i.e. circles spaced far apart that require the player to move towards, slow down to hit, then speed up to move towards the next object."],
  ["skillset", "streams", "Patterns requiring continuous note hits, typically more than 9 notes."],
  ["skillset", "alt", "Colloquial term for maps which use rhythms that encourage the player to alternate notes. Typically distinct from burst or stream maps."],
  ["skillset", "tech", "Tests uncommon skills. / A map that frequently makes use of complex snaps. / A map with the focus on lots of 1/4 sliders, hypersliders and stacks."],
  ["skillset", "precision", "Colloquial term for maps which require fine, precise movement to aim correctly or catch fruits. Typically refers to maps with circle sizes above and including 6."],
  ["skillset", "reading", "Tests a player's reading skill, i.e. patterns that obfuscate note order and/or timing."],
  ["skillset", "gimmick", "Distinct or obscure gameplay elements that cannot be categorised with common skillsets."],
  ["skillset", "speedjack", "Maps that feature shorter jack sequences, characterized by the faster timeframe between consecutive stacked notes."],
  ["skillset", "wristjack", "Fast and/or fairly dense chordjack maps, whose optimal playing technique involves the use of the player's wrist movements."],
  // Jumps
  ["jumps", "sharp", "Patterns with heavy use of sharp angle movement."],
  ["jumps", "wide", "Patterns with heavy use of wide angle movement."],
  ["jumps", "linear", "Patterns that require the player to move continuously in a straight or nearly straight line."],
  ["jumps", "triangles", "Frequent use of triangular patterns."],
  ["jumps", "squares", "Frequent use of square patterns."],
  ["jumps", "stars", "Frequent use of star/pentagon patterns."],
  ["jumps", "back and forth", "Frequent use of back and forth patterns."],
  ["jumps", "freeform", "Frequent use of jumps without distinct patterning."],
  ["jumps", "cross-screen", "Frequent use of jumps with a lot of spacing, usually placed on opposite sides of the playfield."],
  ["jumps", "stamina", "Tests a player's ability to aim spaced jumps over long periods of time."],
  // Streams
  ["streams", "doubles", "Patterns requiring consecutively tapping 2 note groups."],
  ["streams", "quads", "Patterns requiring consecutively tapping 4 note groups."],
  ["streams", "bursts", "Patterns requiring consecutively tapping 5-9 note groups."],
  ["streams", "stamina", "Tests a player's ability to tap dense rhythms over long periods of time."],
  ["streams", "speed", "A map that requires constant tapping at high BPMs."],
  ["streams", "flow aim", "Patterns with fully continuous cursor movement, usually due to a combination of wide angles and little time between objects."],
  ["streams", "spaced streams", "Streams with large spacing, typically ones where the notes don't overlap."],
  ["streams", "cutstreams", "Streams in which the spacing of certain notes is much larger than the rest of the stream."],
  // Tech
  ["tech", "slider tech", "Tests uncommon skills involving sliders, such as heavy use of kicksliders or aim on complex slidershapes."],
  ["tech", "aim control", "Patterns with velocity or direction changes which strongly go against a player's natural movement pattern."],
  ["tech", "finger control", "Uses complex applications of rhythms in order to test the player's tapping ability."],
  ["tech", "complex snap", "Maps that feature prominent usage of mixed or unusual snap divisors."],
  ["tech", "antiflow", "A map focused on strong direction or velocity changes that go against a player's natural movement pattern."],
  ["tech", "flow", "A map focused on natural and intuitive movement patterns."],
  ["tech", "hyperwalks", "A map which makes use of hyperdashes that require the player to walk, as otherwise, you will overshoot them."],
  ["tech", "jump", "A map that focuses on 1/2 constant dashes or hyperdashes."],
  ["tech", "technical hybrid", "Maps that feature the combination of both technical rice and Long Notes patterning."],
  ["tech", "wiggles", "A map with a focus on quick directional changes."],
  // Reading
  ["reading", "overlaps", "Contains patterns where overlapped objects make determining note order and/or timing difficult."],
  ["reading", "perfect stacks", "Features perfectly overlapped stacked notes using low stack leniency."],
  ["reading", "visually dense", "Contains patterns where the amount of visible notes makes determining note order and/or timing difficult."],
  // Gimmick
  ["gimmick", "aspire", "Uses glitches to provide gameplay or visual effects that are otherwise impossible to achieve, originating from the annual Aspire mapping contest."],
  ["gimmick", "tag", "Includes gameplay designed for the multiplayer tag mode, where multiple players complete a map co-operatively."],
  ["gimmick", "2B", "Includes gameplay elements with two or more objects placed simultaneously. The term originates from a Chinese transliteration of 'idiot'."],
  ["gimmick", "memory", "A map designed around a memorization concept."],
  ["gimmick", "storyboard", "Includes a storyboard that changes how the map is played, usually by changing a map's visuals by using storyboard elements in place of showing the map's hit objects."],
  ["gimmick", "video", "Employs patterning that closely references the included background video."],
  ["gimmick", "playfield constraint", "Restricts object placement to a certain part of the playfield."],
  ["gimmick", "circle only", "Restricts object choice to circles only."],
  ["gimmick", "slider only", "Restricts object choice to sliders only."],
  ["gimmick", "ninja spinners", "Features spinners that are very short in duration."],
  ["gimmick", "barlines", "A map that makes use of barlines to enhance visuals or replace notes."],
  ["gimmick", "delay", "Maps that feature high snap streams based on the song's delayed sound effect."],
  ["gimmick", "dodge the beat", "A map where the player needs to avoid every object."],
  ["gimmick", "LN inverse", "Maps that feature long note holds that emphasize constant holds and releases in quick succession. Most distinct feature of Inverse is the \"negative spaces\" in the patterning."],
  ["gimmick", "long sliders", "A map that uses sliders for an extended period of time, having regular gameplay around catching juice drops and droplets instead of fruits."],
  ["gimmick", "mirrored", "A map that features patterns that are mirrored on an axes in quick successions."],
  ["gimmick", "no hyperdashes", "A map that does not use hyperdashes even if allowed for its respective difficulty."],
  ["gimmick", "reversed", "A map using reversed patterns in a regularly consecutive manner."],
  ["gimmick", "spinner-heavy", "A map that features heavy usage of spinners."],
  ["gimmick", "yellow notes", "A map featuring frequent use of extremely short sliders to simulate ghost notes."],
  // Style
  ["style", "symmetrical", "Employs symmetry within the map design, often mirroring elements along the vertical centreline."],
  ["style", "distance snap", "Uses osu's in-built distance snap feature for most/all of the map."],
  ["style", "grid snap", "Objects are placed along a square grid, typically using osu!'s built-in grid snap feature."],
  ["style", "hexgrid", "Objects are placed along a hexagonal grid."],
  ["style", "geometric", "Incorporates geometric shapes within the map's visual design."],
  ["style", "clean", "Visually uncluttered and organised patterns, often involving few overlaps and equal visual spacing between objects."],
  ["style", "freeform", "An unrestrained and loose approach towards visual structure."],
  ["style", "messy", "Visually chaotic and intentionally disorganised patterns, often involving many overlaps and unequal visual spacing between objects."],
  ["style", "avant-garde", "Employs boundary-pushing and experimental philosophies to map design, often foregoing gameplay and aesthetic conventions to extreme measures."],
  ["style", "chordjack", "Maps that feature evenly spaced chords, with several consecutive notes stacked on the same columns."],
  ["style", "chordstream", "Maps that make use of streams with a mix of differently-sized chords."],
  ["style", "convert", "A map that imitates the converted maps from osu!. / A map that imitates the converted maps from osu!, where the structure and distances are irregular."],
  ["style", "double bpm", "A map that plays at double the speed than what the BPM indicates."],
  ["style", "dump", "Maps that use groups of objects focusing more on the extension and intensity of the sounds, in contrast with using individual notes to follow each's sound timing accurately."],
  ["style", "finisher-heavy", "Features finishers used in an unconventional manner or in large amounts."],
  ["style", "generic hybrid", "Maps that feature the combination of both straightforward rice and Long Notes patterning."],
  ["style", "handstream", "Stream with a mix of 3-note sized chords."],
  ["style", "jumpstream", "Stream with a mix of 2-note sized chords."],
  ["style", "LN coordination", "Maps which require holding multiple long notes simultaneously while hitting other patterns."],
  ["style", "LN density", "Maps that feature dense long note streams without breaks."],
  ["style", "LN mixed", "Maps that make use of multiple long note patterning styles."],
  ["style", "LN release", "Maps that make use of different long note holds ending."],
  ["style", "longjack", "Maps that feature long chains of consecutive notes on the same column."],
  ["style", "mixed rice", "Maps that make use of multiple rice patterning styles."],
  ["style", "mono-heavy", "Features monos used in large amounts."],
  ["style", "N+1", "A specific type of playstyle where the leftmost column is mapped independently from the rest of the columns, which otherwise form a standard playstyle."],
  ["style", "o2jam", "Map that mimics traditional mapping techniques usually found in O2jam charts."],
  ["style", "quadstream", "Stream with a mix of 4-note sized chords."],
  ["style", "taikosu", "A map designed with both osu! and osu!taiko in mind."],
  ["style", "tiebreaker", "Maps that contain most of the skill sets from different categories, and are usually longer than 5 minutes."],
  ["style", "tnt", "A map that imitates the mapping style in Taiko No Tatsujin."],
  ["style", "vocal", "Patterning that focuses mainly on vocals."],
  // Expression
  ["expression", "simple", "Accessible and straightforward map design."],
  ["expression", "difficulty spike", "Contains a sudden and significant increase in challenge within the map's gameplay."],
  ["expression", "high contrast", "Uses flashy ideas to follow changes in the music, creating stark differences between different sections of the song."],
  ["expression", "progression", "Contains a gradual advancement in difficulty or concept across the map."],
  ["expression", "repetition", "Features the use of recognizable identical patterns or gameplay elements."],
  ["expression", "iNiS-style", "A style originating from the original DS games, recognizable by its emphasis on vocal rhythm, constant slider velocity, and easily understandable grid-snapped patterns."],
  ["expression", "old-style revival", "Emulates a style closely associated with early mapping, typically to pay homage or invoke nostalgia."],
  ["expression", "inspo", "Maps that draw inspiration directly from other maps/mappers."],
  ["expression", "improvisation", "Uses patterns that do not correspond to sounds in the music, often using hitsounds to add sounds in. / A map that's based on full improvisation that works as additional layer to the song."],
  ["expression", "chaotic", "Unpredictable map design, often testing unusual skillsets."],
  ["expression", "playfield usage", "Includes deliberate use of the playfield within the map design."],
  ["expression", "conceptual", "Distinct map design choices that do not follow ordinary mapping conventions, typically to creatively express part of a song."],
  // Sliders
  ["sliders", "low sv", "Features prominent low slider velocity usage as a key part of map design."],
  ["sliders", "high sv", "Features prominent high slider velocity usage as a key part of map design."],
  ["sliders", "complex sv", "Changes slider velocity by large amounts in order to test the player's reading and aim ability. / Changes slider velocity by large amounts in order to test the player's reading ability."],
  ["sliders", "complex slidershapes", "Uses a large variety of slider designs."],
  // Additions
  ["additions", "combo colours", "Maps that adjust combo colours in conjunction with variations in the song, also referred to as colourhax."],
  ["additions", "keysounds", "Contains hitsounds that use various pitched samples to create a melody, typically following one within the song."],
  ["additions", "custom skin", "Utilizes custom skin elements and graphics."],
  ["additions", "hitsounds", "A map that makes use of non-default hitsound samplesets."],
  // Meta
  ["meta", "collab", "A map with two or more associated mappers."],
  ["meta", "mega collab", "A map with 8 or more associated mappers."],
  ["meta", "swing", "A song with prominent use of swing rhythms."],
  ["meta", "accelerating bpm", "A song featuring progressively increasing tempo."],
  ["meta", "variable timing", "Contains multiple timing points, usually required for songs not recorded to a metronome."],
  ["meta", "time signatures", "A song featuring many changes in time signature or uses an uncommon time signature."],
  ["meta", "multi-song", "A map containing multiple songs."],
  // Context
  ["context", "custom song", "Maps a song made specifically for the map. This includes songs created for a mapping contest which the map participated in."],
  ["context", "mapping contest", "An entry for a mapping contest."],
  ["context", "tournament custom", "A map created for a playing tournament."],
]

export const BUNDLED_USER_TAGS: UserTag[] = BUNDLED_TUPLES.map(([group, name, description]) => ({
  id: `${group}/${name}`,
  group,
  name,
  description,
  // Applicability unknown: the wiki renders it as icons only (see
  // module doc). Included in all modes — never dropped.
  modes: null,
}))

// ---------------------------------------------------------------------------
// Defensive normalisation of the undocumented GET /tags payload
// ---------------------------------------------------------------------------

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function firstString(record: Record<string, unknown>, keys: string[]): string | undefined {
  for (const key of keys) {
    const value = record[key]
    if (typeof value === 'string' && value.trim() !== '') return value.trim()
  }
  return undefined
}

/** osu! ruleset ids (0 osu, 1 taiko, 2 fruits, 3 mania) and display
 *  names, in addition to the API mode strings. Anything else is
 *  ignored — an unparseable mode list means "unknown", never "none". */
function parseModeValue(value: unknown): GameMode | null {
  if (typeof value === 'number' && Number.isInteger(value) && value >= 0 && value <= 3) {
    return (['osu', 'taiko', 'fruits', 'mania'] as const)[value]
  }
  if (typeof value !== 'string') return null
  const s = value.trim().toLowerCase()
  if (isGameMode(s)) return s
  if (s === 'standard' || s === 'osu!') return 'osu'
  if (s === 'catch') return 'fruits'
  return null
}

/** Parse a modes field (string, number, or array of either).
 *  Returns null when the field is absent OR when none of its
 *  entries parse — both mean applicability unknown. */
function parseModes(value: unknown): GameMode[] | null {
  if (value === undefined || value === null) return null
  const list = Array.isArray(value) ? value : [value]
  const out: GameMode[] = []
  for (const item of list) {
    const mode = parseModeValue(item)
    if (mode && !out.includes(mode)) out.push(mode)
  }
  return out.length > 0 ? out : null
}

function tagFromName(
  rawName: string,
  explicitGroup: string | undefined,
  description: string,
  modes: GameMode[] | null,
): UserTag | null {
  const trimmed = rawName.trim()
  if (trimmed === '') return null
  let group = explicitGroup?.trim()
  let name = trimmed
  if (name.includes('/')) {
    const slash = name.indexOf('/')
    if (!group) group = name.slice(0, slash).trim()
    name = name.slice(slash + 1).trim()
  }
  if (name === '') return null
  if (!group) group = 'other'
  return { id: `${group}/${name}`, group, name, description, modes }
}

const CHILD_KEYS = ['tags', 'data', 'items', 'children', 'values'] as const

function childList(record: Record<string, unknown>): unknown[] | undefined {
  for (const key of CHILD_KEYS) {
    const value = record[key]
    if (Array.isArray(value)) return value
  }
  return undefined
}

/** Collect tags from any payload fragment, recursing into
 *  wrappers, grouped containers and group→array maps. */
function collectFromValue(value: unknown, inheritedGroup: string | undefined, out: UserTag[]): void {
  if (typeof value === 'string') {
    const tag = tagFromName(value, inheritedGroup, '', null)
    if (tag) out.push(tag)
    return
  }
  if (Array.isArray(value)) {
    for (const item of value) collectFromValue(item, inheritedGroup, out)
    return
  }
  if (!isRecord(value)) return

  const children = childList(value)
  if (children) {
    const groupField = firstString(value, ['group', 'category', 'group_name', 'section'])
    const nameField = firstString(value, ['name', 'tag', 'label'])
    const description = firstString(value, ['description', 'desc', 'text'])
    // A record that IS a tag (it has a description) still emits
    // itself; a bare container (group name + child list, no
    // description) only contributes its group to the children.
    if (description !== undefined && nameField !== undefined) {
      const modes = parseModes(
        value.modes ?? value.rulesets ?? value.applicable_modes ??
          value.applicable_rulesets ?? value.game_modes ?? value.mode,
      )
      const tag = tagFromName(nameField, groupField ?? inheritedGroup, description, modes)
      if (tag) out.push(tag)
    }
    const containerGroup =
      groupField ?? (nameField && !description ? nameField : undefined) ?? inheritedGroup
    collectFromValue(children, containerGroup, out)
    return
  }

  // Group→array map: { skillset: [{...}, ...], style: [...] }.
  const entries = Object.entries(value)
  const hasTagKeys = entries.some(([k]) =>
    ['name', 'tag', 'label', 'group', 'category', 'description'].includes(k),
  )
  if (!hasTagKeys && entries.length > 0 && entries.some(([, v]) => Array.isArray(v))) {
    for (const [key, child] of entries) {
      if (Array.isArray(child)) collectFromValue(child, key, out)
    }
    return
  }

  const nameField = firstString(value, ['name', 'tag', 'label', 'title'])
  if (nameField === undefined) return
  const groupField = firstString(value, ['group', 'category', 'group_name', 'section'])
  const description = firstString(value, ['description', 'desc', 'text']) ?? ''
  const modes = parseModes(
    value.modes ?? value.rulesets ?? value.applicable_modes ??
      value.applicable_rulesets ?? value.game_modes ?? value.mode,
  )
  const tag = tagFromName(nameField, groupField ?? inheritedGroup, description, modes)
  if (tag) out.push(tag)
}

/**
 * Normalise a raw `GET /tags` payload into the vocabulary, or
 * null when the shape is unrecognised / carries no tags at all.
 * Never throws on malformed input, never invents a tag: an
 * unrecognised shape is the caller's signal to use the bundled
 * vocabulary. Duplicates (same "group/name") keep the first entry.
 */
export function normalizeUserTags(payload: unknown): UserTag[] | null {
  // Only an array or an object wrapper can be a vocabulary
  // payload. A bare string/number at the top level is malformed
  // (string items are only meaningful INSIDE a list).
  if (!Array.isArray(payload) && !isRecord(payload)) return null
  const collected: UserTag[] = []
  collectFromValue(payload, undefined, collected)
  if (collected.length === 0) return null
  const seen = new Set<string>()
  const out: UserTag[] = []
  for (const tag of collected) {
    if (seen.has(tag.id)) continue
    seen.add(tag.id)
    out.push(tag)
  }
  return out
}

// ---------------------------------------------------------------------------
// Picker helpers (pure)
// ---------------------------------------------------------------------------

/** Tags applicable to a mode. `'all'` (Mirror's all-modes tab) is
 *  the union: every tag, whatever its applicability. Tags with
 *  unknown applicability (`modes: null`) are included in every
 *  mode — never dropped for lack of mode data. */
export function tagsForMode(tags: readonly UserTag[], mode: GameMode | 'all'): UserTag[] {
  if (mode === 'all') return [...tags]
  return tags.filter((t) => t.modes === null || t.modes.length === 0 || t.modes.includes(mode))
}

export function findUserTag(tags: readonly UserTag[], id: string | null | undefined): UserTag | undefined {
  if (!id) return undefined
  return tags.find((t) => t.id === id)
}

export interface GroupedUserTags {
  group: string
  label: string
  tags: UserTag[]
}

/** Group tags in wiki order; groups the vocabulary does not know
 *  follow in first-seen order, with "other" last. */
export function groupUserTags(tags: readonly UserTag[]): GroupedUserTags[] {
  const order = new Map(USER_TAG_GROUPS.map((g, i) => [g.id, i]))
  const byGroup = new Map<string, UserTag[]>()
  for (const tag of tags) {
    const list = byGroup.get(tag.group) ?? []
    list.push(tag)
    byGroup.set(tag.group, list)
  }
  const groups = [...byGroup.keys()].sort((a, b) => {
    if (a === 'other') return 1
    if (b === 'other') return -1
    const ai = order.get(a)
    const bi = order.get(b)
    if (ai !== undefined && bi !== undefined) return ai - bi
    if (ai !== undefined) return -1
    if (bi !== undefined) return 1
    return a.localeCompare(b)
  })
  return groups.map((group) => ({
    group,
    label: userTagGroupLabel(group),
    tags: byGroup.get(group) ?? [],
  }))
}

// ---------------------------------------------------------------------------
// Server-side filter clause
// ---------------------------------------------------------------------------

/**
 * The exact listing-filter clause for one tag, per the wiki:
 * `tag="group/name"`. Embedded double quotes are stripped so a
 * tag id can never break out of the quoted clause. An empty /
 * missing id yields '' (no filter).
 */
export function userTagQueryClause(tagId: string | null | undefined): string {
  if (!tagId) return ''
  const clean = tagId.replace(/"/g, '').trim()
  if (clean === '') return ''
  return `tag="${clean}"`
}

/** Append the tag clause to a search query string (space-joined,
 *  clause last). No tag selected → the query is returned as-is. */
export function appendUserTagClause(queryText: string, tagId: string | null | undefined): string {
  const clause = userTagQueryClause(tagId)
  if (clause === '') return queryText
  return queryText === '' ? clause : `${queryText} ${clause}`
}

// ---------------------------------------------------------------------------
// Live vocabulary load (proxy, with bundled fallback)
// ---------------------------------------------------------------------------

export const USER_TAGS_CACHE_TTL_MS = 24 * 60 * 60 * 1000
export const USER_TAGS_FALLBACK_TTL_MS = 5 * 60 * 1000
const USER_TAGS_CACHE_KEY = 'user-tags'

let inflight: Promise<UserTag[]> | null = null

/** Test hook: drop the cached vocabulary + any in-flight load. */
export function resetUserTagsCache(cache: DataCache = dataCache): void {
  cache.delete(USER_TAGS_CACHE_KEY)
  inflight = null
}

/**
 * The vocabulary for the picker: the live `GET /tags` result when
 * the proxy serves a recognisable shape, the bundled wiki
 * vocabulary otherwise (proxy not redeployed yet, network
 * failure, or an unrecognised shape). A live vocabulary caches
 * for 24h (it barely changes); a fallback caches for 5 minutes,
 * so a redeploy is picked up promptly. Never rejects: the worst
 * case is the bundled vocabulary.
 */
export async function loadUserTags(opts: {
  call?: typeof proxyCall
  cache?: DataCache
} = {}): Promise<UserTag[]> {
  const cache = opts.cache ?? dataCache
  const cached = cache.get<UserTag[]>(USER_TAGS_CACHE_KEY)
  if (cached) return cached
  const isDefaultPath = opts.call === undefined && opts.cache === undefined
  if (isDefaultPath && inflight) return inflight

  const run = (async (): Promise<UserTag[]> => {
    try {
      const call = opts.call ?? proxyCall
      const raw = await call<unknown>('getBeatmapUserTags', {})
      const live = normalizeUserTags(raw)
      if (live) {
        cache.set(USER_TAGS_CACHE_KEY, live, USER_TAGS_CACHE_TTL_MS)
        return live
      }
    } catch {
      /* proxy not redeployed / network — bundled fallback below */
    }
    cache.set(USER_TAGS_CACHE_KEY, BUNDLED_USER_TAGS, USER_TAGS_FALLBACK_TTL_MS)
    return BUNDLED_USER_TAGS
  })()
  if (isDefaultPath) {
    inflight = run
    void run.then(
      () => { if (inflight === run) inflight = null },
      () => { if (inflight === run) inflight = null },
    )
  }
  return run
}
