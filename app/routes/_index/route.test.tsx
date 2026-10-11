import { render } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import Index from './route';

describe('landing page', () => {
  it('renders', () => {
    const { container } = render(<Index />);

    expect(container).toMatchSnapshot();
  });
});
