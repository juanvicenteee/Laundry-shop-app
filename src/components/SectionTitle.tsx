import { StyleSheet, Text, View } from "react-native";

import { colors, spacing } from "../theme";

type Props = {
  title: string;
  action?: string;
};

export function SectionTitle({ title, action }: Props) {
  return (
    <View style={styles.row}>
      <Text style={styles.title}>{title}</Text>
      {action ? <Text style={styles.action}>{action}</Text> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    marginTop: spacing.xl,
    marginBottom: spacing.md,
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center"
  },
  title: {
    color: colors.ink,
    fontSize: 20,
    fontWeight: "800"
  },
  action: {
    color: colors.primary,
    fontWeight: "800"
  }
});
