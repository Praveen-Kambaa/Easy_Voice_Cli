import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { ScreenContainer } from '../common/ScreenContainer';
import { AppHeader } from '../Header/AppHeader';
import { PrimaryButton } from '../common/PrimaryButton';
import { Colors } from '../../theme/Colors';

/**
 * Shown when Ask Question is unavailable on Android: floating mic service must be Active + Ask Question overlay on.
 */
export default function AskQuestionAccessBlocked({ navigation }) {
  return (
    <ScreenContainer>
      <AppHeader title="Ask Question" />
      <View style={styles.body}>
        <Text style={styles.title}>Ask Question is not available</Text>
        <Text style={styles.text}>
          <Text style={styles.em}>1.</Text> Open <Text style={styles.em}>Floating Mic</Text> and tap{' '}
          <Text style={styles.em}>Start Floating Mic</Text> until <Text style={styles.em}>Floating Mic Service</Text>{' '}
          shows <Text style={styles.em}>Active</Text>.
        </Text>
        <Text style={[styles.text, styles.textGap]}>
          <Text style={styles.em}>2.</Text> In <Text style={styles.em}>Settings</Text>, under{' '}
          <Text style={styles.em}>FLOATING MIC → Overlay actions</Text>, turn on <Text style={styles.em}>Ask Question</Text>.
        </Text>
        <View style={styles.buttons}>
          <PrimaryButton title="Open Floating Mic" onPress={() => navigation.navigate('FloatingMic')} />
          <PrimaryButton
            title="Open Settings"
            variant="outline"
            onPress={() => navigation.navigate('Settings')}
            style={styles.secondBtn}
          />
        </View>
      </View>
    </ScreenContainer>
  );
}

const styles = StyleSheet.create({
  body: {
    flex: 1,
    paddingHorizontal: 20,
    paddingTop: 24,
  },
  title: {
    fontSize: 18,
    fontWeight: '700',
    color: Colors.text.primary,
    marginBottom: 16,
  },
  text: {
    fontSize: 15,
    color: Colors.text.secondary,
    lineHeight: 22,
  },
  textGap: {
    marginTop: 12,
    marginBottom: 24,
  },
  em: {
    fontWeight: '700',
    color: Colors.text.primary,
  },
  buttons: {
    gap: 12,
  },
  secondBtn: {
    marginTop: 0,
  },
});
