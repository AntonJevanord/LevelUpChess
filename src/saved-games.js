import { Chess } from 'chess.js';
import { VariantGame, VARIANT, initVariantRules } from './variant-game';
import { ChessClock } from './clock';

export const SAVE_KEY = 'levelupchess.saved-game.v1';
export const MAX_PGN_SIZE = 256 * 1024;

export async function parsePgn(text) {
  if (typeof text !== 'string' || !text.trim() || text.length > MAX_PGN_SIZE) throw new Error('Enter a PGN game up to 256 KB.');
  if (/\[Variant\s+"levelup-knight"\s*\]/i.test(text)) {
    await initVariantRules();
    const candidate = new VariantGame();
    try { candidate.loadPgn(text); return candidate; }
    catch (error) { candidate.dispose(); throw new Error(`This blue-knight PGN could not be read. ${error.message}`); }
  }
  const candidate = new Chess();
  try { candidate.loadPgn(text); } catch { throw new Error('This PGN could not be read. Check the moves and starting position.'); }
  const variant = candidate.getHeaders().Variant;
  if (variant && !['standard', 'chess'].includes(variant.toLowerCase())) throw new Error('Only standard-chess and blue-knight PGN games are supported.');
  return candidate;
}

export function exportPgn(game) {
  const copy = game.variant === VARIANT ? new VariantGame() : new Chess();
  copy.loadPgn(game.pgn());
  const recorded = game.getHeaders().Result;
  const result = game.isCheckmate() ? (game.turn() === 'w' ? '0-1' : '1-0') : game.isDraw() ? '1/2-1/2' : ['1-0', '0-1', '1/2-1/2'].includes(recorded) ? recorded : '*';
  copy.setHeader('Result', result);
  const text = copy.pgn({ maxWidth: 80 });
  copy.dispose?.();
  return text;
}

export function makeSave(game, settings, clock) {
  return { version: 1, savedAt: new Date().toISOString(), pgn: exportPgn(game), settings, ...(clock ? { clock } : {}) };
}

export async function parseSave(text) {
  let data;
  try { data = JSON.parse(text); } catch { throw new Error('The saved game is damaged. Import a PGN backup instead.'); }
  if (!data || data.version !== 1 || typeof data.savedAt !== 'string' || Number.isNaN(Date.parse(data.savedAt))) throw new Error('The saved game format is not supported.');
  const settings = data.settings;
  if (!settings || !['local', 'engine'].includes(settings.opponent) || !['w', 'b'].includes(settings.humanSide) || !['easy', 'medium', 'hard'].includes(settings.difficulty) || typeof settings.flipped !== 'boolean' || (settings.upgradeBudget !== undefined && ![1, 2].includes(settings.upgradeBudget))) throw new Error('The saved game settings are damaged.');
  const game = await parsePgn(data.pgn);
  let clock;
  if (data.clock !== undefined) {
    const candidate = new ChessClock();
    try {
      candidate.restore(data.clock, game.history().length);
      if (candidate.active !== game.turn() || (candidate.expired && game.isGameOver())) throw new Error();
      clock = candidate.snapshot();
    } catch { game.dispose?.(); throw new Error('The saved clock is damaged. Import a PGN backup instead.'); }
  }
  return { game, settings, savedAt: data.savedAt, clock };
}
