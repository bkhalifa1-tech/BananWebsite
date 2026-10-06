import { PdfStudyTools } from "./PdfStudyTools";
import { api } from "../../lib/api";
import { useState, useMemo, useEffect } from "react";
import { Document, Page, pdfjs } from "react-pdf";
import workerUrl from "pdfjs-dist/build/pdf.worker.min.mjs?url";
import "react-pdf/dist/Page/TextLayer.css";
import "react-pdf/dist/Page/AnnotationLayer.css";
pdfjs.GlobalWorkerOptions.workerSrc = workerUrl;
export type Material = {
  id: string;
  name: string;
  mime: string;
  size: number;
  folder_id: string | null;
};
export function MaterialReader({
  material,
  language,
}: {
  material: Material;
  language: "ar" | "en";
}) {
  const [page, setPage] = useState(1),
    [pages, setPages] = useState(0),
    [zoom, setZoom] = useState(1),
    [error, setError] = useState(false);
  const [text,setText]=useState("");
  useEffect(()=>{if(material.mime.includes("openxmlformats"))void api<{text:string}>(`/materials/${material.id}/text`).then(d=>setText(d.text)).catch(()=>setError(true));},[material.id,material.mime]);
  const t = (e: string, a: string) => (language === "ar" ? a : e);
  const options = useMemo(
    () => ({
      cMapUrl: "/pdf-assets/cmaps/",
      cMapPacked: true,
      standardFontDataUrl: "/pdf-assets/standard_fonts/",
      wasmUrl: "/pdf-assets/wasm/",
    }),
    [],
  );
  const url = `/api/materials/${material.id}/file`;
  return (
    <div className="material-reader">
      <header>
        <strong>{material.name}</strong>
        <a className="text-button" href={url} download>
          {t("Download", "تنزيل")}
        </a>
      </header>
      {material.mime === "application/pdf" ? (
        <>
          <div className="reader-controls">
            <button
              className="secondary"
              disabled={page <= 1}
              onClick={() => setPage(page - 1)}
            >
              {t("Previous", "السابق")}
            </button>
            <span>
              {page} / {pages || "—"}
            </span>
            <button
              className="secondary"
              disabled={!pages || page >= pages}
              onClick={() => setPage(page + 1)}
            >
              {t("Next", "التالي")}
            </button>
            <select
              aria-label={t("Zoom", "التكبير")}
              value={zoom}
              onChange={(e) => setZoom(Number(e.target.value))}
            >
              {[0.75, 1, 1.25, 1.5].map((value) => (
                <option key={value} value={value}>
                  {value * 100}%
                </option>
              ))}
            </select>
          </div>
          <div className="pdf-scroll">
            <Document
              suspense={false}
              options={options}
              file={url}
              onLoadSuccess={(p) => {
                setPages(p.numPages);
                setError(false);
              }}
              onLoadError={() => setError(true)}
              loading={<p>{t("Loading PDF…", "جارٍ تحميل PDF…")}</p>}
              error={
                <p role="alert">
                  {t(
                    "This PDF could not be read. Download it to inspect the original.",
                    "تعذر قراءة ملف PDF. نزّله لفحص الملف الأصلي.",
                  )}
                </p>
              }
            >
              <PdfStudyTools materialId={material.id} page={page} language={language} onPage={setPage} onSelection={text=>window.dispatchEvent(new CustomEvent("study-selection",{detail:{materialId:material.id,text}}))}>
              <Page
                pageNumber={page}
                width={470}
                scale={zoom}
                renderAnnotationLayer={false}
                loading={<p>{t("Loading page…", "جارٍ تحميل الصفحة…")}</p>}
              />
              </PdfStudyTools>
            </Document>
          </div>
          {error && (
            <button
              className="secondary"
              onClick={() => window.location.reload()}
            >
              {t("Retry", "إعادة المحاولة")}
            </button>
          )}
        </>
      ) : material.mime.startsWith("audio/") ? <audio controls preload="metadata" src={url} onError={()=>setError(true)}/> : material.mime.startsWith("video/") ? <video controls preload="metadata" className="material-video" src={url} onError={()=>setError(true)}/> : material.mime.includes("openxmlformats") ? <div className="study-output"><p>{t("Text view. Download the original to see its complete formatting.","عرض نصي. نزّل الأصل لرؤية التنسيق الكامل.")}</p><pre>{text||t("Loading document…","جارٍ تحميل المستند…")}</pre></div> : (
        <img
          className="material-image"
          src={url}
          alt={material.name}
          onError={() => setError(true)}
        />
      )}{" "}
      {error && material.mime !== "application/pdf" && (
        <p role="alert">
          {t("This file could not be displayed.", "تعذر عرض الملف.")}
        </p>
      )}
    </div>
  );
}
