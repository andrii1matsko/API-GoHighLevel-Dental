import { SanitizePipe } from './sanitize.pipe';

describe('SanitizePipe', () => {
  const pipe = new SanitizePipe();

  it('strips HTML tags from strings', () => {
    expect(pipe.transform('<b>hello</b>')).toBe('hello');
  });

  it('strips script tags and their content', () => {
    expect(pipe.transform('before<script>alert("xss")</script>after')).toBe(
      'beforeafter',
    );
  });

  it('strips event handlers', () => {
    expect(pipe.transform('text onerror="alert(1)"')).toBe('text');
  });

  it('strips javascript: protocol', () => {
    expect(pipe.transform('javascript:alert(1)')).toBe('alert(1)');
  });

  it('passes through clean strings', () => {
    expect(pipe.transform('hello world')).toBe('hello world');
  });

  it('passes through numbers', () => {
    expect(pipe.transform(42)).toBe(42);
  });

  it('passes through null and undefined', () => {
    expect(pipe.transform(null)).toBeNull();
    expect(pipe.transform(undefined)).toBeUndefined();
  });

  it('sanitizes strings nested in objects', () => {
    const input = {
      name: '<script>steal()</script>John',
      age: 30,
      address: {
        city: '<b>Stockholm</b>',
      },
    };

    const result = pipe.transform(input) as Record<string, unknown>;
    expect(result.name).toBe('John');
    expect(result.age).toBe(30);
    expect((result.address as Record<string, string>).city).toBe('Stockholm');
  });

  it('sanitizes strings in arrays', () => {
    const input = ['<i>hello</i>', 42, '<script>xss</script>clean'];
    const result = pipe.transform(input) as unknown[];
    expect(result[0]).toBe('hello');
    expect(result[1]).toBe(42);
    expect(result[2]).toBe('clean');
  });

  it('handles deeply nested structures', () => {
    const input = {
      level1: {
        level2: {
          level3: '<img src=x onerror="alert(1)">safe text',
        },
      },
    };

    const result = pipe.transform(input) as any;
    expect(result.level1.level2.level3).toBe('safe text');
  });

  it('handles empty strings', () => {
    expect(pipe.transform('')).toBe('');
  });

  it('handles empty objects and arrays', () => {
    expect(pipe.transform({})).toEqual({});
    expect(pipe.transform([])).toEqual([]);
  });
});
