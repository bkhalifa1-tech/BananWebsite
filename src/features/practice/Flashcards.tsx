import { useCallback, useEffect, useState } from "react";
import { api } from "../../lib/api";
import { errorMessage } from "../../lib/errors";
import { Modal, Skeleton } from "../../components/ui";
import type { Deck, Flashcard } from "./types";
export default function Flashcards({
  deckId,
  language,
  onClose,
  onChanged,
}: {
  deckId: string;
  language: "ar" | "en";
  onClose: () => void;
  onChanged: () => void;
}) {
  const t = (e: string, a: string) => (language === "ar" ? a : e);
  const [data, setData] = useState<{ deck: Deck; cards: Flashcard[] } | null>(
      null,
    ),
    [review, setReview] = useState(false),
    [revealed, setRevealed] = useState(false),
    [editor, setEditor] = useState<Flashcard | "new" | null>(null),
    [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  const refresh = useCallback(async () => {
    try {
      setData(await api(`/decks/${deckId}`));
      setRevealed(false);
      onChanged();
    } catch (e) {
      setError(errorMessage(e, language));
    }
  }, [deckId, language, onChanged]);
  useEffect(() => {
    void refresh();
  }, [refresh]);
  async function save(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setBusy(true);
    setError("");
    const f = new FormData(e.currentTarget);
    try {
      await api(
        editor === "new"
          ? `/decks/${deckId}/cards`
          : `/cards/${(editor as Flashcard).id}`,
        editor === "new" ? "POST" : "PATCH",
        {
          front: f.get("front"),
          back: f.get("back"),
          topic: f.get("topic"),
          source: f.get("source"),
        },
      );
      setEditor(null);
      await refresh();
    } catch (e) {
      setError(errorMessage(e, language));
    } finally {
      setBusy(false);
    }
  }
  async function rate(card: Flashcard, rating: number) {
    setBusy(true);
    setError("");
    try {
      await api(`/cards/${card.id}/reviews`, "POST", {
        rating,
        version: card.version,
      });
      await refresh();
    } catch (e) {
      setError(errorMessage(e, language));
    } finally {
      setBusy(false);
    }
  }
  async function remove(card: Flashcard) {
    if (
      !confirm(
        t(
          "Delete this card and its review history?",
          "حذف البطاقة وسجل مراجعاتها؟",
        ),
      )
    )
      return;
    try {
      await api(`/cards/${card.id}`, "DELETE");
      await refresh();
    } catch (e) {
      setError(errorMessage(e, language));
    }
  }
  const due =
      data?.cards.filter((c) => Date.parse(c.next_review) <= Date.now()) || [],
    card = due[0];
  return (
    <Modal
      title={data?.deck.name || t("Flashcards", "بطاقات المراجعة")}
      closeLabel={t("Close", "إغلاق")}
      onClose={onClose}
    >
      {error && (
        <p className="error-box" role="alert">
          {error}
        </p>
      )}
      {!data ? (
        <Skeleton />
      ) : editor ? (
        <form className="editor-form" onSubmit={(e) => void save(e)}>
          <label>
            {t("Card front", "وجه البطاقة")}
            <textarea
              name="front"
              required
              maxLength={4000}
              defaultValue={editor === "new" ? "" : editor.front}
            />
          </label>
          <label>
            {t("Card back", "ظهر البطاقة")}
            <textarea
              name="back"
              required
              maxLength={8000}
              defaultValue={editor === "new" ? "" : editor.back}
            />
          </label>
          <label>
            {t("Topic", "الموضوع")}
            <input
              name="topic"
              maxLength={100}
              defaultValue={editor === "new" ? "" : editor.topic}
            />
          </label>
          <label>
            {t("Source", "المصدر")}
            <input
              name="source"
              maxLength={300}
              defaultValue={editor === "new" ? "" : editor.source}
            />
          </label>
          <div className="button-row">
            <button className="primary" disabled={busy}>
              {t("Save card", "حفظ البطاقة")}
            </button>
            <button
              className="secondary"
              type="button"
              onClick={() => setEditor(null)}
            >
              {t("Cancel", "إلغاء")}
            </button>
          </div>
        </form>
      ) : review ? (
        <>
          <button className="text-button" onClick={() => setReview(false)}>
            {t("Back to cards", "العودة للبطاقات")}
          </button>
          {card ? (
            <div className="flashcard-review">
              <p className="eyebrow">
                {card.topic} · {due.length} {t("due", "للمراجعة")}
              </p>
              <h3>{card.front}</h3>
              {revealed ? (
                <>
                  <div className="flashcard-answer">{card.back}</div>
                  <div className="button-row">
                    {[
                      t("Again", "مجددًا"),
                      t("Hard", "صعبة"),
                      t("Good", "جيدة"),
                      t("Easy", "سهلة"),
                    ].map((label, i) => (
                      <button
                        className="secondary"
                        key={i}
                        disabled={busy}
                        onClick={() => void rate(card, i)}
                      >
                        {label}
                      </button>
                    ))}
                  </div>
                </>
              ) : (
                <button className="primary" onClick={() => setRevealed(true)}>
                  {t("Show answer", "إظهار الإجابة")}
                </button>
              )}
            </div>
          ) : (
            <p className="empty-copy">
              {t(
                "All due cards are reviewed. Your next review dates are saved.",
                "انتهت البطاقات المستحقة. تم حفظ مواعيد المراجعة القادمة.",
              )}
            </p>
          )}
        </>
      ) : (
        <>
          <div className="button-row">
            <button className="primary" onClick={() => setEditor("new")}>
              {t("Add card", "إضافة بطاقة")}
            </button>
            <button
              className="secondary"
              disabled={!due.length}
              onClick={() => {
                setReview(true);
                setRevealed(false);
              }}
            >
              {t("Review due cards", "مراجعة البطاقات المستحقة")} ({due.length})
            </button>
            <button
              className="text-button"
              onClick={async () => {
                const name = prompt(
                  t("Deck name", "اسم المجموعة"),
                  data.deck.name,
                );
                if (!name) return;
                try {
                  await api(`/decks/${deckId}`, "PATCH", { name });
                  await refresh();
                } catch (e) {
                  setError(errorMessage(e, language));
                }
              }}
            >
              {t("Rename", "تغيير الاسم")}
            </button>
          </div>
          {data.cards.map((c) => (
            <div className="practice-row" key={c.id}>
              <div>
                <strong>{c.front}</strong>
                <p>
                  {c.topic} · {t("Next review", "المراجعة القادمة")}:{" "}
                  {new Date(c.next_review).toLocaleDateString(language)}
                </p>
              </div>
              <button
                className="text-button"
                aria-label={`${t("Edit card", "تعديل البطاقة")}: ${c.front}`}
                onClick={() => setEditor(c)}
              >
                {t("Edit", "تعديل")}
              </button>
              <button className="text-button" onClick={() => void remove(c)}>
                {t("Delete", "حذف")}
              </button>
            </div>
          ))}
          {!data.cards.length && (
            <p className="empty-copy">
              {t("Add your first question and answer.", "أضف أول سؤال وإجابة.")}
            </p>
          )}
        </>
      )}
    </Modal>
  );
}
