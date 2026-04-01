import React, { useState, useCallback, useMemo } from 'react';
import { View, StyleSheet, ActivityIndicator } from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import AskQuestionScreen from '../screens/AskQuestion/AskQuestionScreen';
import AiQaHistoryScreen from '../screens/AskQuestion/AiQaHistoryScreen';
import AiQaSavedScreen from '../screens/AskQuestion/AiQaSavedScreen';
import { canAccessAskQuestionFeature } from '../services/floatingMicConfig';
import { ScreenContainer } from '../components/common/ScreenContainer';
import { AppHeader } from '../components/Header/AppHeader';
import AskQuestionAccessBlocked from '../components/AskQuestion/AskQuestionAccessBlocked';
import { Colors } from '../theme/Colors';

const Stack = createNativeStackNavigator();

const NESTED_NAMES = new Set(['AiQaHistory', 'AiQaSaved']);

function AskQuestionNavigator({ initialRouteName, historyInitialParams, savedInitialParams }) {
  return (
    <Stack.Navigator
      initialRouteName={initialRouteName}
      screenOptions={{ headerShown: false, animation: 'slide_from_right' }}
    >
      <Stack.Screen name="AskQuestionMain" component={AskQuestionScreen} />
      <Stack.Screen
        name="AiQaHistory"
        component={AiQaHistoryScreen}
        initialParams={historyInitialParams}
      />
      <Stack.Screen name="AiQaSaved" component={AiQaSavedScreen} initialParams={savedInitialParams} />
    </Stack.Navigator>
  );
}

/**
 * Ask Question stack (Android): floating mic service running + Ask Question overlay toggle in Settings.
 */
const AskQuestionStack = ({ route, navigation }) => {
  const [phase, setPhase] = useState('loading');
  const { initialRouteName, historyInitialParams, savedInitialParams } = useMemo(() => {
    const p = route?.params;
    const name = p?.screen;
    const nested = NESTED_NAMES.has(name) ? name : 'AskQuestionMain';
    const inner = p?.params;
    return {
      initialRouteName: nested,
      historyInitialParams: nested === 'AiQaHistory' ? inner : undefined,
      savedInitialParams: nested === 'AiQaSaved' ? inner : undefined,
    };
  }, [route?.params]);

  useFocusEffect(
    useCallback(() => {
      let cancelled = false;
      (async () => {
        const ok = await canAccessAskQuestionFeature();
        if (!cancelled) {
          setPhase(ok ? 'allowed' : 'blocked');
        }
      })();
      return () => {
        cancelled = true;
      };
    }, []),
  );

  if (phase === 'loading') {
    return (
      <ScreenContainer>
        <AppHeader title="Ask Question" />
        <View style={styles.loadingWrap}>
          <ActivityIndicator size="large" color={Colors.primary} />
        </View>
      </ScreenContainer>
    );
  }

  if (phase === 'blocked') {
    return <AskQuestionAccessBlocked navigation={navigation} />;
  }

  return (
    <AskQuestionNavigator
      initialRouteName={initialRouteName}
      historyInitialParams={historyInitialParams}
      savedInitialParams={savedInitialParams}
    />
  );
};

const styles = StyleSheet.create({
  loadingWrap: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
});

export default AskQuestionStack;
