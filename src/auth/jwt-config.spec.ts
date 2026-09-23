import { getJwtSecret } from './jwt-config.js';

describe('getJwtSecret', () => {
  const originalSecret = process.env.JWT_SECRET_BASE64;

  afterEach(() => {
    if (originalSecret === undefined) {
      delete process.env.JWT_SECRET_BASE64;
    } else {
      process.env.JWT_SECRET_BASE64 = originalSecret;
    }
  });

  it('accepts base64 secrets that decode to at least 32 bytes', () => {
    process.env.JWT_SECRET_BASE64 = Buffer.alloc(32, 7).toString('base64');

    expect(getJwtSecret()).toHaveLength(32);
  });

  it('rejects missing, malformed, and short secrets', () => {
    delete process.env.JWT_SECRET_BASE64;
    expect(() => getJwtSecret()).toThrow('JWT_SECRET_BASE64 is required.');

    process.env.JWT_SECRET_BASE64 = 'not valid base64!';
    expect(() => getJwtSecret()).toThrow(
      'JWT_SECRET_BASE64 must be valid base64.',
    );

    process.env.JWT_SECRET_BASE64 = Buffer.alloc(16, 7).toString('base64');
    expect(() => getJwtSecret()).toThrow(
      'JWT_SECRET_BASE64 must decode to at least 32 bytes.',
    );
  });
});
