import {
  expandSwedishShortPersonnummer,
  normalizeNordicPersonalId,
} from './personnummer.util';

describe('normalizeNordicPersonalId', () => {
  it('keeps Norwegian 11-digit fødselsnummer', () => {
    expect(normalizeNordicPersonalId('15038500047')).toBe('15038500047');
  });

  it('keeps Swedish 12-digit personnummer', () => {
    expect(normalizeNordicPersonalId('199408219419')).toBe('199408219419');
  });

  it('expands Swedish 10-digit short form (with separators)', () => {
    expect(normalizeNordicPersonalId('940821-9419')).toBe('199408219419');
  });

  it('expands bare 10-digit Swedish id from GHL', () => {
    expect(normalizeNordicPersonalId('9408219419')).toBe('199408219419');
  });

  it('rejects empty / too short', () => {
    expect(normalizeNordicPersonalId('')).toBeNull();
    expect(normalizeNordicPersonalId('123')).toBeNull();
    expect(normalizeNordicPersonalId(null)).toBeNull();
  });
});

describe('expandSwedishShortPersonnummer', () => {
  it('uses 1900s when 2000s would be in the future', () => {
    expect(expandSwedishShortPersonnummer('9408219419')).toBe('199408219419');
  });
});
