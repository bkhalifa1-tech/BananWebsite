import { useState, type FormEvent } from "react";
import { Mail, ShieldCheck } from "lucide-react";
import { api, type Account } from "../../lib/api";
import { errorMessage } from "../../lib/errors";
import { Card, Modal } from "../../components/ui";
export function EmailStatus({ account }: { account: Account }) {
  const ar = account.preferences.language === "ar",
    t = (e: string, a: string) => (ar ? a : e);
  const [busy, setBusy] = useState(false),
    [message, setMessage] = useState(""),
    [error, setError] = useState(false);
  async function resend() {
    setBusy(true);
    setMessage("");
    setError(false);
    try {
      const result = await api<{ delivery: string }>(
        "/auth/verification/request",
        "POST",
      );
      setMessage(
        result.delivery === "local"
          ? t(
              "Development email saved in the private local mailbox.",
              "حُفظت رسالة التطوير في صندوق البريد المحلي الخاص.",
            )
          : t(
              "Verification email sent. Check your inbox.",
              "أُرسلت رسالة التحقق. راجع بريدك.",
            ),
      );
    } catch (err) {
      setMessage(errorMessage(err, ar ? "ar" : "en"));
      setError(true);
    } finally {
      setBusy(false);
    }
  }
  if (account.user.emailVerified)
    return (
      <div className="verified-status">
        <ShieldCheck size={16} />
        {t("Email verified", "البريد مؤكد")}
      </div>
    );
  return (
    <section className="email-banner">
      <Mail size={20} />
      <div>
        <strong>
          {t("Confirm your email address", "أكد بريدك الإلكتروني")}
        </strong>
        <p>
          {account.emailDelivery === "local"
            ? t(
                "Development mode: emails are saved locally, not delivered to an inbox.",
                "وضع التطوير: تُحفظ الرسائل محليًا ولا تصل إلى البريد الإلكتروني.",
              )
            : account.emailDelivery === "unavailable"
              ? t(
                  "Email delivery needs configuration. Verification is required for study access in production.",
                  "خدمة البريد بحاجة إلى إعداد. يلزم تأكيد البريد للوصول إلى بيانات الدراسة في الإنتاج.",
                )
              : t(
                  "Confirm your email to unlock study access. Request another link if needed.",
                  "أكد بريدك للوصول إلى بيانات الدراسة. اطلب رابطًا آخر عند الحاجة.",
                )}
        </p>
        {message && <p role={error ? "alert" : "status"}>{message}</p>}
      </div>
      <button
        className="secondary"
        disabled={busy || account.emailDelivery === "unavailable"}
        onClick={() => void resend()}
      >
        {busy
          ? t("Please wait…", "يرجى الانتظار…")
          : t("Resend verification", "إعادة إرسال التحقق")}
      </button>
    </section>
  );
}
export function ForgotPassword({
  ar,
  onClose,
}: {
  ar: boolean;
  onClose: () => void;
}) {
  const [busy, setBusy] = useState(false),
    [error, setError] = useState(""),
    [sent, setSent] = useState(false),
    [local, setLocal] = useState(false);
  const t = (e: string, a: string) => (ar ? a : e);
  async function submit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setBusy(true);
    setError("");
    const email = new FormData(e.currentTarget).get("email");
    try {
      const response = await api<{ delivery: string }>(
        "/auth/password/request",
        "POST",
        { email },
      );
      setLocal(response.delivery === "local");
      setSent(true);
    } catch (err) {
      setError(errorMessage(err, ar ? "ar" : "en"));
    } finally {
      setBusy(false);
    }
  }
  return (
    <Modal
      title={t("Reset your password", "استعادة كلمة المرور")}
      closeLabel={t("Close", "إغلاق")}
      onClose={onClose}
    >
      {sent ? (
        <>
          <p role="status">
            {t(
              "If an account exists for this email, a password reset message will be prepared. Check your inbox.",
              "إذا كان هناك حساب بهذا البريد فستُجهّز رسالة لاستعادة كلمة المرور. راجع صندوق البريد.",
            )}
          </p>
          {local && (
            <p className="muted">
              {t(
                "Development mode: the email is stored in the private local mailbox. It has not been sent externally.",
                "وضع التطوير: الرسالة محفوظة في صندوق البريد المحلي الخاص، ولم تُرسل خارجيًا.",
              )}
            </p>
          )}
          <button className="primary" onClick={onClose}>
            {t("Back to sign in", "العودة لتسجيل الدخول")}
          </button>
        </>
      ) : (
        <form className="editor-form" onSubmit={(e) => void submit(e)}>
          <p className="muted">
            {t(
              "We will prepare a single-use link, valid for 30 minutes.",
              "سنجهز رابطًا للاستخدام مرة واحدة، صالحًا لمدة 30 دقيقة.",
            )}
          </p>
          <label>
            {t("Email address", "البريد الإلكتروني")}
            <input
              type="email"
              name="email"
              dir="ltr"
              required
              maxLength={254}
              autoComplete="email"
            />
          </label>
          {error && (
            <p role="alert" className="error-box">
              {error}
            </p>
          )}
          <button className="primary full-width" disabled={busy}>
            {busy
              ? t("Please wait…", "يرجى الانتظار…")
              : t("Request reset link", "طلب رابط الاستعادة")}
          </button>
        </form>
      )}
    </Modal>
  );
}
export function TokenAction({
  hash,
  ar,
  onDone,
}: {
  hash: string;
  ar: boolean;
  onDone: () => void;
}) {
  const verify = hash.startsWith("#/verify"),
    token = new URLSearchParams(hash.split("?")[1] ?? "").get("token") ?? "";
  const [busy, setBusy] = useState(false),
    [error, setError] = useState(""),
    [done, setDone] = useState(false);
  const t = (e: string, a: string) => (ar ? a : e);
  async function submit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setBusy(true);
    setError("");
    const data = new FormData(e.currentTarget);
    if (!verify && data.get("password") !== data.get("confirm")) {
      setError(t("Passwords must match.", "يجب أن تتطابق كلمتا المرور."));
      setBusy(false);
      return;
    }
    try {
      await api(verify ? "/auth/verify" : "/auth/password/reset", "POST", {
        token,
        ...(!verify ? { password: data.get("password") } : {}),
      });
      window.history.replaceState(null, "", window.location.pathname);
      setDone(true);
    } catch (err) {
      setError(errorMessage(err, ar ? "ar" : "en"));
    } finally {
      setBusy(false);
    }
  }
  return (
    <div className="center-page">
      <Card className="token-card">
        <span className="soft-icon">
          <ShieldCheck size={30} />
        </span>
        <h1>
          {done
            ? verify
              ? t("Email confirmed", "تم تأكيد البريد")
              : t("Password updated", "تم تحديث كلمة المرور")
            : verify
              ? t("Confirm your email", "تأكيد بريدك")
              : t("Choose a new password", "اختر كلمة مرور جديدة")}
        </h1>
        {done ? (
          <>
            <p>
              {verify
                ? t(
                    "Your email is verified. You can return to your workspace.",
                    "تم تأكيد بريدك. يمكنك العودة إلى مساحتك.",
                  )
                : t(
                    "Your previous sessions have been signed out. Sign in with your new password.",
                    "تم إغلاق جلساتك السابقة. سجّل الدخول بكلمة المرور الجديدة.",
                  )}
            </p>
            <button className="primary" onClick={onDone}>
              {t("Continue", "متابعة")}
            </button>
          </>
        ) : (
          <form className="editor-form" onSubmit={(e) => void submit(e)}>
            {verify ? (
              <p>
                {t(
                  "Confirm that this email address belongs to you.",
                  "أكد أن عنوان البريد الإلكتروني هذا يعود لك.",
                )}
              </p>
            ) : (
              <>
                <label>
                  {t("New password", "كلمة المرور الجديدة")}
                  <input
                    name="password"
                    type="password"
                    autoComplete="new-password"
                    required
                    minLength={10}
                    maxLength={128}
                  />
                </label>
                <label>
                  {t("Confirm password", "تأكيد كلمة المرور")}
                  <input
                    name="confirm"
                    type="password"
                    autoComplete="new-password"
                    required
                    minLength={10}
                    maxLength={128}
                  />
                </label>
              </>
            )}
            {error && (
              <p className="error-box" role="alert">
                {error}
              </p>
            )}
            <button className="primary full-width" disabled={busy}>
              {busy
                ? t("Please wait…", "يرجى الانتظار…")
                : verify
                  ? t("Verify email", "تأكيد البريد")
                  : t("Save new password", "حفظ كلمة المرور الجديدة")}
            </button>
            <button
              type="button"
              className="text-button token-back"
              onClick={onDone}
            >
              {t("Return to sign in", "العودة لتسجيل الدخول")}
            </button>
          </form>
        )}
      </Card>
    </div>
  );
}
