const fs = require('node:fs');

const SHARING_ERRORS = new Set(['EPERM', 'EACCES', 'EBUSY']);
const RETRY_DELAYS_MS = [25, 50, 100, 200, 400, 500];
const sleeper = new Int32Array(new SharedArrayBuffer(4));

function retry(operation, description, target, ignoreMissing = false) {
  for (let attempt = 0; ; attempt++) {
    try { return operation(); }
    catch (cause) {
      if (ignoreMissing && cause.code === 'ENOENT') return;
      if (!SHARING_ERRORS.has(cause.code)) throw cause;
      if (attempt === RETRY_DELAYS_MS.length) {
        const error = new Error(`Cannot ${description} ${target} after ${attempt + 1} attempts: ${cause.code}. The file may still be open in another program; retry when it is available.`, { cause });
        error.code = cause.code;
        error.path = target;
        throw error;
      }
      Atomics.wait(sleeper, 0, 0, RETRY_DELAYS_MS[attempt]);
    }
  }
}

// Always retry the same atomic rename. Never remove an existing destination.
function renameWithRetrySync(source, destination) {
  return retry(() => fs.renameSync(source, destination), 'replace', destination);
}

function unlinkWithRetrySync(file, mayRemove = () => true) {
  return retry(() => { if (mayRemove()) fs.unlinkSync(file); }, 'remove', file, true);
}

module.exports = { renameWithRetrySync, unlinkWithRetrySync };
