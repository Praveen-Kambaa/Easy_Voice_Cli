import React from 'react';
import { View, StyleSheet } from 'react-native';
import { AuthLogo } from '../components/auth/AuthLogo';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { useAuth } from '../context/AuthContext';
import LoginScreen from '../screens/Auth/LoginScreen';
import RegisterScreen from '../screens/Auth/RegisterScreen';
import AppNavigator from './DrawerNavigator';

const Stack = createNativeStackNavigator();

const AuthNavigator = () => {
  const { user, isLoading } = useAuth();

  if (isLoading) {
    return (
      <View style={styles.loadingContainer}>
        <AuthLogo variant="default" style={styles.loadingLogo} />
      </View>
    );
  }

  if (user) {
    return (
      <Stack.Navigator screenOptions={{ headerShown: false, animation: 'fade' }}>
        <Stack.Screen name="Main" component={AppNavigator} />
      </Stack.Navigator>
    );
  }

  return (
    <Stack.Navigator screenOptions={{ headerShown: false, animation: 'fade' }}>
      <Stack.Screen name="Login" component={LoginScreen} />
      <Stack.Screen name="Register" component={RegisterScreen} />
    </Stack.Navigator>
  );
};

const styles = StyleSheet.create({
  loadingContainer: {
    flex: 1,
    backgroundColor: '#000000',
  },
  loadingLogo: {
    flex: 1,
    justifyContent: 'center',
  },
});

export default AuthNavigator;
