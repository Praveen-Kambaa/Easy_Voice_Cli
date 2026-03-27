import React from 'react';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import TranslatorScreen from '../screens/Translator/TranslatorScreen';
import TranslatorHistoryScreen from '../screens/Translator/TranslatorHistoryScreen';
import TranslatorSavedScreen from '../screens/Translator/TranslatorSavedScreen';

const Stack = createNativeStackNavigator();

const TranslatorStack = () => (
  <Stack.Navigator screenOptions={{ headerShown: false, animation: 'slide_from_right' }}>
    <Stack.Screen name="TranslatorMain" component={TranslatorScreen} />
    <Stack.Screen name="TranslatorHistory" component={TranslatorHistoryScreen} />
    <Stack.Screen name="TranslatorSaved" component={TranslatorSavedScreen} />
  </Stack.Navigator>
);

export default TranslatorStack;
