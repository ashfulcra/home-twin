/** A delayed poll cannot roll back saved progress; an absent server decision is never retained.
 * @param {any[]} current @param {any[]} incoming @param {string} conversationId */
export function mergeRecordActions(current, incoming, conversationId) {
  const progress = [
    'proposed',
    'pending-readback',
    'submitted',
    'publication-pending',
    'held-for-review',
    'accepted'
  ];
  return incoming
    .filter((a) => a.conversationId === conversationId)
    .map((a) => {
      const previous = current.find(
        (p) =>
          p.actionId === a.actionId && p.digest === a.digest && p.conversationId === conversationId
      );
      return previous && progress.indexOf(previous.status) > progress.indexOf(a.status)
        ? previous
        : a;
    });
}
