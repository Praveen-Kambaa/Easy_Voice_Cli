import React from 'react';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import AskQuestionScreen from '../screens/AskQuestion/AskQuestionScreen';
import AiQaHistoryScreen from '../screens/AskQuestion/AiQaHistoryScreen';
import AiQaSavedScreen from '../screens/AskQuestion/AiQaSavedScreen';

const Stack = createNativeStackNavigator();

const AskQuestionStack = () => (
  <Stack.Navigator screenOptions={{ headerShown: false, animation: 'slide_from_right' }}>
    <Stack.Screen name="AskQuestionMain" component={AskQuestionScreen} />
    <Stack.Screen name="AiQaHistory" component={AiQaHistoryScreen} />
    <Stack.Screen name="AiQaSaved" component={AiQaSavedScreen} />
  </Stack.Navigator>
);

export default AskQuestionStack;
