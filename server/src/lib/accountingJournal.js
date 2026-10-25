// The journal engine: drafts, posting, voiding, mapped auto-entries, and the
// opening-entry snapshot. All money is bigint Toman. The database triggers
// (025) are the hard guarantee — Σdebit=Σcredit at COMMIT, posted entries
// immutable, closed periods unpostable — this module shapes clean errors and
// the one-transaction flows on top of them.

import { isUuid } from './ids.js';
import { isValidIsoDate } from './periods.js';

// A line is { accountId, debit } XOR { accountId, credit } — never both.
function normalizeLines(lines) {
  if (!Array.isArray(lines) || lines.length < 2) {
    return {
      error: 'An entry needs at least two lines.',
      code: 'VALIDATION_INVALID_LENGTH',
      params: { min: 2 },
    };
  }
  if (lines.length > 100) {
    return {
      error: 'An entry may have at most 100 lines.',
      code: 'VALIDATION_TOO_LONG',
      params: { max: 100 },
    };
  }
  const normalized = [];
  for (const line of lines) {
    if (!isUuid(line?.accountId)) {
      return { error: 'Every line needs an account.', code: 'VALIDATION_REQUIRED' };
    }
    const debit = line?.debit ?? 0;
    const credit = line?.credit ?? 0;
    if (!Number.isInteger(debit) || !Number.isInteger(credit) || debit < 0 || credit < 0) {
      return {
        error: 'Debit and credit must be whole Toman amounts (0 or more).',
        code: 'VALIDATION_INVALID_RANGE',
      };
    }
    if ((debit > 0) === (credit > 0)) {
      return {
        error: 'Each line carries exactly one side: debit or credit.',
        code: 'VALIDATION_INVALID_CHOICE',
      };
    }
    normalized.push({
      accountId: line.accountId,
      debit,
      credit,
      memo: typeof line?.memo === 'string' && line.memo.trim() !== '' ? line.memo.trim() : null,
    });
  }
  const totalDebit = normalized.reduce((sum, line) => sum + line.debit, 0);
  const totalCredit = normalized.reduce((sum, line) => sum + line.credit, 0);
  if (totalDebit !== totalCredit) {
    return {
      error: 'The entry does not balance (Σdebit ≠ Σcredit).',
      code: 'ACCOUNTING_UNBALANCED',
      params: { debit: totalDebit, credit: totalCredit },
    };
  }
  if (totalDebit === 0) {
    return { error: 'An entry cannot be all zeros.', code: 'VALIDATION_INVALID_RANGE' };
  }
  return { value: normalized, total: totalDebit };
}

export function parseJournalEntryBody(body) {
  if (!isValidIsoDate(body?.entryDate)) {
    return {
      error: 'entryDate must be a date (YYYY-MM-DD).',
      code: 'VALIDATION_INVALID_DATE',
    };
  }
  const memo = body?.memo;
  if (
    memo !== undefined && memo !== null && String(memo).trim() !== '' &&
    (typeof memo !== 'string' || memo.trim().length > 500)
  ) {
    return {
      error: 'Memo must be 500 characters or fewer.',
      code: 'VALIDATION_TOO_LONG',
      params: { max: 500 },
    };
  }
  const lines = normalizeLines(body?.lines);
  if (lines.error) return lines;
  return {
    value: {
      entryDate: body.entryDate,
      memo: memo === undefined || memo === null || String(memo).trim() === ''
        ? null
        : memo.trim(),
      lines: lines.value,
    },
  };
}

async function insertLines(db, entryId, lines) {
  await db.query(
    `INSERT INTO acct_journal_lines (entry_id, account_id, debit, credit, memo)
     SELECT $1, x.account_id, x.debit, x.credit, x.memo
     FROM unnest($2::uuid[], $3::bigint[], $4::bigint[], $5::text[])
       AS x(account_id, debit, credit, memo)`,
    [
      entryId,
      lines.map((line) => line.accountId),
      lines.map((line) => line.debit),
      lines.map((line) => line.credit),
      lines.map((line) => line.memo),
    ]
  );
}

// Create a draft. `user` is the acting request user.
export async function createDraftEntry(db, { user, entryDate, memo, lines }) {
  const entry = await db.query(
    `INSERT INTO acct_journal_entries (entry_date, memo, created_by)
     VALUES ($1, $2, $3) RETURNING id, entry_no`,
    [entryDate, memo ?? null, user.id]
  );
  await insertLines(db, entry.rows[0].id, lines);
  return { entryId: entry.rows[0].id, entryNo: Number(entry.rows[0].entry_no) };
}

// Post a draft (accounting.post). Closed-period and immutability rules are
// enforced by the 025 triggers; the mapping on the way out tells the caller
// which constraint fired.
export async function postEntry(db, { user, entryId }) {
  const result = await db.query(
    `UPDATE acct_journal_entries
     SET status = 'posted', posted_by = $2
     WHERE id = $1 AND status = 'draft'
     RETURNING id, entry_no`,
    [entryId, user.id]
  );
  if (result.rowCount === 0) {
    const existing = await db.query(
      'SELECT status FROM acct_journal_entries WHERE id = $1',
      [entryId]
    );
    if (existing.rowCount === 0) {
      return { error: 'NOT_FOUND' };
    }
    return { error: 'ACCOUNTING_ENTRY_NOT_DRAFT' };
  }
  return { entryNo: Number(result.rows[0].entry_no) };
}

// Void a posted entry (accounting.post). Voiding UNPOSTS its economics —
// reports read posted lines only — which is the accounting twin of the cafe
// void that calls this.
export async function voidEntry(db, { user, entryId }) {
  const result = await db.query(
    `UPDATE acct_journal_entries
     SET status = 'voided', voided_by = $2
     WHERE id = $1 AND status = 'posted'
     RETURNING id`,
    [entryId, user.id]
  );
  if (result.rowCount === 0) {
    const existing = await db.query(
      'SELECT status FROM acct_journal_entries WHERE id = $1',
      [entryId]
    );
    if (existing.rowCount === 0) {
      return { error: 'NOT_FOUND' };
    }
    return { error: 'ACCOUNTING_ENTRY_NOT_POSTED' };
  }
  return { voided: true };
}

// The cafe auto-post: ONE journal entry per source event, its lines built
// from the active mappings for the listed events (each contributing a debit/
// credit pair scaled to its amount). When no mapping is active the call is a
// no-op — the cafe keeps working standalone. A duplicate posted entry for
// the same source is refused by the partial unique index (a voided entry
// frees the slot).
export async function postMappedEvent(db, { user, sourceType, sourceId, date, memo, pairs }) {
  const events = pairs.map((pair) => pair.event);
  const mappings = await db.query(
    `SELECT m.event, m.debit_account_id, m.credit_account_id
     FROM acct_mappings m
     WHERE m.event = ANY($1::text[]) AND m.is_active`,
    [events]
  );
  if (mappings.rowCount === 0) return { posted: false };

  const lines = [];
  for (const pair of pairs) {
    const mapping = mappings.rows.find((row) => row.event === pair.event);
    if (!mapping || pair.amount <= 0) continue;
    lines.push({
      accountId: mapping.debit_account_id,
      debit: pair.amount,
      credit: 0,
      memo: pair.memo ?? null,
    });
    lines.push({
      accountId: mapping.credit_account_id,
      debit: 0,
      credit: pair.amount,
      memo: pair.memo ?? null,
    });
  }
  if (lines.length === 0) return { posted: false };

  const total = lines.reduce((sum, line) => sum + line.debit, 0);
  // Draft first, lines second, then the post transition — the lines trigger
  // only trusts drafts, and the lifecycle trigger stamps the post.
  const entry = await db.query(
    `INSERT INTO acct_journal_entries
       (entry_date, memo, status, source_type, source_id, created_by)
     VALUES (COALESCE($1::date, current_date), $2, 'draft', $3, $4, $5)
     RETURNING id`,
    [date ?? null, memo ?? null, sourceType, sourceId, user.id]
  );
  await insertLines(db, entry.rows[0].id, lines);
  await db.query(
    `UPDATE acct_journal_entries SET status = 'posted', posted_by = $2
     WHERE id = $1 AND status = 'draft'`,
    [entry.rows[0].id, user.id]
  );
  const numbered = await db.query(
    'SELECT entry_no FROM acct_journal_entries WHERE id = $1',
    [entry.rows[0].id]
  );
  return {
    posted: true,
    entryId: entry.rows[0].id,
    entryNo: Number(numbered.rows[0].entry_no),
    total,
  };
}

// The adopted-accounting snapshot: bring today's cafe inventory value and
// student deposits onto the books. Positive student balances are a liability
// (their money); negative balances are a receivable (they owe the cafe); the
// difference lands in opening equity. Refuses to run twice.
export async function generateOpeningEntry(db, { user, date }) {
  const existing = await db.query(
    `SELECT id FROM acct_journal_entries
     WHERE source_type = 'opening' AND status = 'posted'`
  );
  if (existing.rowCount > 0) {
    return { error: 'ACCOUNTING_OPENING_EXISTS' };
  }

  const code = (label) =>
    db.query('SELECT id FROM acct_accounts WHERE code = $1', [label]);

  const inventory = await db.query(
    `SELECT COALESCE(SUM(qty * avg_cost), 0)::bigint AS value
     FROM cafe_stock WHERE qty > 0`
  );
  const balances = await db.query(
    `SELECT
       COALESCE(SUM(balance) FILTER (WHERE balance > 0), 0)::bigint AS deposits,
       COALESCE(-SUM(balance) FILTER (WHERE balance < 0), 0)::bigint AS receivable
     FROM student_balances`
  );
  const inventoryValue = Number(inventory.rows[0].value);
  const deposits = Number(balances.rows[0].deposits);
  const receivable = Number(balances.rows[0].receivable);

  const [inventoryAccount, depositsAccount, receivableAccount, equityAccount] =
    await Promise.all([
      code('1200'),
      code('2100'),
      code('1300'),
      code('3000'),
    ]);

  const lines = [];
  if (inventoryValue > 0) {
    lines.push({
      accountId: inventoryAccount.rows[0].id,
      debit: inventoryValue,
      credit: 0,
      memo: null,
    });
  }
  if (receivable > 0) {
    lines.push({
      accountId: receivableAccount.rows[0].id,
      debit: receivable,
      credit: 0,
      memo: null,
    });
  }
  if (deposits > 0) {
    lines.push({
      accountId: depositsAccount.rows[0].id,
      debit: 0,
      credit: deposits,
      memo: null,
    });
  }
  if (lines.length === 0) {
    return { error: 'ACCOUNTING_NOTHING_TO_OPEN' };
  }

  const debitTotal = lines.reduce((sum, line) => sum + line.debit, 0);
  const creditTotal = lines.reduce((sum, line) => sum + line.credit, 0);
  const plug = debitTotal - creditTotal;
  if (plug > 0) {
    lines.push({
      accountId: equityAccount.rows[0].id,
      debit: 0,
      credit: plug,
      memo: null,
    });
  } else if (plug < 0) {
    lines.push({
      accountId: equityAccount.rows[0].id,
      debit: -plug,
      credit: 0,
      memo: null,
    });
  }

  return createPostedEntry(db, {
    user,
    entryDate: date,
    memo: 'Opening balances',
    sourceType: 'opening',
    sourceId: null,
    lines,
  });
}

// A directly-posted entry with explicit lines (used by the opening snapshot
// and period closing; the balance trigger is the safety net).
export async function createPostedEntry(db, { user, entryDate, memo, sourceType, sourceId, lines, reversesEntryId }) {
  const check = normalizeLines(lines);
  if (check.error) return { error: check.code, details: check.error };
  // Draft → lines → post: the lines trigger only trusts drafts.
  const entry = await db.query(
    `INSERT INTO acct_journal_entries
       (entry_date, memo, status, source_type, source_id, created_by, reverses_entry_id)
     VALUES ($1, $2, 'draft', $3, $4, $5, $6)
     RETURNING id`,
    [entryDate, memo ?? null, sourceType ?? null, sourceId ?? null, user.id, reversesEntryId ?? null]
  );
  await insertLines(db, entry.rows[0].id, lines);
  await db.query(
    `UPDATE acct_journal_entries SET status = 'posted', posted_by = $2
     WHERE id = $1 AND status = 'draft'`,
    [entry.rows[0].id, user.id]
  );
  const numbered = await db.query(
    'SELECT entry_no FROM acct_journal_entries WHERE id = $1',
    [entry.rows[0].id]
  );
  return {
    entryId: entry.rows[0].id,
    entryNo: Number(numbered.rows[0].entry_no),
    total: check.total,
  };
}

// The cafe's journal entry for a source event, when one exists.
export async function findEntryBySource(db, sourceType, sourceId) {
  const result = await db.query(
    `SELECT id, status FROM acct_journal_entries
     WHERE source_type = $1 AND source_id = $2 AND status = 'posted'`,
    [sourceType, sourceId]
  );
  return result.rows[0] ?? null;
}

// Close a fiscal period: book the automatic closing entry (income and
// expense balances in the range zeroed into retained earnings, code 3100),
// then lock the range against further posting. Callers hold the period row
// FOR UPDATE.
export async function closeFiscalPeriod(db, { user, periodId }) {
  const period = await db.query(
    `SELECT id, name, start_date AS "startDate", end_date AS "endDate", status
     FROM acct_fiscal_periods WHERE id = $1 FOR UPDATE`,
    [periodId]
  );
  if (period.rowCount === 0) {
    return { error: 'NOT_FOUND' };
  }
  if (period.rows[0].status === 'closed') {
    return { error: 'ACCOUNTING_PERIOD_CLOSED' };
  }
  const { startDate, endDate } = period.rows[0];

  const balances = await db.query(
    `SELECT a.id, a.type,
            CASE a.type
              WHEN 'income'  THEN SUM(l.credit - l.debit)
              WHEN 'expense' THEN SUM(l.debit - l.credit)
            END::bigint AS balance
     FROM acct_journal_lines l
     JOIN acct_journal_entries e ON e.id = l.entry_id AND e.status = 'posted'
     JOIN acct_accounts a ON a.id = l.account_id
     WHERE a.type IN ('income', 'expense')
       AND e.entry_date BETWEEN $1 AND $2
     GROUP BY a.id, a.type
     HAVING CASE a.type
              WHEN 'income'  THEN SUM(l.credit - l.debit)
              WHEN 'expense' THEN SUM(l.debit - l.credit)
            END <> 0`,
    [startDate, endDate]
  );

  let closingLines = 0;
  if (balances.rows.length > 0) {
    const equity = await db.query(
      `SELECT id FROM acct_accounts WHERE code = '3100'`
    );
    const equityId = equity.rows[0].id;
    const lines = [];
    for (const row of balances.rows) {
      const balance = Number(row.balance);
      if (row.type === 'income') {
        // Zero the income: debit it, credit retained earnings.
        lines.push({ accountId: row.id, debit: balance, credit: 0, memo: null });
        lines.push({ accountId: equityId, debit: 0, credit: balance, memo: null });
      } else {
        // Zero the expense: credit it, debit retained earnings.
        lines.push({ accountId: row.id, debit: 0, credit: balance, memo: null });
        lines.push({ accountId: equityId, debit: balance, credit: 0, memo: null });
      }
    }
    closingLines = lines.length;
    await createPostedEntry(db, {
      user,
      entryDate: endDate,
      memo: `Closing: ${period.rows[0].name}`,
      sourceType: 'closing',
      sourceId: periodId,
      lines,
    });
  }

  await db.query(
    `UPDATE acct_fiscal_periods
     SET status = 'closed', closed_by = $2, closed_at = now()
     WHERE id = $1`,
    [periodId, user.id]
  );
  return { closed: true, closingLines };
}
