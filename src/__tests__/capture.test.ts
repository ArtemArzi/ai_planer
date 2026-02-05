import { describe, it, expect } from 'bun:test';
import { processMessage } from '../lib/capture';

describe('Capture Precedence: Tag Detection', () => {
  it('#w tag → folder=work, even with URL', () => {
    const result = processMessage('#w http://example.com');
    expect(result.folder).toBe('work');
    expect(result.hasExplicitTag).toBe(true);
    expect(result.content).toBe('http://example.com');
  });
  
  it('#p tag → folder=personal', () => {
    const result = processMessage('#p buy milk');
    expect(result.folder).toBe('personal');
    expect(result.hasExplicitTag).toBe(true);
  });
  
  it('#i tag → folder=ideas, isIdea=true', () => {
    const result = processMessage('#i startup concept');
    expect(result.folder).toBe('ideas');
    expect(result.hasExplicitTag).toBe(true);
  });
  
  it('unknown tag #x → AI classification needed', () => {
    const result = processMessage('#x random text');
    expect(result.needsAiClassification).toBe(true);
    expect(result.hasExplicitTag).toBe(false);
  });
  
  it('tag case-insensitive: #W = #w', () => {
    const result = processMessage('#W meeting notes');
    expect(result.folder).toBe('work');
    expect(result.hasExplicitTag).toBe(true);
  });
});

describe('Capture Precedence: Content Length (Notes)', () => {
  const longText = 'a'.repeat(501);
  
  it('>500 chars without tag → folder=notes, type=note', () => {
    const result = processMessage(longText);
    expect(result.folder).toBe('notes');
    expect(result.type).toBe('note');
    expect(result.status).toBe('active'); // Notes bypass inbox
    expect(result.needsAiClassification).toBe(false);
  });
  
  it('>500 chars WITH #w tag → folder=work, type=note', () => {
    const result = processMessage('#w ' + longText);
    expect(result.folder).toBe('work'); // Tag wins for folder
    expect(result.type).toBe('note');   // Long content = note type
    expect(result.hasExplicitTag).toBe(true);
  });
  
  it('exactly 500 chars → type=task, not note', () => {
    const result = processMessage('a'.repeat(500));
    expect(result.type).toBe('task');
  });
});

describe('Capture Precedence: Media Detection', () => {
  it('media without tag → folder=media', () => {
    const result = processMessage('', { hasMedia: true, mediaType: 'photo' });
    expect(result.folder).toBe('media');
    expect(result.mediaType).toBe('photo');
  });
  
  it('media WITH #w tag → folder=work (tag wins)', () => {
    const result = processMessage('#w cool picture', { hasMedia: true, mediaType: 'photo' });
    expect(result.folder).toBe('work');
    expect(result.mediaType).toBe('photo');
    expect(result.hasExplicitTag).toBe(true);
  });
  
  it('URL without tag → folder=media, mediaType=link', () => {
    const result = processMessage('check this out https://example.com');
    expect(result.folder).toBe('media');
    expect(result.mediaType).toBe('link');
  });
  
  it('URL WITH #w tag → folder=work', () => {
    const result = processMessage('#w https://work.example.com/doc');
    expect(result.folder).toBe('work');
    expect(result.mediaType).toBe('link');
  });
});

describe('Capture Precedence: AI Classification', () => {
  it('plain text → needsAiClassification=true', () => {
    const result = processMessage('buy groceries');
    expect(result.needsAiClassification).toBe(true);
    expect(result.folder).toBe('personal'); // Default
  });
  
  it('empty after tag → error/empty content', () => {
    const result = processMessage('#w   ');
    expect(result.content.trim()).toBe('');
    // Empty content should be flagged
  });
});

describe('Capture: Status Assignment', () => {
  const longText = 'a'.repeat(501);
  
  it('regular task → status=inbox', () => {
    const result = processMessage('buy milk');
    expect(result.status).toBe('inbox');
  });
  
  it('note without tag → status=active (bypasses inbox)', () => {
    const result = processMessage(longText);
    expect(result.status).toBe('active');
    expect(result.folder).toBe('notes');
  });
  
  it('note WITH tag → status=inbox (has tag, goes to folder)', () => {
    const result = processMessage('#w ' + longText);
    expect(result.status).toBe('inbox'); // Tagged notes go to inbox in their folder
  });
});
