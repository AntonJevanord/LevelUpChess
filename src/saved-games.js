import { Chess } from 'chess.js';

export const SAVE_KEY = 'levelupchess.saved-game.v1';
export const MAX_PGN_SIZE = 256 * 1024;

export function parsePgn(text) {
  if (typeof text !== 'string' || !text.trim() || text.length > MAX_PGN_SIZE) throw new Error('Enter a PGN game up to 256 KB.');
  const candidate = new Chess();
  try { candidate.loadPgn(text); } catch { throw new Error('This PGN could not be read. Check the moves and starting position.'); }
  const variant = candidate.getHeaders().Variant;
  if (variant && !['standard', 'chess'].includes(variant.toLowerCase())) throw new Error('Only standard-chess PGN games are supported.');
  return candidate;
}

export function exportPgn(game) {
  const copy = new Chess();
  copy.loadPgn(game.pgn());
  const recorded = game.getHeaders().Result;
  const result = game.isCheckmate() ? (game.turn() === 'w' ? '0-1' : '1-0') : game.isDraw() ? '1/2-1/2' : ['1-0', '0-1', '1/2-1/2'].includes(recorded) ? recorded : '*';
  copy.setHeader('Result', result);
  return copy.pgn({ maxWidth: 80 });
}

export function makeSave(game, settings) {
  return { version: 1, savedAt: new Date().toISOString(), pgn: exportPgn(game), settings };
}

export function parseSave(text) {
  let data;
  try { data = JSON.parse(text); } catch { throw new Error('The saved game is damaged. Import a PGN backup instead.'); }
  if (!data || data.version !== 1 || typeof data.savedAt !== 'string' || Number.isNaN(Date.parse(data.savedAt))) throw new Error('The saved game format is not supported.');
  const settings = data.settings;
  if (!settings || !['local', 'engine'].includes(settings.opponent) || !['w', 'b'].includes(settings.humanSide) || !['easy', 'medium', 'hard'].includes(settings.difficulty) || typeof settings.flipped !== 'boolean') throw new Error('The saved game settings are damaged.');
  return { game: parsePgn(data.pgn), settings, savedAt: data.savedAt };
}
