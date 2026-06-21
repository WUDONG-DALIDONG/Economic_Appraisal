import { describe, it, expect } from 'vitest';
import { normalizeFullwidth } from '../src/utils/normalizeFullwidth';

describe('normalizeFullwidth', () => {
  it('converts fullwidth parentheses', () => {
    expect(normalizeFullwidth('（')).toBe('(');
    expect(normalizeFullwidth('）')).toBe(')');
    expect(normalizeFullwidth('［')).toBe('[');
    expect(normalizeFullwidth('］')).toBe(']');
  });

  it('converts fullwidth numbers', () => {
    expect(normalizeFullwidth('０１２３４５６７８９')).toBe('0123456789');
  });

  it('converts fullwidth letters', () => {
    expect(normalizeFullwidth('ＡＢＣａｂｃ')).toBe('ABCabc');
  });

  it('converts fullwidth punctuation', () => {
    expect(normalizeFullwidth('：；，。！？')).toBe(':;,.!?');
    expect(normalizeFullwidth('＃＄％＆＊＋－／')).toBe('#$%&*+-/');
    expect(normalizeFullwidth('＜＞＾｜￣＿｀')).toBe('<>^|~_`');
    expect(normalizeFullwidth('＠')).toBe('@');
    expect(normalizeFullwidth('　')).toBe(' ');
  });

  it('preserves string literals', () => {
    expect(normalizeFullwidth('="ＡＢＣ"')).toBe('="ＡＢＣ"');
    expect(normalizeFullwidth("='１２３'")).toBe("='１２３'");
  });

  it('converts mixed formula with string literal', () => {
    const input = '=ＰＭＴ（０．０３６，１５，"全角リテラル"）';
    const expected = '=PMT(0.036,15,"全角リテラル")';
    expect(normalizeFullwidth(input)).toBe(expected);
  });

  it('converts full-width brackets (Japanese/Chinese style)', () => {
    expect(normalizeFullwidth('【')).toBe('[');
    expect(normalizeFullwidth('】')).toBe(']');
    expect(normalizeFullwidth('｛')).toBe('{');
    expect(normalizeFullwidth('｝')).toBe('}');
  });

  it('leaves Chinese characters intact', () => {
    expect(normalizeFullwidth('项目名称')).toBe('项目名称');
    expect(normalizeFullwidth('参数')).toBe('参数');
  });

  it('handles empty string', () => {
    expect(normalizeFullwidth('')).toBe('');
  });

  it('handles already half-width string', () => {
    expect(normalizeFullwidth('=PMT(0.036,15)')).toBe('=PMT(0.036,15)');
  });
});
