import React from 'react';
import { View, Text, StyleSheet, TouchableOpacity } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useNavigation } from '@react-navigation/native';

export const AppHeader = ({ title, showMenuButton = true, rightComponent }) => {
  const insets = useSafeAreaInsets();
  const navigation = useNavigation();

  const handleMenuPress = () => {
    navigation.openDrawer();
  };

  return (
    <View style={[styles.container, { paddingTop: insets.top }]}>
      <View style={styles.headerContent}>
        {/* Left: Menu Button */}
        {showMenuButton && (
          <TouchableOpacity 
            style={styles.menuButton} 
            onPress={handleMenuPress}
            activeOpacity={0.7}
          >
            <Text style={styles.menuIcon}>☰</Text>
          </TouchableOpacity>
        )}

        {/* Center: Title */}
        <View style={[styles.titleContainer, !showMenuButton && { marginLeft: 16 }]}>
          <Text style={styles.title}>{title}</Text>
        </View>

        {/* Right: Optional Component */}
        <View style={styles.rightContainer}>
          {rightComponent || <View style={styles.placeholder} />}
        </View>
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    backgroundColor: '#FFFFFF',
    borderBottomWidth: 1,
    borderBottomColor: '#E5E7EB',
    shadowColor: '#000',
    shadowOffset: {
      width: 0,
      height: 1,
    },
    shadowOpacity: 0.05,
    shadowRadius: 2,
    elevation: 2,
  },
  headerContent: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingVertical: 16,
    minHeight: 64,
  },
  menuButton: {
    padding: 12,
    borderRadius: 12,
    backgroundColor: '#F8F9FA',
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 16,
  },
  menuIcon: {
    fontSize: 24,
    color: '#2C3E50',
  },
  titleContainer: {
    flex: 1,
    alignItems: 'center',
  },
  title: {
    fontSize: 20,
    fontWeight: '700',
    color: '#1F2937',
    letterSpacing: -0.5,
  },
  rightContainer: {
    width: 48,
    alignItems: 'flex-end',
  },
  placeholder: {
    width: 48,
  },
});
