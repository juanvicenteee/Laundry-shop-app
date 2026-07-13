import { Ionicons } from "@expo/vector-icons";
import { useState } from "react";
import { ActivityIndicator, Alert, Pressable, StyleSheet, Text, TextInput, View } from "react-native";

import { useAuth } from "../lib/AuthContext";
import { colors, shadows, spacing } from "../theme";

export function LoginScreen() {
  const { signIn } = useAuth();
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [submitting, setSubmitting] = useState(false);

  async function handleSignIn() {
    if (!username.trim() || !password) {
      Alert.alert("Missing details", "Enter your username and password.");
      return;
    }

    setSubmitting(true);
    try {
      await signIn(username, password);
    } catch (error) {
      Alert.alert("Sign in failed", error instanceof Error ? error.message : "Check your credentials.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.eyebrow}>Bubbly-fi</Text>
        <Text style={styles.title}>Staff sign in</Text>
        <Text style={styles.subtitle}>For admin and operator accounts only.</Text>
      </View>

      <View style={[styles.card, shadows.card]}>
        <Text style={styles.label}>Username</Text>
        <TextInput
          value={username}
          onChangeText={setUsername}
          style={styles.input}
          placeholder="admin or operator"
          autoCapitalize="none"
          autoCorrect={false}
        />

        <Text style={styles.label}>Password</Text>
        <TextInput
          value={password}
          onChangeText={setPassword}
          style={styles.input}
          placeholder="Password"
          secureTextEntry
          autoCapitalize="none"
        />

        <Pressable style={styles.cta} onPress={handleSignIn} disabled={submitting}>
          {submitting ? (
            <ActivityIndicator size="small" color="#FFFFFF" />
          ) : (
            <Ionicons name="log-in" size={20} color="#FFFFFF" />
          )}
          <Text style={styles.ctaText}>{submitting ? "Signing in..." : "Sign in"}</Text>
        </Pressable>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background,
    justifyContent: "center",
    paddingHorizontal: spacing.lg
  },
  header: {
    marginBottom: spacing.xxl
  },
  eyebrow: {
    color: colors.primary,
    fontWeight: "900",
    textAlign: "center"
  },
  title: {
    color: colors.ink,
    fontSize: 28,
    fontWeight: "900",
    textAlign: "center",
    marginTop: spacing.xs
  },
  subtitle: {
    color: colors.muted,
    textAlign: "center",
    marginTop: spacing.sm
  },
  card: {
    backgroundColor: colors.surface,
    borderRadius: 8,
    padding: spacing.lg
  },
  label: {
    color: colors.ink,
    fontWeight: "800",
    marginBottom: spacing.sm,
    marginTop: spacing.md
  },
  input: {
    minHeight: 48,
    borderWidth: 1,
    borderColor: colors.line,
    borderRadius: 8,
    paddingHorizontal: spacing.md,
    color: colors.ink,
    backgroundColor: "#FBFCFA"
  },
  cta: {
    height: 52,
    marginTop: spacing.xl,
    borderRadius: 8,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: spacing.sm,
    backgroundColor: colors.primary
  },
  ctaText: {
    color: "#FFFFFF",
    fontSize: 16,
    fontWeight: "900"
  }
});
