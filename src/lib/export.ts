import { jsPDF } from "jspdf";
import autoTable from "jspdf-autotable";
import * as XLSX from "xlsx";

export type ExportRow = Record<string, string | number | null | undefined>;

function escapeCsvCell(value: string | number | null | undefined): string {
  const raw = value == null ? "" : String(value);
  if (/[",\n\r]/.test(raw)) {
    return `"${raw.replace(/"/g, '""')}"`;
  }
  return raw;
}

export function downloadXlsx(
  filename: string,
  rows: ExportRow[],
  sheetName = "Sheet1"
): void {
  const workbook = XLSX.utils.book_new();
  const worksheet =
    rows.length === 0
      ? XLSX.utils.aoa_to_sheet([["(no rows)"]])
      : XLSX.utils.json_to_sheet(rows);
  XLSX.utils.book_append_sheet(workbook, worksheet, sheetName.slice(0, 31));
  const outName = filename.endsWith(".xlsx") ? filename : `${filename}.xlsx`;
  XLSX.writeFile(workbook, outName);
}

export function downloadCsv(filename: string, rows: ExportRow[]): void {
  if (rows.length === 0) {
    const blob = new Blob([""], { type: "text/csv;charset=utf-8;" });
    triggerDownload(filename.endsWith(".csv") ? filename : `${filename}.csv`, blob);
    return;
  }

  const columns = Object.keys(rows[0]);
  const lines = [
    columns.map(escapeCsvCell).join(","),
    ...rows.map((row) => columns.map((col) => escapeCsvCell(row[col])).join(",")),
  ];
  const blob = new Blob([lines.join("\n")], { type: "text/csv;charset=utf-8;" });
  triggerDownload(filename.endsWith(".csv") ? filename : `${filename}.csv`, blob);
}

export interface PdfTableSpec {
  title: string;
  columns: string[];
  rows: Array<Array<string | number>>;
}

export function downloadPdfTables(filename: string, docTitle: string, tables: PdfTableSpec[]): void {
  const doc = new jsPDF({ orientation: "landscape" });
  let y = 14;
  doc.setFontSize(14);
  doc.text(docTitle, 14, y);
  y += 8;

  tables.forEach((table, index) => {
    if (index > 0) {
      const pageHeight = doc.internal.pageSize.getHeight();
      if (y > pageHeight - 40) {
        doc.addPage();
        y = 14;
      } else {
        y += 6;
      }
    }
    doc.setFontSize(11);
    doc.text(table.title, 14, y);
    y += 2;
    autoTable(doc, {
      startY: y,
      head: [table.columns],
      body: table.rows.map((row) => row.map((cell) => String(cell ?? ""))),
      styles: { fontSize: 8, cellPadding: 2 },
      headStyles: { fillColor: [79, 70, 229] },
      margin: { left: 14, right: 14 },
    });
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    y = ((doc as any).lastAutoTable?.finalY ?? y) + 8;
  });

  doc.save(filename.endsWith(".pdf") ? filename : `${filename}.pdf`);
}

function triggerDownload(filename: string, blob: Blob): void {
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = filename;
  document.body.appendChild(anchor);
  anchor.click();
  document.body.removeChild(anchor);
  URL.revokeObjectURL(url);
}
