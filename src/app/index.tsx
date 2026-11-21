import { StyleSheet, Text, View } from 'react-native';

import { catalog } from '@/inspection/catalog';
import { isAnswerable } from '@/inspection/form';

// Placeholder home screen for the setup phase. It proves that the app bundles the
// inspection module and its catalog; the real Home screen is built in phase F3.
const questionCount = catalog.questions.filter(isAnswerable).length;

export default function Index() {
  return (
    <View style={styles.screen}>
      <Text style={styles.title}>Quartermaster</Text>
      <Text style={styles.body}>
        {questionCount} questions in {catalog.steps.length} steps · form version {catalog.version}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    padding: 24,
    backgroundColor: '#F6EEDB',
  },
  title: {
    fontSize: 32,
    fontWeight: '700',
    color: '#1F1A2B',
  },
  body: {
    fontSize: 16,
    textAlign: 'center',
    color: '#4A4257',
  },
});
