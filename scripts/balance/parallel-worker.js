'use strict';

// A worker is the sole writer of its normal run directory. The coordinator
// receives progress, but durable checkpoints/journals remain the authority.
const { runMatches } = require('./run');
const controller = new AbortController();
let stop = null, started = false;
const send = message => new Promise(resolve => {
  if (!process.connected) return resolve();
  try { process.send(message, () => resolve()); }
  catch { resolve(); }
});
const progress = message => {
  // The parent may disappear between connected and send. Keep running long
  // enough for the disconnect handler to abort and close native engines.
  try { if (process.connected) process.send(message, () => {}); } catch { /* IPC closed. */ }
};
const abort = () => controller.abort();
process.on('SIGINT', abort);
process.on('SIGTERM', abort);
process.on('disconnect', abort);
process.on('message', async message => {
  if (message?.type === 'control') {
    if (message.action === 'now') abort();
    else if (['game', 'pair'].includes(message.action)) stop = message.action;
    return;
  }
  if (message?.type !== 'start' || started) return;
  started = true;
  try {
    const result = await runMatches({ ...message.options, signal: controller.signal,
      shouldStop: () => stop,
      onProgress: value => progress({ type: 'progress', message: value }),
    });
    await send({ type: 'done', result });
  } catch (error) {
    process.exitCode = 1;
    await send({ type: 'error', message: error.message });
  } finally {
    if (process.connected) process.disconnect();
  }
});
