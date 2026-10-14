/** @param {any[]} current @param {any[]} incoming @param {string} conversationId */
export function mergeModelReviews(current, incoming, conversationId) {
  return incoming
    .filter((a) => a.conversationId === conversationId)
    .map((a) => {
      const old = current.find(
        (p) =>
          p.actionId === a.actionId && p.digest === a.digest && p.conversationId === conversationId
      );
      return {
        ...a,
        ...(old?.progress ? { progress: old.progress } : {}),
        ...(old?.undo ? { undo: old.undo } : {})
      };
    });
}
/** Explicit UI actions and read-only polls; late or mismatched responses never update a new context.
 * @param {any} response @param {()=>any} context */
export function modelConversationActions(response, context) {
  const urls = {
    apply: 'model-actions',
    undo: 'model-undo',
    status: 'model-status',
    'undo-status': 'model-undo-status'
  };
  return async (/** @type {any} */ action, /** @type {keyof typeof urls} */ operation) => {
    const start = context();
    if (!start.enabled || start.disposed || action.conversationId !== start.conversationId)
      return null;
    const input = {
      conversationId: action.conversationId,
      actionId: action.actionId,
      digest: action.digest
    };
    const result = await response('/api/home/chat/' + urls[operation], {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(input)
      }),
      end = context();
    if (
      end.disposed ||
      !end.enabled ||
      end.generation !== start.generation ||
      end.conversationId !== start.conversationId ||
      result.conversationId !== input.conversationId ||
      result.actionId !== input.actionId ||
      result.digest !== input.digest
    )
      return null;
    if (result.review && result.review.conversationId !== input.conversationId) return null;
    return result;
  };
}

/** @param {any} slot @param {any} context */
export function modelOperationActive(slot, context) {
  return (
    !!slot &&
    slot.conversationId === context.conversationId &&
    slot.generation === context.generation
  );
}
/** Preserve confirmed progress across delayed older acknowledgements for the same exact request.
 * @param {any} previous @param {any} incoming */
export function mergeModelProgress(previous, incoming) {
  if (
    !previous ||
    previous.conversationId !== incoming.conversationId ||
    previous.actionId !== incoming.actionId ||
    previous.digest !== incoming.digest
  )
    return incoming;
  const rank = [
    'checking-model-sources',
    'preparing-model-undo',
    'model-approval-recorded',
    'publication-pending',
    'model-applied',
    'undo-preview-ready',
    'held-for-review'
  ];
  return rank.indexOf(previous.status) > rank.indexOf(incoming.status)
    ? { ...previous, ...(incoming.operation ? { operation: incoming.operation } : {}) }
    : incoming;
}

/** Skip cheap status reads only while the exact terminal result is still displayed.
 * @param {any} review @param {any} request */
export function modelProgressComplete(review, request) {
  if (!review || !request || !['apply', 'undo'].includes(request.kind)) return false;
  const progress = request.kind === 'undo' ? review.undo : review.progress;
  if (
    !progress ||
    progress.operation?.active === true ||
    ['conversationId', 'actionId', 'digest'].some(
      (k) => review[k] !== request[k] || progress[k] !== request[k]
    )
  )
    return false;
  return (
    request.kind === 'undo'
      ? ['undo-preview-ready', 'held-for-review']
      : ['model-applied', 'held-for-review']
  ).includes(progress.status);
}
