import React from 'react';
import { TouchableOpacity, View, Text, StyleSheet } from 'react-native';
import Icon from 'react-native-vector-icons/MaterialIcons';

export const MenuItem = ({ 
  icon, 
  title, 
  onPress, 
  isActive = false,
  rightComponent 
}) => {
  return (
    <TouchableOpacity
      style={[
        styles.container,
        isActive && styles.activeContainer,
      ]}
      onPress={onPress}
      activeOpacity={0.7}
    >
      <View style={styles.leftContent}>
        <Icon 
          name={icon} 
          size={24} 
          color={isActive ? '#3498DB' : '#495057'} 
        />
        <Text style={[
          styles.title,
          isActive && styles.activeTitle,
        ]}>
          {title}
        </Text>
      </View>
      {rightComponent && (
        <View style={styles.rightContent}>
          {rightComponent}
        </View>
      )}
    </TouchableOpacity>
  );
};

const styles = StyleSheet.create({
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
    backgroundColor: '#E3F2FD',
  },
  leftContent: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
  },
  title: {
    fontSize: 16,
    fontWeight: '500',
    color: '#495057',
    marginLeft: 12,
  },
  activeTitle: {
    color: '#3498DB',
    fontWeight: '600',
  },
  rightContent: {
    alignItems: 'flex-end',
  },
});
