/** A read-only projection refresh never unmounts the current chat on success.
 * @param {()=>Promise<any>} read @param {()=>any} current @param {(data:any)=>any} accept @param {(status:number)=>any} deny */
export function homeProjectionRefresh(read, current, accept, deny) {
  let sequence = 0;
  /** @type {any} */ let pending = null;
  return async (/** @type {any} */ expected) => {
    const start = current();
    if (
      start.disposed ||
      !expected?.callerId ||
      expected.homeId !== start.homeId ||
      expected.callerId !== start.callerId ||
      !Number.isSafeInteger(expected.revision) ||
      expected.revision < 0
    )
      return false;
    if (start.revision >= expected.revision) return true;
    const fields = ['homeId', 'callerId', 'generation'];
    if (
      pending &&
      fields.every((k) => pending[k] === start[k]) &&
      pending.revision >= expected.revision
    )
      return false;
    const at = ++sequence;
    pending = { ...start, revision: expected.revision };
    const same = () => {
      const end = current();
      return !end.disposed && at === sequence && fields.every((k) => end[k] === start[k]);
    };
    try {
      const response = await read();
      if (!same()) return false;
      if (!response.ok) {
        if ([401, 403].includes(response.status)) deny(response.status);
        return false;
      }
      const data = await response.json();
      if (!same()) return false;
      if (
        data.status !== 'ready' ||
        data.callerId !== expected.callerId ||
        data.home?.id !== expected.homeId
      ) {
        deny(403);
        return false;
      }
      if (
        !Number.isSafeInteger(data.home.revision) ||
        data.home.revision < expected.revision ||
        data.home.revision < current().revision
      )
        return false;
      accept(data);
      return true;
    } finally {
      if (at === sequence) pending = null;
    }
  };
}
/** Notify a confirmed current-owner save once; no upload/retry/consent is generated.
 * @param {(expected:any)=>any} notify @param {()=>any} context */
export function modelSavedNotifier(notify, context) {
  const sent = new Set();
  return (/** @type {any} */ input, /** @type {any} */ result) => {
    const c = context();
    if (
      c.disposed ||
      !c.enabled ||
      !c.callerId ||
      input.conversationId !== c.conversationId ||
      result?.status !== 'model-applied' ||
      result.operation?.active === true ||
      !Number.isSafeInteger(result.revision) ||
      ['conversationId', 'actionId', 'digest'].some((k) => input[k] !== result[k])
    )
      return;
    const key = [
      c.homeId,
      c.callerId,
      c.generation,
      input.conversationId,
      input.actionId,
      input.digest,
      result.revision
    ].join('/');
    if (sent.has(key)) return;
    sent.add(key);
    return notify({ homeId: c.homeId, callerId: c.callerId, revision: result.revision });
  };
}
