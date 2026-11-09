/*
 * Copyright (c) 2022 Amazon.com, Inc. or its affiliates.  All rights reserved.
 *
 * PROPRIETARY/CONFIDENTIAL.  USE IS SUBJECT TO LICENSE TERMS.
 */

import {Dimensions, PixelRatio} from 'react-native';
import {
  scaleWidth,
  scaleHeight,
  scaleFontSize,
  moderateScale,
  getImageScale,
} from '../scaling';

// react-native is a peer dependency and isn't installed in this package, so mock it virtually
jest.mock(
  'react-native',
  () => ({
    Dimensions: {
      get: jest.fn(() => ({width: 1920, height: 1080})),
    },
    PixelRatio: {
      roundToNearestPixel: jest.fn((value: number) => Math.round(value)),
    },
  }),
  {virtual: true},
);

describe('scaling utilities', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    // Reset to default dimensions
    (Dimensions.get as jest.Mock).mockReturnValue({width: 1920, height: 1080});
  });

  describe('scaleWidth', () => {
    it('should scale width based on screen width', () => {
      const result = scaleWidth(100);
      expect(result).toBe(100);
      expect(PixelRatio.roundToNearestPixel).toHaveBeenCalledWith(100);
    });

    it('should handle zero input', () => {
      const result = scaleWidth(0);
      expect(result).toBe(0);
    });

    it('should call PixelRatio.roundToNearestPixel', () => {
      scaleWidth(200);
      expect(PixelRatio.roundToNearestPixel).toHaveBeenCalled();
    });
  });

  describe('scaleHeight', () => {
    it('should scale height based on screen height', () => {
      const result = scaleHeight(100);
      expect(result).toBe(100);
      expect(PixelRatio.roundToNearestPixel).toHaveBeenCalledWith(100);
    });

    it('should handle zero input', () => {
      const result = scaleHeight(0);
      expect(result).toBe(0);
    });

    it('should call PixelRatio.roundToNearestPixel', () => {
      scaleHeight(200);
      expect(PixelRatio.roundToNearestPixel).toHaveBeenCalled();
    });
  });

  describe('scaleFontSize', () => {
    it('should scale font size based on screen width', () => {
      const result = scaleFontSize(16);
      expect(result).toBe(16);
      expect(PixelRatio.roundToNearestPixel).toHaveBeenCalledWith(16);
    });

    it('should handle large font sizes', () => {
      const result = scaleFontSize(80);
      expect(result).toBe(80);
    });
  });

  describe('moderateScale', () => {
    it('should apply moderate scaling with default factor', () => {
      const result = moderateScale(100);
      expect(PixelRatio.roundToNearestPixel).toHaveBeenCalled();
      expect(typeof result).toBe('number');
    });

    it('should apply moderate scaling with custom factor', () => {
      const result = moderateScale(100, 0.3);
      expect(PixelRatio.roundToNearestPixel).toHaveBeenCalled();
      expect(typeof result).toBe('number');
    });

    it('should return original size when factor is 0', () => {
      const result = moderateScale(100, 0);
      expect(result).toBe(100);
    });
  });

  describe('getImageScale', () => {
    it('should return image scale factor', () => {
      const result = getImageScale();
      expect(result).toBe(0.4);
    });
  });
});
