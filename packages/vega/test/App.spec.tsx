import * as React from 'react';
import ReactTestRenderer from 'react-test-renderer';

import {App} from '../src/App';

describe('App', () => {
  it('renders the home screen without crashing', async () => {
    let renderer!: ReactTestRenderer.ReactTestRenderer;
    await ReactTestRenderer.act(async () => {
      renderer = ReactTestRenderer.create(<App />);
    });
    expect(renderer.toJSON()).not.toBeNull();
    await ReactTestRenderer.act(async () => {
      renderer.unmount();
    });
  });
});
