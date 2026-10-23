import {coverBands, coverLetter, fnv1a, hslToHex, hueFor} from '../color';

describe('color helpers', () => {
  it('hashes deterministically', () => {
    expect(fnv1a('forest-speaks')).toBe(fnv1a('forest-speaks'));
    expect(fnv1a('forest-speaks')).not.toBe(fnv1a('canopy'));
  });

  it('keeps hues inside the colour wheel', () => {
    ['forest-speaks', 'canopy', 'roots-rivers', ''].forEach(seed => {
      const hue = hueFor(seed);
      expect(hue).toBeGreaterThanOrEqual(0);
      expect(hue).toBeLessThan(360);
    });
  });

  it('converts hsl to a six-digit hex colour', () => {
    expect(hslToHex(0, 100, 50)).toBe('#ff0000');
    expect(hslToHex(120, 100, 50)).toBe('#00ff00');
    expect(hslToHex(240, 100, 50)).toBe('#0000ff');
  });

  it('renders eight bands, darkening towards the bottom', () => {
    const bands = coverBands('tidewater');
    expect(bands).toHaveLength(8);
    bands.forEach(band => expect(band).toMatch(/^#[0-9a-f]{6}$/));
    expect(bands[0]).not.toBe(bands[7]);
  });

  it('gives every seed its own palette', () => {
    const first = coverBands('forest-speaks')[0];
    const second = coverBands('canopy')[0];
    expect(first).not.toBe(second);
  });

  it('uses the first letter, or a note glyph for an empty title', () => {
    expect(coverLetter('The Forest Speaks')).toBe('T');
    expect(coverLetter('  tidewater')).toBe('T');
    expect(coverLetter('')).toBe('\u266A');
  });
});
