import 'server-only'
import type { SupabaseClient } from '@supabase/supabase-js'
import { MEDIA_BUCKET } from '@/lib/db/media'
import { TABLES } from '@/lib/db/supabase'

/**
 * "Izbriši moju kuhinju" (IMP-09): everything the app holds for one customer's
 * project — Storage objects, brief rows, the project row with its snapshot,
 * the invite tokens — and the customer's account when it has no other
 * project. The server action (app/kitchen/[projectId]/actions.ts) decides WHO
 * may call this; this file only does the work, against an injected client so
 * the order can be tested without a database.
 *
 * Ported from scripts/delete-brief.mjs, which stays a dev script and stops at
 * the project: it never removed tokens or the account.
 *
 * ORDER, and why
 *
 *  1. close    The project is archived first. The handoff answers 409 for a
 *              closed project (isProjectClosed), so a send from another tab
 *              cannot add a brief or objects while we delete. If the erase
 *              then stops while the row still exists, the status the caller
 *              read is written back (best-effort, see reopen()): a failed
 *              delete must not leave the kitchen closed for good — no send,
 *              and "archived" on the maker's list as if declined.
 *  2. read     The project's briefs. The brief ids are the ONLY link from a
 *              project to its Storage folders (`briefs/<briefId>/NNN.ext`,
 *              the one path the app writes — tests/erase-storage-paths).
 *  3. storage  Every object under each brief's folder, through the Storage
 *              API (never SQL on storage.objects).
 *  4. briefs   `briefs.project_id` is ON DELETE SET NULL: deleting the project
 *              first would leave briefs behind that still hold contact data.
 *  5. tokens   This project's invite tokens (CASCADE would take them with the
 *              project; deleting them by name keeps the order explicit).
 *  6. project  The row and its snapshot.
 *  7. account  Only when no other project names this customer:
 *              `projects.customer_id` is ON DELETE RESTRICT, so the account
 *              goes last, after its own login tokens. This step runs after
 *              the project row is gone, so a failure here cannot be retried
 *              through the project (the action's guard 404s): it is exported
 *              on its own as eraseCustomerAccount(), which deleteMyAccount
 *              runs — from the same panel's retry, or from the no-kitchen
 *              panel at /.
 *
 * Storage before rows: the rows are what point at the objects. Rows first and
 * a Storage failure would leave photos of someone's home with nothing pointing
 * at them and no way to retry — the project would be gone and the kitchen page
 * a 404. Storage first means a failure up to step 6 leaves the project row in
 * place, its status put back: the kitchen page still opens and the button
 * retries. Removing a path that is already gone is a no-op, and every row step
 * is a delete by key, so a re-run picks up where the last one stopped (a
 * failure at step 7 picks up through eraseCustomerAccount). The cost: a maker
 * opening the brief mid-delete sees broken images.
 *
 * NOT followed, on purpose: storage refs inside the snapshot. The checkpoint
 * accepts snapshot JSON from the client, so a crafted
 * `storage://…/briefs/<someone else's brief>/…` would let one customer delete
 * another's objects. Only folders of briefs whose project_id is this project
 * are listed.
 *
 * Logs carry the step and the Postgres/Storage error code only — never ids,
 * emails or the error message (a foreign-key message quotes key values).
 */

export type EraseStep = 'close' | 'briefs-read' | 'storage' | 'briefs' | 'tokens' | 'project' | 'account'

export type EraseResult =
  | { ok: true; objects: number; briefs: number; accountDeleted: boolean }
  | { ok: false; failedAt: EraseStep }

export type AccountEraseResult = { ok: true; accountDeleted: boolean } | { ok: false; failedAt: 'account' }

export type EraseDb = Pick<SupabaseClient, 'from' | 'storage'>

/** Storage's own page size cap for list(), and a safe batch for remove(). */
const PAGE = 1000

/** Postgres foreign_key_violation. */
const FK_VIOLATION = '23503'

class StepFailed extends Error {
  constructor(
    public step: EraseStep,
    public code: string
  ) {
    super(`erase stopped at ${step}`)
  }
}

function codeOf(error: unknown): string {
  const e = (error ?? {}) as { code?: unknown; statusCode?: unknown; status?: unknown }
  const c = e.code ?? e.statusCode ?? e.status
  return typeof c === 'string' || typeof c === 'number' ? String(c) : 'unknown'
}

/** Throw a StepFailed for a Supabase `{ error }`, keeping only its code. */
function check(step: EraseStep, error: unknown): void {
  if (error) throw new StepFailed(step, codeOf(error))
}

async function listBriefObjects(db: EraseDb, briefId: string): Promise<string[]> {
  const folder = `briefs/${briefId}`
  const paths: string[] = []
  for (let offset = 0; ; offset += PAGE) {
    const { data, error } = await db.storage.from(MEDIA_BUCKET).list(folder, { limit: PAGE, offset })
    check('storage', error)
    const page = data ?? []
    for (const obj of page) paths.push(`${folder}/${obj.name}`)
    if (page.length < PAGE) return paths
  }
}

/**
 * Step 7: the account and its login tokens, only when no project names it.
 * Returns whether the account went; false when a kitchen is on it (again — a
 * new invite that lands in between trips RESTRICT, which is right).
 */
async function deleteAccountIfAlone(db: EraseDb, customerId: string): Promise<boolean> {
  const { data, error } = await db.from(TABLES.projects).select('id').eq('customer_id', customerId).limit(1)
  check('account', error)
  if ((data ?? []).length) return false
  const tokens = await db.from(TABLES.authTokens).delete().eq('account_id', customerId)
  check('account', tokens.error)
  const account = await db.from(TABLES.accounts).delete().eq('id', customerId).eq('role', 'customer')
  if (account.error && codeOf(account.error) !== FK_VIOLATION) check('account', account.error)
  return !account.error
}

/**
 * Best-effort: write back the status step 1 replaced, while the row still
 * reads 'archived'. Never throws — the erase already failed, and this only
 * keeps that failure from closing the kitchen. Logs the code only.
 */
async function reopen(db: EraseDb, input: { projectId: string; customerId: string; status: string }): Promise<void> {
  if (input.status === 'archived') return
  try {
    const { error } = await db
      .from(TABLES.projects)
      .update({ status: input.status })
      .eq('id', input.projectId)
      .eq('customer_id', input.customerId)
      .eq('status', 'archived')
    if (error) console.error('[erase] status not restored', codeOf(error))
  } catch {
    console.error('[erase] status not restored', 'thrown')
  }
}

/**
 * Step 7 on its own, for a customer whose last kitchen is already gone — the
 * retry after eraseCustomerProject stopped at 'account', or an account that
 * outlived its project. Deletes nothing while any project names the customer.
 */
export async function eraseCustomerAccount(db: EraseDb, input: { customerId: string }): Promise<AccountEraseResult> {
  try {
    return { ok: true, accountDeleted: await deleteAccountIfAlone(db, input.customerId) }
  } catch (err) {
    console.error('[erase] stopped at', 'account', err instanceof StepFailed ? err.code : 'thrown')
    return { ok: false, failedAt: 'account' }
  }
}

export async function eraseCustomerProject(
  db: EraseDb,
  input: {
    projectId: string
    customerId: string
    /** The project's status as the caller's guard read it — restored if the erase stops before the row goes. */
    status: string
  }
): Promise<EraseResult> {
  const { projectId, customerId } = input
  let step: EraseStep = 'close'
  try {
    // 1. close — no new brief or object can land while we delete.
    {
      const { error } = await db
        .from(TABLES.projects)
        .update({ status: 'archived' })
        .eq('id', projectId)
        .eq('customer_id', customerId)
      check(step, error)
    }

    // 2. the project's briefs — their ids are the Storage folders.
    step = 'briefs-read'
    let briefIds: string[]
    {
      const { data, error } = await db.from(TABLES.briefs).select('id').eq('project_id', projectId)
      check(step, error)
      briefIds = ((data ?? []) as Array<{ id: string }>).map((row) => row.id)
    }

    // 3. Storage, before any row: a failure here leaves everything retryable.
    step = 'storage'
    const paths: string[] = []
    for (const briefId of briefIds) paths.push(...(await listBriefObjects(db, briefId)))
    for (let i = 0; i < paths.length; i += PAGE) {
      const { error } = await db.storage.from(MEDIA_BUCKET).remove(paths.slice(i, i + PAGE))
      check(step, error)
    }

    // 4. briefs — before the project, whose delete would only null their link.
    step = 'briefs'
    {
      const { error } = await db.from(TABLES.briefs).delete().eq('project_id', projectId)
      check(step, error)
    }

    // 5. this project's invite tokens.
    step = 'tokens'
    {
      const { error } = await db.from(TABLES.authTokens).delete().eq('project_id', projectId)
      check(step, error)
    }

    // 6. the project row, snapshot and all.
    step = 'project'
    {
      const { error } = await db
        .from(TABLES.projects)
        .delete()
        .eq('id', projectId)
        .eq('customer_id', customerId)
      check(step, error)
    }

    // 7. the account, only when it has no other kitchen.
    step = 'account'
    const accountDeleted = await deleteAccountIfAlone(db, customerId)

    return { ok: true, objects: paths.length, briefs: briefIds.length, accountDeleted }
  } catch (err) {
    const code = err instanceof StepFailed ? err.code : 'thrown'
    const failedAt = err instanceof StepFailed ? err.step : step
    console.error('[erase] stopped at', failedAt, code)
    // Up to and including its own delete, the project row is still there:
    // put its status back so the failure does not close the kitchen. A
    // failed close changed nothing; at 'account' the row is gone.
    if (failedAt !== 'close' && failedAt !== 'account') await reopen(db, input)
    return { ok: false, failedAt }
  }
}
