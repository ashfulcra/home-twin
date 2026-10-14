const uuid = /^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/;
const hex = /^[a-f0-9]{64}$/;
/** Exact file request UI; status/review reads never generate consent or publication.
 * Current account/home/file context is checked after every response.
 * @param {any} options */
export function sourceSaveController({
  request,
  context,
  readSaved = () => null,
  writeSaved = () => {},
  changed = () => {},
  accepted = () => {}
}) {
  let disposed = false,
    busy = false,
    notified = false,
    safeToReviewAgain = false;
  /** @type {any} */ let state = { status: 'idle', error: '', input: null, canReviewAgain: false };
  const initial = context(),
    key = [initial.homeId, initial.callerId, initial.sourceId].join('/');
  const same = () => {
    const c = context();
    return (
      !disposed &&
      !c.disposed &&
      c.enabled === true &&
      typeof c.homeId === 'string' &&
      uuid.test(c.callerId) &&
      typeof c.sourceId === 'string' &&
      c.sourceId.startsWith('evidence-') &&
      uuid.test(c.sourceId.slice(9)) &&
      [c.homeId, c.callerId, c.sourceId].join('/') === key
    );
  };
  function set(/** @type {any} */ next) {
    if (!same()) return;
    state = { ...state, ...next, busy };
    changed(structuredClone(state));
  }
  function exactInput(/** @type {any} */ x) {
    if (
      !x ||
      typeof x !== 'object' ||
      Array.isArray(x) ||
      Object.keys(x).length !== 2 ||
      !uuid.test(x.actionId) ||
      x.actionId !== initial.sourceId.slice(9) ||
      !hex.test(x.digest)
    )
      throw Error('Exact file save request required');
    return { actionId: x.actionId, digest: x.digest };
  }
  function result(/** @type {any} */ value, /** @type {any} */ input = null) {
    if (
      !value ||
      value.sourceId !== initial.sourceId ||
      ![
        'checking-source',
        'source-review-ready',
        'accepted',
        'held-for-review',
        'publication-pending',
        'source-review-unconfirmed',
        'source-save-unconfirmed'
      ].includes(value.status)
    )
      throw Error('File save progress could not be confirmed');
    if (input && (value.actionId !== input.actionId || value.digest !== input.digest))
      throw Error('Saved file request differs');
    if (value.status !== 'checking-source' && value.status !== 'source-review-unconfirmed') {
      if (value.actionId !== initial.sourceId.slice(9)) throw Error('File save identity differs');
      if (input && (value.actionId !== input.actionId || value.digest !== input.digest))
        throw Error('Saved file request differs');
    }
    if (
      value.status === 'accepted' &&
      (!Number.isSafeInteger(value.revision) ||
        value.revision < 1 ||
        value.operation?.active === true)
    )
      throw Error('Accepted file revision not confirmed');
    if (value.title !== undefined && (typeof value.title !== 'string' || value.title.length > 500))
      throw Error('Bounded file title required');
    if (value.status === 'source-review-ready')
      exactInput({ actionId: value.actionId, digest: value.digest });
    return value;
  }
  async function read(/** @type {string} */ operation, /** @type {any} */ value) {
    if (!same()) return null;
    const r = await request(operation, value);
    if (!same()) return null;
    const input = operation === 'status' || operation === 'save' ? value : null;
    const checked = result(r, input);
    const retainedInput =
      input ??
      (checked.requestSaved === true
        ? exactInput({ actionId: checked.actionId, digest: checked.digest })
        : null);
    safeToReviewAgain =
      !!retainedInput &&
      checked.operation?.active === false &&
      ((operation === 'status' &&
        checked.status === 'source-review-ready' &&
        checked.requestSaved === false) ||
        (checked.status === 'held-for-review' && checked.requestSaved === true));
    return checked;
  }
  function apply(/** @type {any} */ value) {
    if (!state.input && value.requestSaved === true) {
      const input = exactInput({ actionId: value.actionId, digest: value.digest });
      set({ input });
      try {
        writeSaved({ ...input, sourceId: initial.sourceId });
      } catch {
        /* Keep the server's existing exact request in memory. */
      }
    }
    set({ ...value, canReviewAgain: safeToReviewAgain, error: '' });
    if (value.status === 'accepted' && !notified && same()) {
      notified = true;
      void Promise.resolve(
        accepted({ homeId: initial.homeId, callerId: initial.callerId, revision: value.revision })
      ).catch(() => {});
    }
  }
  async function operation(/** @type {()=>Promise<any>} */ action, /** @type {string} */ failure) {
    if (!same() || busy) return;
    busy = true;
    set({ error: '' });
    try {
      await action();
    } catch (e) {
      set({
        status: failure,
        error:
          e instanceof Error
            ? e.message
            : 'File save could not be confirmed. Continue checking this request.'
      });
    } finally {
      busy = false;
      set({});
    }
  }
  const controller = {
    get state() {
      return structuredClone(state);
    },
    dispose() {
      disposed = true;
    },
    async start() {
      return operation(async () => {
        const saved = readSaved();
        if (saved) {
          if (
            typeof saved !== 'object' ||
            Array.isArray(saved) ||
            Object.keys(saved).length !== 3 ||
            saved.sourceId !== initial.sourceId
          )
            throw Error('Saved file request cannot be restored');
          state.input = exactInput({ actionId: saved.actionId, digest: saved.digest });
          set({ input: state.input });
          const value = await read('status', state.input);
          if (value) apply(value);
        } else {
          set({ status: 'checking-source' });
          const value = await read('review', { sourceId: initial.sourceId });
          if (value) apply(value);
        }
      }, 'source-review-unconfirmed');
    },
    async save() {
      return operation(async () => {
        if (state.status === 'accepted' || state.status === 'held-for-review' || safeToReviewAgain)
          return;
        const input =
          state.input ??
          (state.status === 'source-review-ready'
            ? exactInput({ actionId: state.actionId, digest: state.digest })
            : null);
        if (!input) throw Error('Wait for the file review before saving');
        safeToReviewAgain = false;
        set({ input, status: 'checking-source', canReviewAgain: false });
        try {
          writeSaved({ ...input, sourceId: initial.sourceId });
        } catch {
          /* The server retains consent before publication; keep exact input here for a retry. */
        }
        try {
          const value = await read('save', input);
          if (value) apply(value);
        } catch (error) {
          const value = await read('status', input);
          if (!value) return;
          apply(value);
          if (value.status !== 'accepted')
            set({
              error: error instanceof Error ? error.message : 'File save could not be confirmed.'
            });
        }
      }, 'source-save-unconfirmed');
    },
    async reviewAgain() {
      return operation(async () => {
        if (!safeToReviewAgain || !state.input) return;
        const current = await read('status', state.input);
        if (!current) return;
        apply(current);
        if (!safeToReviewAgain) return;
        safeToReviewAgain = false;
        try {
          writeSaved(null);
        } catch {
          /* Only a known unsaved or terminal held reference is released. */
        }
        set({
          input: null,
          actionId: undefined,
          digest: undefined,
          status: 'checking-source',
          requestSaved: false,
          operation: { active: false },
          canReviewAgain: false
        });
        const value = await read('review', { sourceId: initial.sourceId });
        if (value) apply(value);
      }, 'source-review-unconfirmed');
    },
    async poll() {
      return operation(
        async () => {
          if (state.status === 'accepted' || state.status === 'held-for-review') return;
          const value = state.input
            ? await read('status', state.input)
            : await read('review', { sourceId: initial.sourceId });
          if (value) apply(value);
        },
        state.input ? 'source-save-unconfirmed' : 'source-review-unconfirmed'
      );
    }
  };
  return controller;
}
