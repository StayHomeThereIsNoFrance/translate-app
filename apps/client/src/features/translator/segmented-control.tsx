import { Pressable, StyleSheet, Text, View } from 'react-native';

type Option<T extends string> = {
  id: T;
  label: string;
};

type SegmentedControlProps<T extends string> = {
  label: string;
  options: readonly Option<T>[];
  value: T;
  onChange: (value: T) => void;
  testID: string;
};

export function SegmentedControl<T extends string>({
  label,
  options,
  value,
  onChange,
  testID,
}: SegmentedControlProps<T>) {
  return (
    <View style={styles.wrapper}>
      <Text style={styles.label}>{label}</Text>
      <View
        accessibilityRole="radiogroup"
        aria-label={label}
        style={styles.control}
        testID={testID}>
        {options.map((option) => {
          const selected = option.id === value;
          return (
            <Pressable
              accessibilityRole="radio"
              accessibilityState={{ checked: selected }}
              key={option.id}
              onPress={() => onChange(option.id)}
              style={({ pressed }) => [
                styles.option,
                selected && styles.optionSelected,
                pressed && styles.optionPressed,
              ]}
              testID={`${testID}-${option.id}`}>
              <Text
                style={[styles.optionText, selected && styles.optionTextSelected]}>
                {option.label}
              </Text>
            </Pressable>
          );
        })}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrapper: {
    flexGrow: 1,
    gap: 8,
    minWidth: 260,
  },
  label: {
    color: '#5f6368',
    fontSize: 12,
    fontWeight: '600',
    letterSpacing: 0.4,
    textTransform: 'uppercase',
  },
  control: {
    backgroundColor: '#eef3fb',
    borderRadius: 12,
    flexDirection: 'row',
    padding: 3,
  },
  option: {
    alignItems: 'center',
    borderRadius: 9,
    flex: 1,
    justifyContent: 'center',
    minHeight: 38,
    paddingHorizontal: 12,
  },
  optionSelected: {
    backgroundColor: '#ffffff',
    shadowColor: '#0d47a1',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
  },
  optionPressed: {
    opacity: 0.76,
  },
  optionText: {
    color: '#52606f',
    fontSize: 14,
    fontWeight: '600',
  },
  optionTextSelected: {
    color: '#1558b0',
  },
});
