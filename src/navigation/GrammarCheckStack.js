import React from 'react';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import GrammarCheckScreen from '../screens/GrammarCheck/GrammarCheckScreen';
import GrammarCheckHistoryScreen from '../screens/GrammarCheck/GrammarCheckHistoryScreen';
import GrammarCheckSavedScreen from '../screens/GrammarCheck/GrammarCheckSavedScreen';

const Stack = createNativeStackNavigator();

const GrammarCheckStack = () => (
  <Stack.Navigator screenOptions={{ headerShown: false, animation: 'slide_from_right' }}>
    <Stack.Screen name="GrammarCheckMain" component={GrammarCheckScreen} />
    <Stack.Screen name="GrammarCheckHistory" component={GrammarCheckHistoryScreen} />
    <Stack.Screen name="GrammarCheckSaved" component={GrammarCheckSavedScreen} />
  </Stack.Navigator>
);

export default GrammarCheckStack;
