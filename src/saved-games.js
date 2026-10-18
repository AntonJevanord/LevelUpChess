import { Chess } from 'chess.js';
import { VariantGame, CURRENT_VARIANT, PIECE_VARIANT, SUPPORTED_VARIANTS, initVariantRules } from './variant-game';
import { ChessClock } from './clock';
import { UPGRADE_BUDGETS, PIECE_BUDGETS } from './piece-catalog';

export const SAVE_KEY = 'levelupchess.saved-game.v1';
export const MAX_PGN_SIZE = 256 * 1024;

export async function parsePgn(text) {
  if (typeof text !== 'string' || !text.trim() || text.length > MAX_PGN_SIZE) throw new Error('Enter a PGN game up to 256 KB.');
  const headerVariant = text.match(/\[Variant\s+"([^"\r\n]+)"\s*\]/)?.[1].toLowerCase();
  if (SUPPORTED_VARIANTS.includes(headerVariant)) {
    await initVariantRules();
    const candidate = new VariantGame(undefined, headerVariant);
    try { candidate.loadPgn(text); return candidate; }
    catch (error) { candidate.dispose(); throw new Error(`This upgrade PGN could not be read. ${error.message}`); }
  }
  const candidate = new Chess();
  try { candidate.loadPgn(text); } catch { throw new Error('This PGN could not be read. Check the moves and starting position.'); }
  const variant = candidate.getHeaders().Variant;
  if (variant && !['standard', 'chess'].includes(variant.toLowerCase())) throw new Error('Only standard-chess and upgrade PGN games are supported.');
  return candidate;
}

export function exportPgn(game) {
  const copy = SUPPORTED_VARIANTS.includes(game.variant) ? new VariantGame(undefined, game.variant) : new Chess();
  try {
    copy.loadPgn(game.pgn());
    const recorded = game.getHeaders().Result;
    const result = game.isCheckmate() ? (game.turn() === 'w' ? '0-1' : '1-0') : game.isDraw() ? '1/2-1/2' : ['1-0', '0-1', '1/2-1/2'].includes(recorded) ? recorded : '*';
    copy.setHeader('Result', result);
    return copy.pgn({ maxWidth: 80 });
  } finally {
    copy.dispose?.();
  }
}

export function makeSave(game, settings, clock) {
  return { version: 1, savedAt: new Date().toISOString(), pgn: exportPgn(game), settings, ...(clock ? { clock } : {}) };
}

export async function parseSave(text) {
  let data;
  try { data = JSON.parse(text); } catch { throw new Error('The saved game is damaged. Import a PGN backup instead.'); }
  if (!data || data.version !== 1 || typeof data.savedAt !== 'string' || Number.isNaN(Date.parse(data.savedAt))) throw new Error('The saved game format is not supported.');
  const settings = data.settings;
  if (!settings || !['local', 'engine'].includes(settings.opponent) || !['w', 'b'].includes(settings.humanSide) || !['easy', 'medium', 'hard'].includes(settings.difficulty) || typeof settings.flipped !== 'boolean') throw new Error('The saved game settings are damaged.');
  const game = await parsePgn(data.pgn);
  try {
    const budgets = game.variant === CURRENT_VARIANT ? PIECE_BUDGETS : game.variant === PIECE_VARIANT ? PIECE_BUDGETS.filter(budget => budget <= 39) : UPGRADE_BUDGETS;
    if (settings.upgradeBudget !== undefined && !budgets.includes(settings.upgradeBudget)) throw new Error('The saved game settings are damaged.');
    let clock;
    if (data.clock !== undefined) {
      const candidate = new ChessClock();
      try {
        candidate.restore(data.clock, game.history().length);
        if (candidate.active !== game.turn() || (candidate.expired && game.isGameOver())) throw new Error();
        clock = candidate.snapshot();
      } catch { throw new Error('The saved clock is damaged. Import a PGN backup instead.'); }
    }
    return { game, settings, savedAt: data.savedAt, clock };
  } catch (error) {
    game.dispose?.();
    throw error;
  }
}
