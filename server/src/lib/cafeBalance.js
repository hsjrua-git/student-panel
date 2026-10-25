// One balance change, applied atomically: the balance row is upserted with
// the signed delta (the row lock the UPSERT takes serialises concurrent
// charges), and the transaction row snapshots balance_after so the history
// can always be replayed. OVERDRAFT IS ALLOWED by design — a charge may push
// the balance negative; nothing here refuses it.
//
// `kind' must already satisfy the table's CHECK (topup/refund > 0, charge < 0,
// adjustment <> 0); callers sign the delta to match.

export async function applyBalanceChange(
  db,
  { studentId, delta, kind, referenceType = null, referenceId = null, note = null, createdBy }
) {
  const balance = await db.query(
    `INSERT INTO student_balances (student_id, balance)
     VALUES ($1, $2)
     ON CONFLICT (student_id)
     DO UPDATE SET balance = student_balances.balance + $2, updated_at = now()
     RETURNING balance`,
    [studentId, delta]
  );
  const balanceAfter = Number(balance.rows[0].balance);

  await db.query(
    `INSERT INTO student_balance_transactions
       (student_id, kind, amount, balance_after, reference_type, reference_id, note, created_by)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
    [studentId, kind, delta, balanceAfter, referenceType, referenceId, note, createdBy]
  );

  return balanceAfter;
}
