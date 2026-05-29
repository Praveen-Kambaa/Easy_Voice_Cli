/**
 * One-off helper: migrate static Colors imports to useTheme + createStyles(colors).
 * Run: node scripts/migrate-theme-colors.js
 */
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..', 'src');

const FILES = [
  'components/LanguagePickerModal.js',
  'components/PermissionModal.js',
  'components/AskQuestion/AskQuestionAccessBlocked.js',
  'components/common/CircularProgress.js',
  'components/RequiredPermissionsGate.js',
  'navigation/TabRedirectScreen.js',
  'navigation/AskQuestionStack.js',
  'screens/FloatingMic/FloatingMicScreen.js',
  'screens/FloatingMic/FloatingMicHistoryScreen.js',
  'screens/Translator/TranslatorScreen.js',
  'screens/Translator/TranslatorHistoryScreen.js',
  'screens/Translator/TranslatorSavedScreen.js',
  'screens/AskQuestion/AskQuestionScreen.js',
  'screens/AskQuestion/AiQaHistoryScreen.js',
  'screens/AskQuestion/AiQaSavedScreen.js',
  'screens/GrammarCheck/GrammarCheckScreen.js',
  'screens/GrammarCheck/GrammarCheckHistoryScreen.js',
  'screens/GrammarCheck/GrammarCheckSavedScreen.js',
  'screens/Profile/ProfileScreen.js',
  'screens/CallLogs/CallLogsScreen.js',
  'screens/Recordings/RecordedAudioScreen.js',
  'screens/VoiceRecorder/VoiceRecorderScreen.js',
  'screens/VoiceRecorder/VoiceRecorderHistoryScreen.js',
  'screens/VoiceRecorder/VoiceCommandScreen.js',
  'screens/VoiceReminders/VoiceRemindersScreen.js',
  'screens/VoiceAssistantScreen.js',
];

function depthToThemeImport(relPath) {
  const depth = relPath.split(/[/\\]/).length - 1;
  return `${'../'.repeat(depth)}context/ThemeContext`;
}

function migrateFile(relPath) {
  const filePath = path.join(ROOT, relPath);
  if (!fs.existsSync(filePath)) {
    console.log('skip missing', relPath);
    return;
  }
  let content = fs.readFileSync(filePath, 'utf8');
  if (!content.includes('theme/Colors')) {
    console.log('skip no Colors', relPath);
    return;
  }
  if (content.includes('useTheme')) {
    console.log('skip already themed', relPath);
    return;
  }

  const themeImport = depthToThemeImport(relPath);

  content = content.replace(
    /import\s+\{\s*Colors\s*\}\s+from\s+['"][^'"]*theme\/Colors['"];\s*\n/g,
    `import { useTheme } from '${themeImport}';\n`,
  );

  if (!content.includes('useMemo')) {
    content = content.replace(
      /import React(?:,\s*\{([^}]+)\})?\s+from\s+['"]react['"];/,
      (match, hooks) => {
        if (hooks && hooks.includes('useMemo')) return match;
        if (hooks) return `import React, { ${hooks.trim()}, useMemo } from 'react';`;
        return "import React, { useMemo } from 'react';";
      },
    );
  }

  const componentMatch = content.match(
    /^(const|function)\s+(\w+)\s*=\s*(?:\([^)]*\)\s*=>\s*\{|\([^)]*\)\s*=>\s*\()/m,
  );
  if (!componentMatch) {
    console.log('skip no component', relPath);
    return;
  }

  const insertHook = `  const { colors } = useTheme();\n  const styles = useMemo(() => createStyles(colors), [colors]);\n\n`;
  // Only insert hooks after `) => {` / `) {`, never inside `({ ... })` prop destructuring.
  const isDestructuredProps = /=\s*\(\{/.test(componentMatch[0]);
  if (isDestructuredProps) {
    const bodyOpen = content.indexOf('}) => {', content.indexOf(componentMatch[0]));
    const altBodyOpen = content.indexOf('}) {', content.indexOf(componentMatch[0]));
    const openIdx = bodyOpen !== -1 ? bodyOpen + 5 : altBodyOpen !== -1 ? altBodyOpen + 4 : -1;
    if (openIdx === -1) {
      console.log('skip destructured props without body', relPath);
      return;
    }
    if (!content.slice(openIdx + 1, openIdx + 80).includes('useTheme')) {
      content =
        content.slice(0, openIdx + 1) + `\n${insertHook}` + content.slice(openIdx + 1);
    }
  } else {
    const hookNeedle = componentMatch[0];
    const hookIdx = content.indexOf(hookNeedle);
    const braceIdx = content.indexOf('{', hookIdx);
    if (braceIdx === -1) {
      console.log('skip no brace', relPath);
      return;
    }
    const afterBrace = braceIdx + 1;
    if (!content.slice(afterBrace, afterBrace + 80).includes('useTheme')) {
      content = content.slice(0, afterBrace) + '\n' + insertHook + content.slice(afterBrace);
    }
  }

  content = content.replace(
    /^const styles = StyleSheet\.create\(\{/m,
    'function createStyles(colors) {\n  return StyleSheet.create({',
  );

  const exportIdx = content.lastIndexOf('export default');
  if (exportIdx === -1) {
    console.log('skip no export', relPath);
    return;
  }
  const beforeExport = content.slice(0, exportIdx);
  const lastClose = beforeExport.lastIndexOf('});');
  if (lastClose !== -1) {
    content = content.slice(0, lastClose + 3) + '\n}\n\n' + content.slice(lastClose + 3);
  }

  content = content.replace(/Colors\./g, 'colors.');

  fs.writeFileSync(filePath, content, 'utf8');
  console.log('migrated', relPath);
}

FILES.forEach(migrateFile);
