import { render } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import AdditionalPage from './app.additional';

describe('additional page', () => {
  it('renders', () => {
    const { container } = render(<AdditionalPage />);

    expect(container).toMatchSnapshot();
  });
});
