export const MAX_PERIOD = 5000;

export function isValidPeriodNumber(value) {
  return Number.isInteger(value) && value >= 1 && value <= MAX_PERIOD;
}

function isUsed(changesForOneParameter, periodNumber) {
  let used = false;
  let latestStart = 0;

  for (const change of changesForOneParameter) {
    if (
      change.scope === 'from_here_on' &&
      change.periodNumber <= periodNumber &&
      change.periodNumber > latestStart
    ) {
      latestStart = change.periodNumber;
      used = change.action === 'add';
    }
  }

  const oneOff = changesForOneParameter.find(
    (change) =>
      change.scope === 'this_period_only' && change.periodNumber === periodNumber
  );
  if (oneOff) used = oneOff.action === 'add';

  return used;
}

export function parametersUsedInPeriod(changes, periodNumber) {
  const byParameter = new Map();
  for (const change of changes) {
    if (!byParameter.has(change.parameterId)) {
      byParameter.set(change.parameterId, []);
    }
    byParameter.get(change.parameterId).push(change);
  }

  const usedIds = [];
  for (const [parameterId, list] of byParameter) {
    if (isUsed(list, periodNumber)) usedIds.push(parameterId);
  }
  return usedIds;
}

export function withChange(changes, change) {
  const others = changes.filter(
    (existing) =>
      !(
        existing.parameterId === change.parameterId &&
        existing.periodNumber === change.periodNumber &&
        existing.scope === change.scope
      )
  );
  return [...others, change];
}

export function hiddenScores({ changes, change, scoreCounts }) {
  const after = withChange(changes, change);
  let affectedScores = 0;
  const periods = [];

  for (const { periodNumber, count } of scoreCounts) {
    const usedBefore = parametersUsedInPeriod(changes, periodNumber).includes(
      change.parameterId
    );
    const usedAfter = parametersUsedInPeriod(after, periodNumber).includes(
      change.parameterId
    );
    if (usedBefore && !usedAfter) {
      affectedScores += count;
      periods.push(periodNumber);
    }
  }
  return { affectedScores, periods };
}