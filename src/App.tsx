import { lazy, Suspense } from "react";
import {
  EmailStatus,
  ForgotPassword,
  TokenAction,
} from "./features/auth/EmailSecurity";
const PersonalDashboard = lazy(
  () => import("./features/personal/PersonalDashboard"),
);
const Social = lazy(() => import("./features/social/Social"));
const Analytics = lazy(() => import("./features/analytics/Analytics"));
const Planner = lazy(() => import("./features/planner/Planner"));
const Focus = lazy(() => import("./features/planner/Focus"));
const SemesterDashboard = lazy(() => import("./features/semester/Dashboard"));
import { errorMessage } from "./lib/errors";
import { useCallback, useEffect, useState } from "react";
import {
  Users,
  ArrowRight,
  BookOpen,
  Check,
  ChevronDown,
  CircleHelp,
  Compass,
  GraduationCap,
  CalendarDays,
  Timer,
  BarChart3,
  LayoutDashboard,
  Leaf,
  LogOut,
  Menu,
  Moon,
  Palette,
  Settings,
  ShieldCheck,
  Sun,
  Monitor,
} from "lucide-react";
import {
  api,
  ApiError,
  themes,
  type Account,
  type Preferences,
} from "./lib/api";
import { Card, Modal, Progress, Skeleton, Toast } from "./components/ui";
import "./styles.css";
const initial: Preferences = {
  theme: "forest",
  mode: "system",
  language: "ar",
  track: "semester",
  onboarded: false,
};
export default function App() {
  const [account, setAccount] = useState<Account | null>(null);
  const [prefs, setPrefs] = useState<Preferences>(initial);
  const [loading, setLoading] = useState(true);
  const [fatal, setFatal] = useState(false);
  const [page, setPage] = useState(
    () =>
      window.location.hash.match(
        /^#\/(focus|planner|analytics|social|appearance|account)/,
      )?.[1] || "overview",
  );
  const [mobile, setMobile] = useState(false);
  const [help, setHelp] = useState(false);
  const [toast, setToast] = useState<{ text: string; error?: boolean } | null>(
    null,
  );
  const [saving, setSaving] = useState(false);
  const [hash, setHash] = useState(() => window.location.hash);
  useEffect(() => {
    const changed = () => {
      setHash(window.location.hash);
      if (/^#\/(courses|semesters|spaces)\//.test(window.location.hash))
        setPage("overview");
      const p = window.location.hash.match(
        /^#\/(focus|planner|analytics|social|appearance|account)/,
      )?.[1];
      if (p) setPage(p);
    };
    window.addEventListener("hashchange", changed);
    return () => window.removeEventListener("hashchange", changed);
  }, []);
  useEffect(() => {
    const id = hash.match(/^#\/(?:courses|spaces)\/([\w-]+)$/)?.[1];
    if (!id || !account?.user.id) return;
    let live = true;
    void api<{ course: { kind?: string } }>(`/courses/${id}`)
      .then(async (detail) => {
        const track =
          detail.course.kind === "personal" ? "personal" : "semester";
        if (!live || track === prefs.track) return;
        const result = await api<Account>("/preferences", "PATCH", { track });
        if (live) {
          setAccount(result);
          setPrefs(result.preferences);
        }
      })
      .catch(() => {});
    return () => {
      live = false;
    };
  }, [hash, account?.user.id, prefs.track]);
  const ar = prefs.language === "ar";
  const t = (en: string, arabic: string) => (ar ? arabic : en);
  const notify = useCallback(
    (text: string, error = false) => setToast({ text, error }),
    [],
  );
  useEffect(() => {
    if (toast) {
      const timer = setTimeout(() => setToast(null), 4500);
      return () => clearTimeout(timer);
    }
  }, [toast]);
  const load = useCallback(async () => {
    setLoading(true);
    setFatal(false);
    try {
      const a = await api<Account>("/me");
      setAccount(a);
      setPrefs(a.preferences);
    } catch (e) {
      if (e instanceof ApiError && e.status === 401) setAccount(null);
      else setFatal(true);
    } finally {
      setLoading(false);
    }
  }, []);
  useEffect(() => {
    void load();
  }, [load]);
  useEffect(() => {
    document.documentElement.lang = prefs.language;
    document.documentElement.dir = ar ? "rtl" : "ltr";
    document.documentElement.dataset.theme = prefs.theme;
    const mq = window.matchMedia("(prefers-color-scheme: dark)");
    const apply = () =>
      (document.documentElement.dataset.mode =
        prefs.mode === "system" ? (mq.matches ? "dark" : "light") : prefs.mode);
    apply();
    mq.addEventListener("change", apply);
    return () => mq.removeEventListener("change", apply);
  }, [prefs, ar]);
  async function update(changes: Partial<Preferences>) {
    setSaving(true);
    try {
      const a = await api<Account>("/preferences", "PATCH", changes);
      if (changes.track) {
        window.location.hash = "/";
        setPage("overview");
      }
      setAccount(a);
      setPrefs(a.preferences);
      notify(
        changes.language === "ar"
          ? "تم حفظ التفضيلات"
          : changes.language === "en"
            ? "Preferences saved"
            : t("Preferences saved", "تم حفظ التفضيلات"),
      );
    } catch (e) {
      notify(errorMessage(e, prefs.language), true);
    } finally {
      setSaving(false);
    }
  }
  async function logout() {
    try {
      await api("/auth/logout", "POST");
      setAccount(null);
      setPage("overview");
      window.location.hash = "/";
    } catch {
      notify(
        t("Could not sign out. Try again.", "تعذر تسجيل الخروج. حاول مجددًا."),
        true,
      );
    }
  }
  if (hash.startsWith("#/verify") || hash.startsWith("#/reset"))
    return (
      <TokenAction
        key={hash.split("?")[0]}
        hash={hash}
        ar={ar}
        onDone={() => {
          window.location.hash = "/";
          setHash("#/");
          void load();
        }}
      />
    );
  if (loading) return <Skeleton />;
  if (fatal)
    return (
      <div className="center-page">
        <Card>
          <ShieldCheck />
          <h1>{t("Unable to connect", "تعذر الاتصال")}</h1>
          <p>
            {t(
              "Your learning space is temporarily unavailable.",
              "مساحتك الدراسية غير متاحة مؤقتًا.",
            )}
          </p>
          <button className="primary" onClick={() => void load()}>
            {t("Try again", "حاول مجددًا")}
          </button>
        </Card>
      </div>
    );
  if (!account)
    return (
      <Auth
        ar={ar}
        onLanguage={() => setPrefs({ ...prefs, language: ar ? "en" : "ar" })}
        onSuccess={(a) => {
          setAccount(a);
          setPrefs(a.preferences);
        }}
      />
    );
  if (!prefs.onboarded)
    return (
      <Onboarding
        account={account}
        prefs={prefs}
        setPrefs={setPrefs}
        save={update}
        saving={saving}
        logout={logout}
        toast={toast}
      />
    );
  return (
    <div className="app-shell">
      {mobile && (
        <button
          className="sidebar-scrim"
          aria-label={t("Close navigation", "إغلاق القائمة")}
          onClick={() => setMobile(false)}
        />
      )}
      <aside className={`sidebar ${mobile ? "is-open" : ""}`}>
        <a
          className="brand"
          href="#"
          onClick={(e) => {
            e.preventDefault();
            setPage("overview");
          }}
        >
          <span className="brand-mark">
            <Leaf size={23} />
          </span>{" "}
          study<span className="brand-os">os</span>
          <span className="beta">BETA</span>
        </a>
        <div className="workspace-label">
          {t("YOUR WORKSPACE", "مساحتك الخاصة")}
        </div>
        <div className="track-switch">
          <span className="track-icon">
            {prefs.track === "semester" ? (
              <GraduationCap size={20} />
            ) : (
              <Compass size={20} />
            )}
          </span>
          <select
            aria-label={t("Learning track", "مسار التعلم")}
            value={prefs.track}
            disabled={saving}
            onChange={(e) =>
              void update({ track: e.target.value as Preferences["track"] })
            }
          >
            <option value="semester">{t("My semester", "فصلي الدراسي")}</option>
            <option value="personal">
              {t("Personal study", "التعلم الشخصي")}
            </option>
          </select>
          <ChevronDown size={14} />
        </div>
        <nav>
          {[
            {
              id: "overview",
              icon: LayoutDashboard,
              en: "Overview",
              ar: "نظرة عامة",
            },
            ...(prefs.track === "semester"
              ? [
                  {
                    id: "courses",
                    icon: BookOpen,
                    en: "Courses",
                    ar: "المساقات",
                  },
                ]
              : []),
            {
              id: "analytics",
              icon: BarChart3,
              en: "Analytics",
              ar: "التحليلات",
            },
            { id: "planner", icon: CalendarDays, en: "Planner", ar: "المخطط" },
            {
              id: "social",
              icon: Users,
              en: "Study together",
              ar: "ندرس معًا",
            },
            { id: "focus", icon: Timer, en: "Focus", ar: "التركيز" },
            { id: "appearance", icon: Palette, en: "Appearance", ar: "المظهر" },
            {
              id: "account",
              icon: Settings,
              en: "Account settings",
              ar: "إعدادات الحساب",
            },
          ].map((item) => (
            <button
              key={item.id}
              className={`nav-item ${page === item.id ? "active" : ""}`}
              onClick={() => {
                setPage(item.id);
                window.location.hash =
                  item.id === "overview" || item.id === "courses"
                    ? "/"
                    : `/${item.id}`;
                setMobile(false);
              }}
              aria-current={page === item.id ? "page" : undefined}
            >
              <item.icon size={19} />
              {t(item.en, item.ar)}
              {page === item.id && <span className="active-dot" />}
            </button>
          ))}
        </nav>
        <div className="sidebar-bottom">
          <div className="sidebar-note">
            <span className="little-star">✧</span>
            <h3>
              {t(
                "A little space. A lot of possibility.",
                "مساحة صغيرة. إمكانات كبيرة.",
              )}
            </h3>
            <p>
              {t(
                "Make room for the way you learn.",
                "مساحة تناسب طريقتك في التعلم.",
              )}
            </p>
          </div>
          <button className="nav-item" onClick={() => setHelp(true)}>
            <CircleHelp size={19} />
            {t("About your workspace", "عن مساحتك")}
          </button>
          <button className="user-mini" onClick={() => setPage("account")}>
            <span className="avatar">
              {account.user.name.slice(0, 1).toUpperCase()}
            </span>
            <span>
              <strong>{account.user.name}</strong>
              <small>{t("Personal account", "حساب شخصي")}</small>
            </span>
            <Settings size={17} />
          </button>
        </div>
      </aside>
      <div className="main-area">
        <header className="topbar">
          <div className="topbar-start">
            <button
              className="icon-button mobile-menu"
              aria-label={t("Open navigation", "فتح القائمة")}
              onClick={() => setMobile(true)}
            >
              <Menu size={21} />
            </button>
            <span className="breadcrumb">
              {t("Workspace", "المساحة")} <span>/</span>{" "}
              <strong>
                {page === "overview"
                  ? t("Overview", "نظرة عامة")
                  : page === "courses"
                    ? t("Courses", "المساقات")
                    : page === "appearance"
                      ? t("Appearance", "المظهر")
                      : t("Account", "الحساب")}
              </strong>
            </span>
          </div>
          <div className="top-actions">
            <span className="saved-status">
              <span />
              {t("All set", "جاهز")}
            </span>
            <button
              className="icon-button"
              aria-label={t("Switch language", "تغيير اللغة")}
              onClick={() => void update({ language: ar ? "en" : "ar" })}
              disabled={saving}
            >
              {ar ? "EN" : "ع"}
            </button>
            <button
              className="icon-button"
              aria-label={t("Toggle color mode", "تغيير وضع الألوان")}
              onClick={() =>
                void update({
                  mode:
                    document.documentElement.dataset.mode === "dark"
                      ? "light"
                      : "dark",
                })
              }
              disabled={saving}
            >
              {prefs.mode === "dark" ? <Sun size={19} /> : <Moon size={19} />}
            </button>
            <button
              className="avatar"
              aria-label={t("Account", "الحساب")}
              onClick={() => setPage("account")}
            >
              {account.user.name.slice(0, 1).toUpperCase()}
            </button>
          </div>
        </header>
        <main className="content">
          <EmailStatus account={account} />
          {page === "social" && (
            <Suspense fallback={<Skeleton />}>
              <Social language={prefs.language} userId={account.user.id} />
            </Suspense>
          )}
          {page === "analytics" && (
            <Suspense fallback={<Skeleton />}>
              <Analytics track={prefs.track} language={prefs.language} />
            </Suspense>
          )}
          {page === "planner" && (
            <Suspense fallback={<Skeleton />}>
              <Planner track={prefs.track} language={prefs.language} />
            </Suspense>
          )}
          {page === "focus" && (
            <Suspense fallback={<Skeleton />}>
              <Focus track={prefs.track} language={prefs.language} />
            </Suspense>
          )}
          {(page === "overview" || page === "courses") &&
          prefs.track === "semester" ? (
            <Suspense fallback={<Skeleton />}>
              <SemesterDashboard
                account={account}
                coursesOnly={page === "courses"}
              />
            </Suspense>
          ) : page === "overview" || page === "courses" ? (
            <Suspense fallback={<Skeleton />}>
              <PersonalDashboard account={account} />
            </Suspense>
          ) : page === "appearance" ? (
            <>
              <div className="page-heading">
                <div>
                  <div className="eyebrow">
                    {t("MAKE IT YOURS", "على طريقتك")}
                  </div>
                  <h1>{t("Your kind of calm.", "هدوء يناسبك.")}</h1>
                  <p>
                    {t(
                      "One palette, woven through your entire workspace.",
                      "لوحة ألوان واحدة، تنسج مظهر مساحتك بالكامل.",
                    )}
                  </p>
                </div>
              </div>
              <Appearance prefs={prefs} save={update} saving={saving} />
              <Card className="preview-card">
                <div>
                  <span className="eyebrow">
                    {t("LIVE PREVIEW", "معاينة مباشرة")}
                  </span>
                  <h2>
                    {t(
                      "Small steps, meaningful progress.",
                      "خطوات صغيرة، تقدم حقيقي.",
                    )}
                  </h2>
                  <p className="muted">
                    {t(
                      "A design preview, not study statistics.",
                      "معاينة للتصميم، وليست إحصاءات دراسية.",
                    )}
                  </p>
                  <Progress
                    value={65}
                    label={t("Design preview", "معاينة التصميم")}
                  />
                </div>
                <span className="preview-flower">✳</span>
              </Card>
            </>
          ) : (
            <>
              <div className="page-heading">
                <div>
                  <div className="eyebrow">
                    {t("YOUR SPACE, YOUR CHOICE", "مساحتك، اختيارك")}
                  </div>
                  <h1>{t("Account settings", "إعدادات الحساب")}</h1>
                  <p>
                    {t(
                      "The essentials behind your learning space.",
                      "الأساسيات التي تدعم مساحتك الدراسية.",
                    )}
                  </p>
                </div>
              </div>
              <Card className="settings-card">
                <div className="profile-row">
                  <span className="avatar large">
                    {account.user.name.slice(0, 1).toUpperCase()}
                  </span>
                  <div>
                    <h2>{account.user.name}</h2>
                    <p className="muted">{account.user.email}</p>
                  </div>
                  <span className="badge">
                    <ShieldCheck size={14} />
                    {t("Private account", "حساب خاص")}
                  </span>
                </div>
                <hr />
                <label className="field-label" htmlFor="language">
                  {t("Interface language", "لغة الواجهة")}
                </label>
                <select
                  id="language"
                  disabled={saving}
                  value={prefs.language}
                  onChange={(e) =>
                    void update({ language: e.target.value as "ar" | "en" })
                  }
                >
                  <option value="ar">العربية</option>
                  <option value="en">English</option>
                </select>
                <label className="field-label" htmlFor="track">
                  {t("Learning path", "مسار التعلم")}
                </label>
                <select
                  id="track"
                  disabled={saving}
                  value={prefs.track}
                  onChange={(e) =>
                    void update({
                      track: e.target.value as Preferences["track"],
                    })
                  }
                >
                  <option value="semester">
                    {t("My semester", "فصلي الدراسي")}
                  </option>
                  <option value="personal">
                    {t("Personal study", "التعلم الشخصي")}
                  </option>
                </select>
                <p className="field-hint">
                  {t(
                    "You can switch paths whenever you like.",
                    "يمكنك التبديل بين المسارين في أي وقت.",
                  )}
                </p>
                <hr />
                <div className="section-title">
                  <div>
                    <h3>{t("Sign out", "تسجيل الخروج")}</h3>
                    <p className="muted">
                      {t(
                        "Your preferences will be here when you return.",
                        "ستجد تفضيلاتك محفوظة عند العودة.",
                      )}
                    </p>
                  </div>
                  <button className="secondary" onClick={() => void logout()}>
                    <LogOut size={17} />
                    {t("Sign out", "تسجيل الخروج")}
                  </button>
                </div>
              </Card>
            </>
          )}
        </main>
      </div>
      {help && (
        <Modal
          title={t("Built for your next chapter", "لخطوتك القادمة")}
          closeLabel={t("Close", "إغلاق")}
          onClose={() => setHelp(false)}
        >
          <p>
            {t(
              "This release includes accounts, email verification and recovery, semesters, courses, tasks, and a dashboard based on your data. Study tools are being built in stages.",
              "هذا الإصدار يشمل الحسابات والتحقق والاستعادة، والفصول والمساقات والمهام ولوحة بياناتك. ستُبنى بقية أدوات الدراسة على مراحل.",
            )}
          </p>
          <p className="muted">
            {t(
              "Your data is stored in a private account. No demo grades or invented study history.",
              "تُحفظ بياناتك في حساب خاص. لا توجد درجات تجريبية أو سجل دراسة مختلق.",
            )}
          </p>
          <button className="primary" onClick={() => setHelp(false)}>
            {t("Got it", "فهمت")}
          </button>
        </Modal>
      )}
      {toast && <Toast message={toast.text} error={toast.error} />}
    </div>
  );
}
function Appearance({
  prefs,
  save,
  saving,
}: {
  prefs: Preferences;
  save: (p: Partial<Preferences>) => Promise<void>;
  saving: boolean;
}) {
  const ar = prefs.language === "ar";
  const t = (en: string, a: string) => (ar ? a : en);
  return (
    <Card className="settings-card">
      <h2>{t("Color palette", "لوحة الألوان")}</h2>
      <p className="muted">
        {t(
          "Find a color that makes you feel at home.",
          "اختر لونًا يشعرك بالراحة.",
        )}
      </p>
      <div className="theme-grid">
        {themes.map((theme) => (
          <button
            key={theme.id}
            className={`theme-option ${prefs.theme === theme.id ? "selected" : ""}`}
            disabled={saving}
            aria-pressed={prefs.theme === theme.id}
            onClick={() => void save({ theme: theme.id })}
          >
            <span className="theme-swatch" style={{ background: theme.color }}>
              <span style={{ background: theme.color }} />
              {prefs.theme === theme.id && <Check size={19} />}
            </span>
            <strong>{t(theme.label, theme.ar)}</strong>
          </button>
        ))}
      </div>
      <hr />
      <h2>{t("Color mode", "وضع الألوان")}</h2>
      <p className="muted">
        {t(
          "Match the light around you, or follow your device.",
          "اختر ما يناسبك أو اتبع إعداد جهازك.",
        )}
      </p>
      <div className="mode-group">
        {[
          { id: "light", en: "Light", ar: "فاتح", icon: Sun },
          { id: "dark", en: "Dark", ar: "داكن", icon: Moon },
          { id: "system", en: "System", ar: "تلقائي", icon: Monitor },
        ].map((x) => (
          <button
            key={x.id}
            className={prefs.mode === x.id ? "selected" : ""}
            disabled={saving}
            aria-pressed={prefs.mode === x.id}
            onClick={() => void save({ mode: x.id as Preferences["mode"] })}
          >
            <x.icon size={20} />
            {t(x.en, x.ar)}
            {prefs.mode === x.id && <Check size={15} />}
          </button>
        ))}
      </div>
    </Card>
  );
}
function Auth({
  ar,
  onLanguage,
  onSuccess,
}: {
  ar: boolean;
  onLanguage: () => void;
  onSuccess: (a: Account) => void;
}) {
  const [register, setRegister] = useState(true);
  const [forgot, setForgot] = useState(false);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const t = (en: string, a: string) => (ar ? a : en);
  async function submit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError("");
    setBusy(true);
    const data = new FormData(e.currentTarget);
    try {
      await api<Account>(register ? "/auth/register" : "/auth/login", "POST", {
        email: data.get("email"),
        password: data.get("password"),
        ...(register ? { name: data.get("name") } : {}),
      });
      const localized = await api<Account>("/preferences", "PATCH", {
        language: ar ? "ar" : "en",
      });
      onSuccess(localized);
    } catch (err) {
      setError(errorMessage(err, ar ? "ar" : "en"));
    } finally {
      setBusy(false);
    }
  }
  return (
    <div className="auth-layout">
      <section className="auth-story">
        <a className="brand" href="/">
          <span className="brand-mark">
            <Leaf size={25} />
          </span>
          study<span className="brand-os">os</span>
        </a>
        <div>
          <span className="hero-tag">{t("ROOM TO GROW", "مساحة للنمو")}</span>
          <h1>
            {t("A little more focus.", "تركيز أكثر قليلًا.")}
            <br />
            {t("A lot more you.", "مساحة أكبر لك.")}
          </h1>
          <p>
            {t(
              "Your next chapter starts with a calmer place to learn.",
              "خطوتك القادمة تبدأ بمكان أهدأ للتعلم.",
            )}
          </p>
          <div className="auth-art" aria-hidden="true">
            <div className="book book-back" />
            <div className="book book-front">
              <Leaf size={60} />
              <span>
                one day
                <br />
                at a time.
              </span>
            </div>
            <span>✧</span>
          </div>
        </div>
        <small>
          {t("Built around the way you learn.", "مصمم حول طريقتك في التعلم.")}
        </small>
      </section>
      <section className="auth-form-area">
        <button className="language-toggle secondary" onClick={onLanguage}>
          {ar ? "English" : "العربية"}
        </button>
        <div className="auth-form">
          <span className="eyebrow">
            {t("WELCOME TO STUDY OS", "مرحبًا بك في STUDY OS")}
          </span>
          <h2>
            {register
              ? t("Make room for learning.", "اصنع مساحة للتعلم.")
              : t("Welcome back.", "أهلًا بعودتك.")}
          </h2>
          <p className="muted">
            {register
              ? t(
                  "Create your own quiet corner of the internet.",
                  "أنشئ مساحتك الهادئة والخاصة.",
                )
              : t("Pick up where you left off.", "تابع من حيث توقفت.")}
          </p>
          <div
            className="auth-tabs"
            role="tablist"
            aria-label={t("Account access", "الدخول للحساب")}
          >
            <button
              role="tab"
              aria-selected={register}
              className={register ? "selected" : ""}
              onClick={() => {
                setRegister(true);
                setError("");
              }}
            >
              {t("Create account", "إنشاء حساب")}
            </button>
            <button
              role="tab"
              aria-selected={!register}
              className={!register ? "selected" : ""}
              onClick={() => {
                setRegister(false);
                setError("");
              }}
            >
              {t("Sign in", "تسجيل الدخول")}
            </button>
          </div>
          <form onSubmit={(e) => void submit(e)}>
            {register && (
              <label>
                {t("Your name", "اسمك")}
                <input
                  name="name"
                  autoComplete="name"
                  required
                  minLength={2}
                  maxLength={60}
                  placeholder={t("What should we call you?", "كيف نناديك؟")}
                />
              </label>
            )}
            <label>
              {t("Email address", "البريد الإلكتروني")}
              <input
                name="email"
                type="email"
                dir="ltr"
                autoComplete="email"
                required
                maxLength={254}
                placeholder="you@example.com"
              />
            </label>
            <label>
              {t("Password", "كلمة المرور")}
              <input
                name="password"
                type="password"
                autoComplete={register ? "new-password" : "current-password"}
                required
                minLength={10}
                maxLength={128}
                placeholder={t("At least 10 characters", "10 أحرف على الأقل")}
              />
            </label>
            {error && (
              <p className="error-box" role="alert">
                {error}
              </p>
            )}
            <button className="primary full-width" disabled={busy}>
              {busy
                ? t("Please wait…", "يرجى الانتظار…")
                : register
                  ? t("Create your space", "أنشئ مساحتك")
                  : t("Sign in", "تسجيل الدخول")}
              <ArrowRight size={18} />
            </button>
          </form>
          {!register && (
            <button
              className="text-button forgot-password"
              onClick={() => setForgot(true)}
            >
              {t("Forgot password?", "نسيت كلمة المرور؟")}
            </button>
          )}
          {forgot && (
            <ForgotPassword ar={ar} onClose={() => setForgot(false)} />
          )}
          <div className="privacy-note">
            <ShieldCheck size={16} />
            {t(
              "Your account. Your private learning space.",
              "حسابك. مساحتك الدراسية الخاصة.",
            )}
          </div>
        </div>
      </section>
    </div>
  );
}
function Onboarding({
  account,
  prefs,
  setPrefs,
  save,
  saving,
  logout,
  toast,
}: {
  account: Account;
  prefs: Preferences;
  setPrefs: (p: Preferences) => void;
  save: (p: Partial<Preferences>) => Promise<void>;
  saving: boolean;
  logout: () => Promise<void>;
  toast: { text: string; error?: boolean } | null;
}) {
  const [step, setStep] = useState(1);
  const ar = prefs.language === "ar";
  const t = (en: string, a: string) => (ar ? a : en);
  return (
    <div className="onboarding">
      <header>
        <span className="brand">
          <span className="brand-mark">
            <Leaf size={23} />
          </span>
          study<span className="brand-os">os</span>
        </span>
        <div className="top-actions">
          <button
            className="secondary"
            onClick={() => setPrefs({ ...prefs, language: ar ? "en" : "ar" })}
          >
            {ar ? "English" : "العربية"}
          </button>
          <button
            className="icon-button"
            aria-label={t("Sign out", "تسجيل الخروج")}
            onClick={() => void logout()}
          >
            <LogOut size={19} />
          </button>
        </div>
      </header>
      <main>
        <span className="eyebrow">
          {t(`STEP ${step} OF 2`, `الخطوة ${step} من 2`)}
        </span>
        <h1>
          {step === 1
            ? t(
                `Hi ${account.user.name.split(" ")[0]}, where are we headed?`,
                `أهلًا ${account.user.name.split(" ")[0]}، من أين نبدأ؟`,
              )
            : t("Make yourself at home.", "اجعل المساحة تشبهك.")}
        </h1>
        <p className="muted">
          {step === 1
            ? t(
                "Choose a starting point. You can always switch later.",
                "اختر نقطة البداية. يمكنك التبديل لاحقًا.",
              )
            : t(
                "A few small choices to make this space yours.",
                "اختيارات صغيرة لتصنع مساحتك الخاصة.",
              )}
        </p>
        {step === 1 ? (
          <div className="track-options">
            {[
              {
                id: "semester",
                icon: GraduationCap,
                en: "My semester",
                ar: "فصلي الدراسي",
                desc: "A space for your university journey.",
                descAr: "مساحة لرحلتك الجامعية.",
              },
              {
                id: "personal",
                icon: Compass,
                en: "Personal study",
                ar: "التعلم الشخصي",
                desc: "Follow your curiosity. Learn at your pace.",
                descAr: "اتبع فضولك وتعلم بوتيرتك.",
              },
            ].map((x) => (
              <button
                key={x.id}
                aria-pressed={prefs.track === x.id}
                className={`track-option ${prefs.track === x.id ? "selected" : ""}`}
                onClick={() =>
                  setPrefs({ ...prefs, track: x.id as Preferences["track"] })
                }
              >
                <span className="soft-icon">
                  <x.icon size={30} />
                </span>
                <h2>{t(x.en, x.ar)}</h2>
                <p>{t(x.desc, x.descAr)}</p>
                <span className="selection-circle">
                  {prefs.track === x.id && <Check size={16} />}
                </span>
              </button>
            ))}
          </div>
        ) : (
          <Appearance
            prefs={prefs}
            save={async (changes) => setPrefs({ ...prefs, ...changes })}
            saving={false}
          />
        )}
        <div className="onboarding-actions">
          {step === 2 ? (
            <button className="secondary" onClick={() => setStep(1)}>
              {t("Back", "رجوع")}
            </button>
          ) : (
            <span />
          )}
          <button
            className="primary"
            disabled={saving}
            onClick={() =>
              step === 1 ? setStep(2) : void save({ ...prefs, onboarded: true })
            }
          >
            {saving
              ? t("Saving…", "جارٍ الحفظ…")
              : step === 1
                ? t("Continue", "متابعة")
                : t("Enter my workspace", "الدخول إلى مساحتي")}
            <ArrowRight size={18} />
          </button>
        </div>
        <p className="onboarding-note">
          {t(
            "Your starting point, not a commitment. Everything can change with you.",
            "نقطة بداية وليست التزامًا. كل شيء قابل للتغيير معك.",
          )}
        </p>
      </main>
      {toast && <Toast message={toast.text} error={toast.error} />}
    </div>
  );
}
