import { Pressable, StyleSheet, Text } from "react-native";

import { colors, spacing } from "../theme";

type Props = {
  label: string;
  selected?: boolean;
  onPress?: () => void;
};

export function Chip({ label, selected = false, onPress }: Props) {
  return (
    <Pressable
      accessibilityRole={onPress ? "button" : undefined}
      onPress={onPress}
      style={[styles.chip, selected && styles.selected]}
    >
      <Text style={[styles.label, selected && styles.selectedLabel]}>{label}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  chip: {
    minHeight: 34,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: colors.line,
    paddingHorizontal: spacing.md,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: colors.surface
  },
  selected: {
    backgroundColor: colors.primarySoft,
    borderColor: colors.primary
  },
  label: {
    color: colors.muted,
    fontWeight: "700"
  },
  selectedLabel: {
    color: colors.primary
  }
});
