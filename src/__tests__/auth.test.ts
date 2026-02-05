import { describe, it, expect, beforeEach } from 'bun:test';
import { createHmac } from 'crypto';
import { validateInitData } from '../api/middleware/auth';

// Helper to create valid initData
function createTestInitData(options: {
  userId?: number;
  authDate?: number;
  overrideHash?: string;
  botToken?: string;
} = {}) {
  const botToken = options.botToken || process.env.BOT_TOKEN || 'test_bot_token';
  const userId = options.userId || 123456789;
  const authDate = options.authDate || Math.floor(Date.now() / 1000);
  
  const user = JSON.stringify({
    id: userId,
    first_name: 'Test',
    username: 'testuser'
  });
  
  // Create data string (sorted alphabetically)
  const dataString = [
    `auth_date=${authDate}`,
    `user=${user}`
  ].sort().join('\n');
  
  // Calculate hash
  const secretKey = createHmac('sha256', 'WebAppData')
    .update(botToken)
    .digest();
  
  const hash = options.overrideHash || createHmac('sha256', secretKey)
    .update(dataString)
    .digest('hex');
  
  // Build URL-encoded string
  const params = new URLSearchParams();
  params.set('user', user);
  params.set('auth_date', authDate.toString());
  params.set('hash', hash);
  
  return params.toString();
}

describe('validateInitData', () => {
  beforeEach(() => {
    process.env.BOT_TOKEN = 'test_bot_token';
  });
  
  it('rejects missing initData', () => {
    expect(validateInitData('')).toBeNull();
    expect(validateInitData(null as any)).toBeNull();
    expect(validateInitData(undefined as any)).toBeNull();
  });
  
  it('rejects expired initData (>24h)', () => {
    const expiredDate = Math.floor(Date.now() / 1000) - (25 * 60 * 60); // 25 hours ago
    const initData = createTestInitData({ authDate: expiredDate });
    expect(validateInitData(initData)).toBeNull();
  });
  
  it('rejects tampered hash', () => {
    const initData = createTestInitData({ overrideHash: 'invalid_hash_value' });
    expect(validateInitData(initData)).toBeNull();
  });
  
  it('rejects wrong bot token', () => {
    // Create with different bot token than env
    const initData = createTestInitData({ botToken: 'different_token' });
    expect(validateInitData(initData)).toBeNull();
  });
  
  it('accepts valid initData', () => {
    const initData = createTestInitData();
    const result = validateInitData(initData);
    
    expect(result).not.toBeNull();
    expect(result?.user.id).toBe(123456789);
    expect(result?.user.first_name).toBe('Test');
    expect(result?.user.username).toBe('testuser');
  });
  
  it('extracts user ID correctly', () => {
    const initData = createTestInitData({ userId: 987654321 });
    const result = validateInitData(initData);
    
    expect(result).not.toBeNull();
    expect(result?.user.id).toBe(987654321);
  });
  
  it('accepts initData from 23 hours ago', () => {
    const recentDate = Math.floor(Date.now() / 1000) - (23 * 60 * 60);
    const initData = createTestInitData({ authDate: recentDate });
    const result = validateInitData(initData);
    
    expect(result).not.toBeNull();
  });
});
