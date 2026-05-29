import React, { useMemo } from 'react';
import { TouchableOpacity, StyleSheet } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import Icon from 'react-native-vector-icons/MaterialIcons';
import { useTheme } from '../../context/ThemeContext';

export const MenuButton = ({ size = 24, color, style }) => {
  const navigation = useNavigation();
  const { colors } = useTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const iconColor = color ?? colors.header.icon;

  const handlePress = () => {
    navigation.openDrawer();
  };

  return (
    <TouchableOpacity
      style={[styles.button, style]}
      onPress={handlePress}
      activeOpacity={0.7}
    >
      <Icon name="menu" size={size} color={iconColor} />
    </TouchableOpacity>
  );
};

function createStyles(colors) {
  return StyleSheet.create({
    button: {
      padding: 12,
      borderRadius: 12,
      backgroundColor: colors.backgroundAlt,
      justifyContent: 'center',
      alignItems: 'center',
    },
  });
}
