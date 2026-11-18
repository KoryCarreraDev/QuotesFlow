import { describe, expect, it } from 'vitest';
import { changedValues } from '@/application/ports/services/IAuditLogger.js';

// F3-A21: el helper solo mira los campos de la lista y solo devuelve los que de verdad cambiaron.

describe('changedValues', () => {
  it('devuelve de qué a qué cambió cada campo de la lista', () => {
    expect(changedValues({ price: '10.00', note: 'a' }, { price: '12.00', note: 'b' }, ['price'])).toEqual({
      price: { from: '10.00', to: '12.00' },
    });
  });

  it('ausente es null, en los dos sentidos', () => {
    expect(changedValues({}, { price: '5.00' }, ['price'])).toEqual({ price: { from: null, to: '5.00' } });
    expect(changedValues({ price: '5.00' }, { price: undefined }, ['price'])).toEqual({
      price: { from: '5.00', to: null },
    });
  });

  it('un campo igual antes y después no aparece, y sin cambios devuelve un objeto vacío', () => {
    expect(changedValues({ price: '5.00' }, { price: '5.00' }, ['price'])).toEqual({});
  });

  it('nunca copia un campo que no esté en la lista, aunque cambie', () => {
    const result = changedValues({ secret: 'antes' }, { secret: 'después' }, ['price']);

    expect(JSON.stringify(result)).not.toContain('secret');
  });
});
