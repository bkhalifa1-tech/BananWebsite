import { useCallback, useEffect, useState } from "react";
import { api } from "../../lib/api";
import { errorMessage } from "../../lib/errors";
import { Card, Skeleton } from "../../components/ui";
type Group = { id: string; name: string; role: string };
type SharedNote = {
  id: string;
  title: string;
  body: string;
  version: number;
  author: string;
  author_id: string;
};
type GroupData = {
  group: { id: string; name: string };
  role: string;
  notes: SharedNote[];
  members: { id: string; name: string; role: string }[];
};
type Post = {
  id: string;
  title: string;
  body: string;
  topic: string;
  author: string;
  mine: number;
  likes: number;
  liked: number;
  comments: number;
  created_at: string;
};
type Comment = { id: string; body: string; author: string; mine: number };
export default function Social({
  language,
  userId,
}: {
  language: "ar" | "en";
  userId: string;
}) {
  const t = (e: string, a: string) => (language === "ar" ? a : e),
    [data, setData] = useState<{
      groups: Group[];
      invites: { id: string; name: string; role: string }[];
      moderator: boolean;
    } | null>(null),
    [tab, setTab] = useState("groups"),
    [group, setGroup] = useState<GroupData | null>(null),
    [posts, setPosts] = useState<Post[]>([]),
    [next, setNext] = useState<number | null>(null),
    [comments, setComments] = useState<Record<string, Comment[]>>({}),
    [reports, setReports] = useState<
      { post_id: string; title: string; reason: string }[]
    >([]),
    [editing, setEditing] = useState<SharedNote | null>(null),
    [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  const refresh = useCallback(async () => {
    try {
      const [s, c] = await Promise.all([
        api<typeof data>("/social"),
        api<{ posts: Post[]; next: number | null }>("/community"),
      ]);
      setData(s);
      setPosts(c.posts);
      setNext(c.next);
      if (s?.moderator) setReports(await api("/community-reports"));
    } catch (e) {
      setError(errorMessage(e, language));
    }
  }, [language]);
  useEffect(() => {
    void refresh();
  }, [refresh]);
  async function open(id: string) {
    try {
      setGroup(await api(`/groups/${id}`));
      setEditing(null);
      setError("");
    } catch (e) {
      setError(errorMessage(e, language));
    }
  }
  async function mutate(path: string, method: string, body?: unknown) {
    setBusy(true);
    setError("");
    try {
      await api(path, method, body);
      await refresh();
      if (group) await open(group.group.id);
      return true;
    } catch (e) {
      setError(errorMessage(e, language));
      return false;
    } finally {
      setBusy(false);
    }
  }
  async function readComments(id: string) {
    try {
      setComments((old) => ({ ...old, [id]: [] }));
      const c = await api<Comment[]>(`/community/${id}/comments`);
      setComments((old) => ({ ...old, [id]: c }));
    } catch (e) {
      setError(errorMessage(e, language));
    }
  }
  return (
    <Card className="social-workspace">
      <h1>{t("Study together", "ندرس معًا")}</h1>
      <div className="workspace-tabs">
        <button
          className={tab === "groups" ? "active" : ""}
          onClick={() => setTab("groups")}
        >
          {t("Study groups", "مجموعات الدراسة")}
        </button>
        <button
          className={tab === "community" ? "active" : ""}
          onClick={() => setTab("community")}
        >
          {t("Community", "المجتمع")}
        </button>
      </div>
      {error && (
        <p role="alert" className="error-box">
          {error}
          <button className="text-button" onClick={() => void refresh()}>
            {t("Retry", "إعادة المحاولة")}
          </button>
        </p>
      )}
      {!data ? (
        <Skeleton />
      ) : tab === "groups" ? (
        <>
          <p className="field-hint">
            {t(
              "Only notes you explicitly add here are shared with group members. Your files, grades and private notes stay private. Invitations appear in the recipient’s account; no email is sent.",
              "تُشارك فقط الملاحظات التي تضيفها هنا صراحةً مع أعضاء المجموعة. تبقى ملفاتك ودرجاتك وملاحظاتك الخاصة محمية. تظهر الدعوات داخل حساب المستلم؛ لا يُرسل بريد.",
            )}
          </p>
          {data.invites.map((i) => (
            <article className="social-item" key={i.id}>
              <strong>{i.name}</strong>
              <span>{i.role}</span>
              <button
                className="secondary"
                disabled={busy}
                onClick={() =>
                  void mutate(`/group-invites/${i.id}/accept`, "POST", {})
                }
              >
                {t("Accept invitation", "قبول الدعوة")}
              </button>
            </article>
          ))}
          <form
            className="link-form"
            onSubmit={async (e) => {
              e.preventDefault();
              const form = e.currentTarget,
                name = new FormData(form).get("name");
              if (await mutate("/groups", "POST", { name })) form.reset();
            }}
          >
            <input
              name="name"
              required
              minLength={2}
              maxLength={100}
              aria-label={t("New group name", "اسم المجموعة الجديدة")}
              placeholder={t("New group name", "اسم المجموعة الجديدة")}
            />
            <button className="secondary" disabled={busy}>
              {t("Create group", "إنشاء مجموعة")}
            </button>
          </form>
          {!data.groups.length && (
            <p className="empty-copy">
              {t(
                "Create a group or accept an invitation to collaborate.",
                "أنشئ مجموعة أو اقبل دعوة للتعاون.",
              )}
            </p>
          )}
          <div className="button-row">
            {data.groups.map((g) => (
              <button
                className={group?.group.id === g.id ? "primary" : "secondary"}
                key={g.id}
                onClick={() => void open(g.id)}
              >
                {g.name}
              </button>
            ))}
          </div>
          {group && (
            <section>
              <div className="section-title">
                <h2>{group.group.name}</h2>
                <button
                  className="secondary"
                  onClick={() => void open(group.group.id)}
                >
                  {t("Refresh shared notes", "تحديث الملاحظات المشتركة")}
                </button>
                {group.role === "owner" && (
                  <button
                    className="text-button"
                    disabled={busy}
                    onClick={async () => {
                      if (
                        !confirm(
                          t(
                            "Delete this group and its shared notes?",
                            "حذف المجموعة وملاحظاتها المشتركة؟",
                          ),
                        )
                      )
                        return;
                      setGroup(null);
                      await mutate(`/groups/${group.group.id}`, "DELETE");
                    }}
                  >
                    {t("Delete group", "حذف المجموعة")}
                  </button>
                )}
              </div>
              {group.role === "owner" && (
                <form
                  className="editor-form"
                  onSubmit={async (e) => {
                    e.preventDefault();
                    const form = e.currentTarget,
                      f = new FormData(form);
                    if (
                      await mutate(
                        `/groups/${group.group.id}/invites`,
                        "POST",
                        { email: f.get("email"), role: f.get("role") },
                      )
                    )
                      form.reset();
                  }}
                >
                  <div className="form-columns">
                    <label>
                      {t("Invite by email", "دعوة بالبريد")}
                      <input
                        name="email"
                        type="email"
                        required
                        maxLength={254}
                      />
                    </label>
                    <label>
                      {t("Access", "الصلاحية")}
                      <select name="role">
                        <option value="editor">
                          {t(
                            "Can edit shared notes",
                            "يمكنه تعديل الملاحظات المشتركة",
                          )}
                        </option>
                        <option value="viewer">
                          {t("Read only", "قراءة فقط")}
                        </option>
                      </select>
                    </label>
                  </div>
                  <button className="secondary" disabled={busy}>
                    {t("Create invitation", "إنشاء دعوة")}
                  </button>
                </form>
              )}
              <div className="group-members">
                {group.members.map((m) => (
                  <span key={m.id}>
                    {m.name} · {m.role}
                    {(group.role === "owner" || m.id === userId) && (
                      <button
                        className="text-button"
                        onClick={async () => {
                          if (
                            await mutate(
                              `/groups/${group.group.id}/members/${m.id}`,
                              "DELETE",
                            )
                          ) {
                            if (m.id === userId) setGroup(null);
                          }
                        }}
                      >
                        {t("Remove / leave", "إزالة / مغادرة")}
                      </button>
                    )}
                  </span>
                ))}
              </div>
              {group.role !== "viewer" && (
                <form
                  key={editing?.id || "new"}
                  className="editor-form"
                  onSubmit={async (e) => {
                    e.preventDefault();
                    const form = e.currentTarget,
                      f = new FormData(form),
                      body = {
                        title: f.get("title"),
                        body: f.get("body"),
                        ...(editing ? { version: editing.version } : {}),
                      };
                    if (
                      await mutate(
                        editing
                          ? `/groups/${group.group.id}/notes/${editing.id}`
                          : `/groups/${group.group.id}/notes`,
                        editing ? "PATCH" : "POST",
                        body,
                      )
                    ) {
                      setEditing(null);
                      form.reset();
                    }
                  }}
                >
                  <h3>
                    {editing
                      ? t("Edit shared note", "تعديل ملاحظة مشتركة")
                      : t("New shared note", "ملاحظة مشتركة جديدة")}
                  </h3>
                  <label>
                    {t("Title", "العنوان")}
                    <input
                      name="title"
                      required
                      minLength={2}
                      maxLength={160}
                      defaultValue={editing?.title}
                    />
                  </label>
                  <label>
                    {t("Shared content", "المحتوى المشترك")}
                    <textarea
                      name="body"
                      required
                      maxLength={10000}
                      defaultValue={editing?.body}
                    />
                  </label>
                  <div className="button-row">
                    <button className="primary" disabled={busy}>
                      {t("Save shared note", "حفظ الملاحظة المشتركة")}
                    </button>
                    {editing && (
                      <button
                        type="button"
                        className="text-button"
                        onClick={() => setEditing(null)}
                      >
                        {t("Cancel", "إلغاء")}
                      </button>
                    )}
                  </div>
                </form>
              )}
              {!group.notes.length && (
                <p className="empty-copy">
                  {t("No shared notes yet.", "لا توجد ملاحظات مشتركة بعد.")}
                </p>
              )}
              {group.notes.map((n) => (
                <article className="social-note" key={n.id}>
                  <h3>{n.title}</h3>
                  <small>
                    {n.author} · v{n.version}
                  </small>
                  <p>{n.body}</p>
                  <div className="button-row">
                    {group.role !== "viewer" && (
                      <button
                        className="secondary"
                        disabled={busy}
                        onClick={() => setEditing(n)}
                      >
                        {t("Edit", "تعديل")}
                      </button>
                    )}
                    {(group.role === "owner" || n.author_id === userId) && (
                      <button
                        className="text-button"
                        disabled={busy}
                        onClick={() =>
                          void mutate(
                            `/groups/${group.group.id}/notes/${n.id}`,
                            "DELETE",
                          )
                        }
                      >
                        {t("Delete", "حذف")}
                      </button>
                    )}
                  </div>
                </article>
              ))}
            </section>
          )}
        </>
      ) : (
        <>
          <p className="field-hint">
            {t(
              "Posts are visible to signed-in members of this site. Share only content you have permission to share.",
              "المنشورات مرئية للأعضاء المسجلين في هذا الموقع. شارك فقط المحتوى الذي تملك حق مشاركته.",
            )}
          </p>
          <form
            className="editor-form"
            onSubmit={async (e) => {
              e.preventDefault();
              const form = e.currentTarget,
                f = new FormData(form);
              if (
                await mutate("/community", "POST", {
                  title: f.get("title"),
                  body: f.get("body"),
                  topic: f.get("topic"),
                  consent: f.get("consent") === "on",
                })
              )
                form.reset();
            }}
          >
            <div className="form-columns">
              <label>
                {t("Post title", "عنوان المنشور")}
                <input name="title" required minLength={2} maxLength={160} />
              </label>
              <label>
                {t("Topic", "الموضوع")}
                <input name="topic" maxLength={80} />
              </label>
            </div>
            <label>
              {t("Post content", "محتوى المنشور")}
              <textarea name="body" required maxLength={10000} />
            </label>
            <label className="consent-label">
              <input name="consent" type="checkbox" required />
              {t(
                "I agree to share this content with site members.",
                "أوافق على مشاركة هذا المحتوى مع أعضاء الموقع.",
              )}
            </label>
            <button className="primary" disabled={busy}>
              {t("Publish post", "نشر المنشور")}
            </button>
          </form>
          {!!reports.length && (
            <section>
              <h2>{t("Moderation reports", "بلاغات الإشراف")}</h2>
              {reports.map((r, i) => (
                <article className="social-note" key={i}>
                  <strong>{r.title}</strong>
                  <p>{r.reason}</p>
                  <button
                    className="secondary"
                    disabled={busy}
                    onClick={() =>
                      void mutate(
                        `/community-moderation/${r.post_id}/hide`,
                        "POST",
                        {},
                      )
                    }
                  >
                    {t("Hide reported post", "إخفاء المنشور المُبلغ عنه")}
                  </button>
                </article>
              ))}
            </section>
          )}
          {!posts.length && (
            <p className="empty-copy">
              {t("Start a study discussion.", "ابدأ نقاشًا دراسيًا.")}
            </p>
          )}
          {posts.map((p) => (
            <article className="social-note" key={p.id}>
              <h2>{p.title}</h2>
              <small>
                {p.author} · {p.topic} ·{" "}
                {new Date(p.created_at).toLocaleDateString(language)}
              </small>
              <p>{p.body}</p>
              <div className="button-row">
                <button
                  className="secondary"
                  disabled={busy}
                  onClick={() =>
                    void mutate(
                      `/community/${p.id}/like`,
                      p.liked ? "DELETE" : "POST",
                      p.liked ? undefined : {},
                    )
                  }
                >
                  {p.liked ? t("Unlike", "إلغاء الإعجاب") : t("Like", "إعجاب")}{" "}
                  · {p.likes}
                </button>
                <button
                  className="text-button"
                  onClick={() => void readComments(p.id)}
                >
                  {t("Comments", "التعليقات")} · {p.comments}
                </button>
                {p.mine ? (
                  <button
                    className="text-button"
                    disabled={busy}
                    onClick={() => void mutate(`/community/${p.id}`, "DELETE")}
                  >
                    {t("Delete", "حذف")}
                  </button>
                ) : (
                  <button
                    className="text-button"
                    disabled={busy}
                    onClick={() => {
                      const reason = prompt(t("Report reason", "سبب البلاغ"));
                      if (reason)
                        void mutate(`/community/${p.id}/report`, "POST", {
                          reason,
                        });
                    }}
                  >
                    {t("Report", "إبلاغ")}
                  </button>
                )}
              </div>
              {comments[p.id] && (
                <>
                  <div>
                    {comments[p.id].map((c) => (
                      <article key={c.id}>
                        <strong>{c.author}</strong>
                        <p>{c.body}</p>
                        {!!c.mine && (
                          <button
                            className="text-button"
                            onClick={async () => {
                              await mutate(
                                `/community-comments/${c.id}`,
                                "DELETE",
                              );
                              await readComments(p.id);
                            }}
                          >
                            {t("Delete comment", "حذف التعليق")}
                          </button>
                        )}
                      </article>
                    ))}
                  </div>
                  <form
                    className="link-form"
                    onSubmit={async (e) => {
                      e.preventDefault();
                      const form = e.currentTarget,
                        body = new FormData(form).get("body");
                      if (
                        await mutate(`/community/${p.id}/comments`, "POST", {
                          body,
                        })
                      ) {
                        form.reset();
                        await readComments(p.id);
                      }
                    }}
                  >
                    <input
                      name="body"
                      required
                      maxLength={2000}
                      aria-label={t("Comment", "تعليق")}
                    />
                    <button className="secondary" disabled={busy}>
                      {t("Add comment", "إضافة تعليق")}
                    </button>
                  </form>
                </>
              )}
            </article>
          ))}
          {next !== null && (
            <button
              className="secondary"
              disabled={busy}
              onClick={async () => {
                setBusy(true);
                try {
                  const d = await api<{ posts: Post[]; next: number | null }>(
                    `/community?before=${next}`,
                  );
                  setPosts((old) => [...old, ...d.posts]);
                  setNext(d.next);
                } catch (e) {
                  setError(errorMessage(e, language));
                } finally {
                  setBusy(false);
                }
              }}
            >
              {t("Load older posts", "تحميل منشورات أقدم")}
            </button>
          )}
        </>
      )}
    </Card>
  );
}
