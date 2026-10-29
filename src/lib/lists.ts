import type { SupabaseClient } from '@supabase/supabase-js'
import type { GameMode } from './mode'

/**
 * User lists (M5, PLAN-v2 §M5): CRUD + list items, over Supabase
 * with the RLS policies from migration 001 (own rows only; public
 * lists readable). Guests never reach these functions — the UI
 * gates on tier, and guests have no auth user to write rows for.
 *
 * `is_public` stays at its default (private) everywhere: public
 * list sharing is the M5 stretch goal and is explicitly skipped.
 *
 * Every function takes the client explicitly (null = unconfigured)
 * and throws an Error with the Supabase message on failure, so
 * callers can show it honestly instead of a fake success.
 */

export interface UserList {
  id: string
  user_id: string
  name: string
  is_public: boolean
  created_at: string
}

export interface ListItemRow {
  id: string
  list_id: string
  beatmapset_id: number
  beatmap_id: number | null
  mode: GameMode | null
  added_at: string
}

type DbError = { message: string } | null

function requireClient(client: SupabaseClient | null): SupabaseClient {
  if (!client) throw new Error('Supabase is not connected — lists need an account on a configured project.')
  return client
}

function throwIf(error: DbError, what: string): void {
  if (error) throw new Error(`${what}: ${error.message}`)
}

export async function loadLists(
  client: SupabaseClient | null,
  userId: string,
): Promise<UserList[]> {
  const db = requireClient(client)
  const { data, error } = await db
    .from('lists')
    .select('id, user_id, name, is_public, created_at')
    .eq('user_id', userId)
    .order('created_at', { ascending: false })
  throwIf(error, 'Could not load your lists')
  return (data ?? []) as UserList[]
}

export async function createList(
  client: SupabaseClient | null,
  userId: string,
  name: string,
): Promise<UserList> {
  const db = requireClient(client)
  const trimmed = name.trim()
  if (!trimmed) throw new Error('Give the list a name first.')
  const { data, error } = await db
    .from('lists')
    .insert({ user_id: userId, name: trimmed })
    .select()
    .single()
  throwIf(error, 'Could not create the list')
  if (!data) throw new Error('Could not create the list: no row came back.')
  return data as UserList
}

export async function renameList(
  client: SupabaseClient | null,
  listId: string,
  name: string,
): Promise<UserList> {
  const db = requireClient(client)
  const trimmed = name.trim()
  if (!trimmed) throw new Error('Give the list a name first.')
  const { data, error } = await db
    .from('lists')
    .update({ name: trimmed })
    .eq('id', listId)
    .select()
    .single()
  throwIf(error, 'Could not rename the list')
  if (!data) throw new Error('Could not rename the list: no row came back.')
  return data as UserList
}

export async function deleteList(
  client: SupabaseClient | null,
  listId: string,
): Promise<void> {
  const db = requireClient(client)
  const { error } = await db.from('lists').delete().eq('id', listId)
  throwIf(error, 'Could not delete the list')
}

export async function loadListItems(
  client: SupabaseClient | null,
  listId: string,
): Promise<ListItemRow[]> {
  const db = requireClient(client)
  const { data, error } = await db
    .from('list_items')
    .select('id, list_id, beatmapset_id, beatmap_id, mode, added_at')
    .eq('list_id', listId)
    .order('added_at', { ascending: true })
  throwIf(error, 'Could not load the list')
  return (data ?? []) as ListItemRow[]
}

/**
 * Add a set to a list. Deduped by the (list_id, beatmapset_id)
 * unique constraint: re-adding the same set is a no-op returning
 * the existing row, never a duplicate.
 */
export async function addToList(
  client: SupabaseClient | null,
  input: {
    listId: string
    beatmapsetId: number
    beatmapId: number
    mode: GameMode
  },
): Promise<ListItemRow> {
  const db = requireClient(client)
  const { data, error } = await db
    .from('list_items')
    .upsert(
      {
        list_id: input.listId,
        beatmapset_id: input.beatmapsetId,
        beatmap_id: input.beatmapId,
        mode: input.mode,
      },
      { onConflict: 'list_id,beatmapset_id' },
    )
    .select()
    .single()
  throwIf(error, 'Could not save to the list')
  if (!data) throw new Error('Could not save to the list: no row came back.')
  return data as ListItemRow
}

export async function removeFromList(
  client: SupabaseClient | null,
  listId: string,
  beatmapsetId: number,
): Promise<void> {
  const db = requireClient(client)
  const { error } = await db
    .from('list_items')
    .delete()
    .eq('list_id', listId)
    .eq('beatmapset_id', beatmapsetId)
  throwIf(error, 'Could not remove from the list')
}

/**
 * Ids of the caller's lists containing this set — drives the
 * picker's checked state and the row's saved icon. Intersected
 * with the caller's own list ids client-side (the select itself
 * can also see public lists' items via RLS).
 */
export async function listsContainingSet(
  client: SupabaseClient | null,
  userId: string,
  beatmapsetId: number,
): Promise<string[]> {
  const db = requireClient(client)
  const lists = await loadLists(db, userId)
  const ownIds = new Set(lists.map((l) => l.id))
  if (ownIds.size === 0) return []
  const { data, error } = await db
    .from('list_items')
    .select('list_id')
    .eq('beatmapset_id', beatmapsetId)
  throwIf(error, 'Could not check your lists')
  const found = (data ?? []) as { list_id: string }[]
  return [...new Set(found.map((r) => r.list_id).filter((id) => ownIds.has(id)))]
}
