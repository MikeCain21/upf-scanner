'use strict';

const { isValidNovaScore, isValidBarcode, MAX_INGREDIENTS_TEXT_LENGTH } = require('../../background/message-validator');

describe('isValidNovaScore', () => {
  it.each([1, 2, 3, 4])('accepts valid score %d', (score) => {
    expect(isValidNovaScore(score)).toBe(true);
  });

  it.each([0, 5, -1, null, undefined, 'four', 1.5, NaN, '1'])('rejects invalid score %p', (score) => {
    expect(isValidNovaScore(score)).toBe(false);
  });
});

describe('isValidBarcode', () => {
  it('accepts a 13-digit EAN barcode', () => {
    expect(isValidBarcode('5000169168557')).toBe(true);
  });

  it('accepts a 12-digit UPC barcode', () => {
    expect(isValidBarcode('028400090018')).toBe(true);
  });

  it.each(['', '123', 'abc1234567890', null, undefined, 12345678901234, '12345678901234'])
    ('rejects invalid barcode %p', (barcode) => {
      expect(isValidBarcode(barcode)).toBe(false);
    });
});

describe('MAX_INGREDIENTS_TEXT_LENGTH', () => {
  it('is 50000', () => {
    expect(MAX_INGREDIENTS_TEXT_LENGTH).toBe(50_000);
  });
});
