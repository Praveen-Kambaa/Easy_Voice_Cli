import React, { useMemo } from 'react';
import { TouchableOpacity, View, Text, StyleSheet } from 'react-native';
import Icon from 'react-native-vector-icons/MaterialIcons';
import { useTheme } from '../context/ThemeContext';

export const MenuItem = ({
  icon,
  title,
  onPress,
  isActive = false,
  rightComponent,
}) => {
  const { colors } = useTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);

  return (
    <TouchableOpacity
      style={[styles.container, isActive && styles.activeContainer]}
      onPress={onPress}
      activeOpacity={0.7}
    >
      <View style={styles.leftContent}>
        <Icon
          name={icon}
          size={24}
          color={isActive ? colors.primary : colors.text.secondary}
        />
        <Text style={[styles.title, isActive && styles.activeTitle]}>{title}</Text>
      </View>
      {rightComponent && <View style={styles.rightContent}>{rightComponent}</View>}
    </TouchableOpacity>
  );
};

function createStyles(colors) {
  return StyleSheet.create({
    container: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      paddingHorizontal: 16,
      paddingVertical: 14,
      backgroundColor: 'transparent',
      borderRadius: 8,
      marginHorizontal: 8,
      marginVertical: 2,
    },
    activeContainer: {
      backgroundColor: colors.status.infoBg,
    },
    leftContent: {
      flexDirection: 'row',
      alignItems: 'center',
      flex: 1,
    },
    title: {
      fontSize: 16,
      fontWeight: '500',
      color: colors.text.secondary,
      marginLeft: 12,
    },
    activeTitle: {
      color: colors.primary,
      fontWeight: '600',
    },
    rightContent: {
      alignItems: 'flex-end',
    },
  });
}
