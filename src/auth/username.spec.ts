import { normalizeUsername } from './username.js';

describe('normalizeUsername', () => {
  it('trims and lowercases valid usernames', () => {
    expect(normalizeUsername('  Customer.A-1  ')).toBe('customer.a-1');
  });

  it('rejects values outside the username policy', () => {
    expect(normalizeUsername('ab')).toBeNull();
    expect(normalizeUsername('customer@example.com')).toBeNull();
    expect(normalizeUsername('customer name')).toBeNull();
    expect(normalizeUsername(null)).toBeNull();
  });
});
