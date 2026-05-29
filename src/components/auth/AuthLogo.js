import React, { useMemo } from 'react';
import { View, Image, StyleSheet } from 'react-native';

const LOGO_SOURCE = require('../../assets/splashscreen.png');

const SIZES = {
  default: { width: 240, height: 120, paddingV: 16, paddingH: 20, radius: 14 },
  compact: { width: 200, height: 100, paddingV: 12, paddingH: 16, radius: 12 },
  full: { width: '100%', height: 140, paddingV: 20, paddingH: 24, radius: 0 },
};

/**
 * Type Easy logo on a fixed black panel — same look on login, permissions, and loading screens.
 */
export function AuthLogo({ variant = 'default', style, imageStyle }) {
  const styles = useMemo(() => createStyles(variant), [variant]);

  return (
    <View style={[styles.wrap, style]}>
      <Image
        source={LOGO_SOURCE}
        style={[styles.image, imageStyle]}
        resizeMode="contain"
      />
    </View>
  );
}

function createStyles(variant) {
  const dim = SIZES[variant] ?? SIZES.default;
  const fullWidth = dim.width === '100%';

  return StyleSheet.create({
    wrap: {
      alignItems: 'center',
      justifyContent: 'center',
      alignSelf: fullWidth ? 'stretch' : 'center',
      backgroundColor: '#000000',
      borderRadius: dim.radius,
      paddingVertical: dim.paddingV,
      paddingHorizontal: dim.paddingH,
      overflow: 'hidden',
    },
    image: {
      width: fullWidth ? '100%' : dim.width,
      height: dim.height,
    },
  });
}
