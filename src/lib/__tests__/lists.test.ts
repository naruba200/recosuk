import { describe, expect, it } from 'vitest'
import type { SupabaseClient } from '@supabase/supabase-js'
import {
  addToList,
  createList,
  deleteList,
  listsContainingSet,
  loadListsContainingSets,
  loadListItems,
  loadLists,
  removeFromList,
  renameList,
} from '../lists'
import { FakeDb } from './fakeSupabase'

function client(db: FakeDb): SupabaseClient {
  return db as unknown as SupabaseClient
}

describe('lists service (M5)', () => {
  it('creates lists and loads them newest-first', async () => {
    const db = new FakeDb({
      lists: [
        { id: 'old', user_id: 'u1', name: 'Old', is_public: false, created_at: '2026-01-01T00:00:00Z' },
        { id: 'new', user_id: 'u1', name: 'New', is_public: false, created_at: '2026-01-02T00:00:00Z' },
        { id: 'other', user_id: 'u2', name: 'Someone else', is_public: false, created_at: '2026-01-03T00:00:00Z' },
      ],
    })
    const lists = await loadLists(client(db), 'u1')
    expect(lists.map((l) => l.name)).toEqual(['New', 'Old'])

    const created = await createList(client(db), 'u1', '  Fresh list  ')
    expect(created.name).toBe('Fresh list')
    expect(created.is_public).toBe(false)
    expect((await loadLists(client(db), 'u1')).map((l) => l.id)).toContain(created.id)
  })

  it('rejects an empty list name', async () => {
    const db = new FakeDb()
    await expect(createList(client(db), 'u1', '   ')).rejects.toThrow('Give the list a name')
  })

  it('renames and deletes lists', async () => {
    const db = new FakeDb({
      lists: [{ id: 'l1', user_id: 'u1', name: 'Before', is_public: false, created_at: '2026-01-01T00:00:00Z' }],
    })
    const renamed = await renameList(client(db), 'l1', 'After')
    expect(renamed.name).toBe('After')
    expect((await loadLists(client(db), 'u1'))[0].name).toBe('After')

    await deleteList(client(db), 'l1')
    expect(await loadLists(client(db), 'u1')).toEqual([])
  })

  it('adds items deduped per list, in insertion order', async () => {
    const db = new FakeDb({
      lists: [{ id: 'l1', user_id: 'u1', name: 'L', is_public: false, created_at: '2026-01-01T00:00:00Z' }],
    })
    await addToList(client(db), { listId: 'l1', beatmapsetId: 10, beatmapId: 100, mode: 'mania' })
    await addToList(client(db), { listId: 'l1', beatmapsetId: 10, beatmapId: 100, mode: 'mania' })
    await addToList(client(db), { listId: 'l1', beatmapsetId: 20, beatmapId: 200, mode: 'osu' })
    const items = await loadListItems(client(db), 'l1')
    expect(items.map((i) => i.beatmapset_id)).toEqual([10, 20])
    expect(items[0].mode).toBe('mania')
    expect(items[1].mode).toBe('osu')
  })

  it('removes items from a list', async () => {
    const db = new FakeDb({
      lists: [{ id: 'l1', user_id: 'u1', name: 'L', is_public: false, created_at: '2026-01-01T00:00:00Z' }],
      list_items: [
        { id: 'i1', list_id: 'l1', beatmapset_id: 10, beatmap_id: 100, mode: 'mania', added_at: '2026-01-01T00:00:00Z' },
        { id: 'i2', list_id: 'l1', beatmapset_id: 20, beatmap_id: 200, mode: 'mania', added_at: '2026-01-02T00:00:00Z' },
      ],
    })
    await removeFromList(client(db), 'l1', 10)
    expect((await loadListItems(client(db), 'l1')).map((i) => i.beatmapset_id)).toEqual([20])
  })

  it('listsContainingSet returns only the caller’s own lists holding the set', async () => {
    const db = new FakeDb({
      lists: [
        { id: 'mine-1', user_id: 'u1', name: 'A', is_public: false, created_at: '2026-01-01T00:00:00Z' },
        { id: 'mine-2', user_id: 'u1', name: 'B', is_public: false, created_at: '2026-01-01T00:00:00Z' },
        { id: 'theirs', user_id: 'u2', name: 'C', is_public: true, created_at: '2026-01-01T00:00:00Z' },
      ],
      list_items: [
        { id: 'i1', list_id: 'mine-1', beatmapset_id: 7, beatmap_id: 70, mode: 'mania', added_at: '2026-01-01T00:00:00Z' },
        { id: 'i2', list_id: 'theirs', beatmapset_id: 7, beatmap_id: 70, mode: 'mania', added_at: '2026-01-01T00:00:00Z' },
      ],
    })
    expect(await listsContainingSet(client(db), 'u1', 7)).toEqual(['mine-1'])
    expect(await listsContainingSet(client(db), 'u1', 999)).toEqual([])
  })

  it('loadListsContainingSets batches many sets into one lookup, own lists only', async () => {
    const db = new FakeDb({
      lists: [
        { id: 'mine-1', user_id: 'u1', name: 'A', is_public: false, created_at: '2026-01-01T00:00:00Z' },
        { id: 'mine-2', user_id: 'u1', name: 'B', is_public: false, created_at: '2026-01-01T00:00:00Z' },
        { id: 'theirs', user_id: 'u2', name: 'C', is_public: true, created_at: '2026-01-01T00:00:00Z' },
      ],
      list_items: [
        { id: 'i1', list_id: 'mine-1', beatmapset_id: 7, beatmap_id: 70, mode: 'mania', added_at: '2026-01-01T00:00:00Z' },
        { id: 'i2', list_id: 'mine-2', beatmapset_id: 7, beatmap_id: 70, mode: 'mania', added_at: '2026-01-01T00:00:00Z' },
        { id: 'i3', list_id: 'mine-1', beatmapset_id: 20, beatmap_id: 200, mode: 'mania', added_at: '2026-01-01T00:00:00Z' },
        { id: 'i4', list_id: 'theirs', beatmapset_id: 30, beatmap_id: 300, mode: 'mania', added_at: '2026-01-01T00:00:00Z' },
      ],
    })
    const map = await loadListsContainingSets(client(db), 'u1', [7, 20, 30, 999, 7])
    expect(map.get(7)).toEqual(['mine-1', 'mine-2'])
    expect(map.get(20)).toEqual(['mine-1'])
    expect(map.has(30)).toBe(false)
    expect(map.has(999)).toBe(false)
    expect(map.size).toBe(2)
  })

  it('loadListsContainingSets returns an empty map for no ids or no lists', async () => {
    const db = new FakeDb({
      lists: [{ id: 'mine-1', user_id: 'u1', name: 'A', is_public: false, created_at: '2026-01-01T00:00:00Z' }],
      list_items: [
        { id: 'i1', list_id: 'mine-1', beatmapset_id: 7, beatmap_id: 70, mode: 'mania', added_at: '2026-01-01T00:00:00Z' },
      ],
    })
    expect((await loadListsContainingSets(client(db), 'u1', [])).size).toBe(0)
    expect((await loadListsContainingSets(client(db), 'u2', [7])).size).toBe(0)
  })

  it('throws a readable error when Supabase is not connected', async () => {
    await expect(loadLists(null, 'u1')).rejects.toThrow('Supabase is not connected')
    await expect(createList(null, 'u1', 'x')).rejects.toThrow('Supabase is not connected')
  })
})
