import { useState } from "react";
import { Text, View } from "react-native";
import { KeyRound, Mail, ShieldCheck } from "lucide-react-native";

import { Button, StatusBanner, TextField } from "../../components/ui";
import { useAnthraTheme } from "../../design-system";
import { useAccount } from "./AccountProvider";

export function AuthForm({ legacy = false }: { legacy?: boolean }) {
  const theme = useAnthraTheme();
  const account = useAccount();
  const [email, setEmail] = useState("");
  const [token, setToken] = useState("");
  const [emailExpanded, setEmailExpanded] = useState(false);
  const [otpRequested, setOtpRequested] = useState(false);
  const [busy, setBusy] = useState<"google" | "request" | "verify" | null>(null);
  const [notice, setNotice] = useState<{ type: "success" | "error"; message: string } | null>(null);

  const run = async (kind: NonNullable<typeof busy>, task: () => Promise<void>) => {
    setBusy(kind);
    setNotice(null);
    try {
      await task();
    } catch (error) {
      setNotice({
        type: "error",
        message: error instanceof Error ? error.message : "Authentication could not be completed."
      });
    } finally {
      setBusy(null);
    }
  };

  return (
    <View style={{ gap: theme.spacing.md }}>
      {legacy && (
        <View style={{ flexDirection: "row", alignItems: "center", gap: theme.spacing.sm, marginBottom: theme.spacing.sm }}>
          <ShieldCheck accessible={false} color={theme.colors.brand} size={17} />
          <Text style={[theme.typography.caption, { color: theme.colors.textSecondary }]}>Your existing history stays protected.</Text>
        </View>
      )}

      <Button
        label="Continue with Google"
        variant="primary"
        size="large"
        fullWidth
        loading={busy === "google" || account.loading}
        disabled={busy !== null}
        onPress={() => run("google", account.signInWithGoogle)}
      />

      {!emailExpanded ? (
        <Button
          label="Continue with email"
          icon={Mail}
          variant="secondary"
          size="large"
          fullWidth
          disabled={busy !== null}
          onPress={() => setEmailExpanded(true)}
        />
      ) : (
        <View style={{ gap: theme.spacing.md, marginTop: theme.spacing.sm }}>
          <TextField
            label="Email"
            value={email}
            onChangeText={(value) => {
              setEmail(value);
              if (otpRequested) {
                setOtpRequested(false);
                setToken("");
              }
            }}
            leadingIcon={Mail}
            autoCapitalize="none"
            autoCorrect={false}
            keyboardType="email-address"
            textContentType="emailAddress"
            placeholder="you@example.com"
            disabled={busy !== null}
          />

          {otpRequested && (
            <TextField
              label="Verification code"
              value={token}
              onChangeText={(value) => setToken(value.replace(/\D/g, "").slice(0, 8))}
              leadingIcon={KeyRound}
              keyboardType="number-pad"
              textContentType="oneTimeCode"
              autoComplete="one-time-code"
              placeholder="6-digit code"
              maxLength={8}
              disabled={busy !== null}
            />
          )}

          {!otpRequested ? (
            <Button
              label="Send verification code"
              variant="secondary"
              fullWidth
              loading={busy === "request"}
              disabled={busy !== null || !email.trim() || !account.cloudAvailable}
              onPress={() =>
                run("request", async () => {
                  await account.requestEmailOtp(email);
                  setOtpRequested(true);
                  setNotice({ type: "success", message: "Verification code sent. Check your inbox." });
                })
              }
            />
          ) : (
            <View style={{ gap: theme.spacing.sm }}>
              <Button
                label="Verify and continue"
                fullWidth
                loading={busy === "verify"}
                disabled={busy !== null || token.length < 6}
                onPress={() => run("verify", () => account.verifyEmailOtp(email, token))}
              />
              <Button
                label="Resend code"
                variant="ghost"
                fullWidth
                disabled={busy !== null}
                onPress={() =>
                  run("request", async () => {
                    await account.requestEmailOtp(email);
                    setNotice({ type: "success", message: "A new verification code was sent." });
                  })
                }
              />
            </View>
          )}
        </View>
      )}

      {(notice || account.error) && (
        <StatusBanner
          variant={notice?.type === "success" ? "success" : "danger"}
          title={notice?.type === "success" ? "Check your email" : "Sign-in unavailable"}
          message={notice?.message ?? account.error ?? undefined}
        />
      )}
    </View>
  );
}
