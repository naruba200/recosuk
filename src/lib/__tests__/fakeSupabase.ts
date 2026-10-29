/**
 * Minimal in-memory stand-in for the Supabase JS client, covering
 * exactly the query-builder surface the lists/feedback services
 * use (select/insert/upsert/update/delete + eq/order/single).
 * Lets the M5 service tests run with no network and no real
 * project. Column lists are ignored (full rows come back); RLS is
 * NOT simulated — the services are tested for query shape and
 * behaviour, RLS stays a migration concern.
 */

export type Row = Record<string, unknown>

type QueryResult = { data: unknown; error: { code?: string; message: string } | null }

export class FakeDb {
  tables: Record<string, Row[]> = {}
  private idCounter = 0

  constructor(seed: Record<string, Row[]> = {}) {
    this.tables = Object.fromEntries(
      Object.entries(seed).map(([k, rows]) => [k, rows.map((r) => ({ ...r }))]),
    )
  }

  nextId(table: string): string {
    return `fake-${table}-${++this.idCounter}-${Date.now()}`
  }

  from(table: string): FakeQuery {
    return new FakeQuery(this, table)
  }
}

class FakeQuery implements PromiseLike<QueryResult> {
  private op: 'select' | 'insert' | 'upsert' | 'update' | 'delete' = 'select'
  private payload: Row | null = null
  private patch: Row | null = null
  private onConflict: string | null = null
  private filters: Array<(r: Row) => boolean> = []
  private orderBy: { col: string; ascending: boolean } | null = null
  private wantSingle = false
  private db: FakeDb
  private table: string

  constructor(db: FakeDb, table: string) {
    this.db = db
    this.table = table
  }

  select(_cols?: string): this {
    return this
  }

  insert(payload: Row): this {
    this.op = 'insert'
    this.payload = payload
    return this
  }

  upsert(payload: Row, opts?: { onConflict?: string }): this {
    this.op = 'upsert'
    this.payload = payload
    this.onConflict = opts?.onConflict ?? null
    return this
  }

  update(patch: Row): this {
    this.op = 'update'
    this.patch = patch
    return this
  }

  delete(): this {
    this.op = 'delete'
    return this
  }

  eq(col: string, val: unknown): this {
    this.filters.push((r) => r[col] === val)
    return this
  }

  order(col: string, opts?: { ascending?: boolean }): this {
    this.orderBy = { col, ascending: opts?.ascending ?? true }
    return this
  }

  single(): this {
    this.wantSingle = true
    return this
  }

  then<TResult1 = QueryResult, TResult2 = never>(
    onFulfilled?: ((value: QueryResult) => TResult1 | PromiseLike<TResult1>) | null,
    onRejected?: ((reason: unknown) => TResult2 | PromiseLike<TResult2>) | null,
  ): Promise<TResult1 | TResult2> {
    return Promise.resolve(this.execute()).then(onFulfilled, onRejected)
  }

  private rows(): Row[] {
    const rows = this.db.tables[this.table]
    if (!rows) {
      this.db.tables[this.table] = []
      return this.db.tables[this.table]
    }
    return rows
  }

  private matched(): Row[] {
    let out = this.rows().filter((r) => this.filters.every((f) => f(r)))
    if (this.orderBy) {
      const { col, ascending } = this.orderBy
      out = [...out].sort((a, b) => {
        const av: unknown = a[col]
        const bv: unknown = b[col]
        if (av === bv) return 0
        if (av === undefined || av === null) return 1
        if (bv === undefined || bv === null) return -1
        return (String(av) < String(bv) ? -1 : 1) * (ascending ? 1 : -1)
      })
    }
    return out
  }

  private execute(): QueryResult {
    switch (this.op) {
      case 'select': {
        const out = this.matched()
        if (this.wantSingle) {
          if (out.length === 0) {
            return { data: null, error: { code: 'PGRST116', message: 'no rows' } }
          }
          return { data: out[0], error: null }
        }
        return { data: out, error: null }
      }
      case 'insert': {
        const row: Row = {
          id: this.db.nextId(this.table),
          created_at: new Date().toISOString(),
          // Migration default: lists are private unless stated.
          ...(this.table === 'lists' ? { is_public: false } : {}),
          ...this.payload,
        }
        this.rows().push(row)
        return this.wantSingle ? { data: row, error: null } : { data: [row], error: null }
      }
      case 'upsert': {
        const row: Row = { ...this.payload }
        const conflictCols = (this.onConflict ?? '').split(',').map((c) => c.trim()).filter(Boolean)
        const existing =
          conflictCols.length > 0
            ? this.rows().find((r) => conflictCols.every((c) => r[c] === row[c]))
            : undefined
        if (existing) {
          Object.assign(existing, row)
          return this.wantSingle ? { data: existing, error: null } : { data: [existing], error: null }
        }
        const inserted: Row = {
          id: this.db.nextId(this.table),
          created_at: new Date().toISOString(),
          ...row,
        }
        this.rows().push(inserted)
        return this.wantSingle ? { data: inserted, error: null } : { data: [inserted], error: null }
      }
      case 'update': {
        const out = this.matched()
        for (const row of out) Object.assign(row, this.patch)
        if (this.wantSingle) {
          if (out.length === 0) {
            return { data: null, error: { code: 'PGRST116', message: 'no rows' } }
          }
          return { data: out[0], error: null }
        }
        return { data: out, error: null }
      }
      case 'delete': {
        const kept = this.rows().filter((r) => !this.filters.every((f) => f(r)))
        this.db.tables[this.table] = kept
        return { data: null, error: null }
      }
    }
  }
}
