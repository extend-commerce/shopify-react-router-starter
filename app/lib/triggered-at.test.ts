import { describe, expect, it } from 'vitest';

import { parseTriggeredAt } from './triggered-at';

describe('parseTriggeredAt', () => {
  it('parses an ISO timestamp', () => {
    expect(parseTriggeredAt('2026-10-24T12:00:00.000Z')).toEqual(
      new Date('2026-10-24T12:00:00.000Z'),
    );
  });

  it.each([undefined, '', 'not a date'])('returns undefined for %j', value => {
    expect(parseTriggeredAt(value)).toBeUndefined();
  });
});
