const { test, expect } = require('@playwright/test');
const { getPlayableProfile } = require('../scripts/playable-profile');

const profile = getPlayableProfile();
const payload = {
  fen: 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1',
  variant: profile.variant,
  profileHash: profile.hash,
  registryHash: profile.registryHash,
  difficulty: 'easy',
};
const route = 'http://127.0.0.1:4173/api/engine/move';

test('experimental API rejects missing, mismatched, or nested profile identities', async ({ request }) => {
  for (const replacement of [{ profileHash: undefined }, { registryHash: '0'.repeat(64) }, { profileHash: { hash: profile.hash } }, { variant: 'levelup-design-00000000000000000000' }]) {
    const response = await request.post(route, { data: { ...payload, ...replacement } });
    expect(response.status()).toBe(400);
    expect((await response.json()).error).toContain('Experimental rules changed');
  }
});

test('experimental API accepts profile identities only and refuses supplied rule text', async ({ request }) => {
  for (const replacement of [{ config: '[injected:chess]' }, { profile: profile }, { variant: `${profile.variant}\nquit` }]) {
    const response = await request.post(route, { data: { ...payload, ...replacement } });
    expect(response.status()).toBe(400);
  }
});
