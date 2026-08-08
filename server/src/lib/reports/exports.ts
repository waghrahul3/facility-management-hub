import type { Report, ReportColumn } from "./types.js";

// ---------------------------------------------------------------------------
// Excel export using exceljs (returns a Buffer)
// ---------------------------------------------------------------------------

export async function reportToExcel(report: Report): Promise<Buffer> {
  const exceljsMod = await import("exceljs");
  const ExcelJS = exceljsMod.default;
  const wb = new ExcelJS.Workbook();
  wb.created = new Date();
  wb.creator = "Onion Facility Center";

  const ws = wb.addWorksheet(report.title, {
    views: [{ state: "frozen", ySplit: 4 }],
  });

  // --- title rows ---
  ws.mergeCells("A1:F1");
  ws.getCell("A1").value = report.title;
  ws.getCell("A1").font = { bold: true, size: 16, color: { argb: "FF1B5E20" } };

  ws.mergeCells("A2:F2");
  ws.getCell("A2").value = report.subtitle;

  ws.mergeCells("A3:F3");
  const periodParts: string[] = [];
  if (report.period.from) periodParts.push(`From: ${report.period.from}`);
  if (report.period.to) periodParts.push(`To: ${report.period.to}`);
  ws.getCell("A3").value = `Generated: ${new Date(report.generatedAt).toLocaleString("en-IN")}${periodParts.length ? "  •  " + periodParts.join("  •  ") : ""}`;
  ws.getCell("A3").font = { italic: true, color: { argb: "FF666666" } };

  // --- column header ---
  const headerRow = ws.addRow(report.columns.map((c) => c.label));
  headerRow.font = { bold: true, color: { argb: "FFFFFFFF" } };
  headerRow.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FF2E7D32" } };
  headerRow.alignment = { vertical: "middle", horizontal: "center" };
  headerRow.height = 28;

  // --- data rows ---
  for (const row of report.rows) {
    const values = report.columns.map((col) => formatCell(row, col));
    const r = ws.addRow(values);
    r.alignment = { vertical: "middle", wrapText: true };
  }

  // --- totals row ---
  const totalKeys = Object.keys(report.totals);
  if (totalKeys.length > 0) {
    ws.addRow([]); // blank spacer
    const totRow = ws.addRow([
      "TOTALS",
      ...report.columns.slice(1).map((col) => {
        const v = report.totals[col.key];
        return v !== undefined ? formatMoney(v) : "";
      }),
    ]);
    totRow.font = { bold: true };
    totRow.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFF1F8E9" } };
  }

  // --- column widths ---
  ws.columns = report.columns.map((col) => {
    const maxLen = Math.max(
      col.label.length,
      ...report.rows.map((r) => String(formatCell(r, col)).length)
    );
    return { width: Math.min(Math.max(maxLen + 2, 10), 40) };
  });

  const buf = await wb.xlsx.writeBuffer();
  return Buffer.from(buf);
}

function formatCell(row: Record<string, unknown>, col: ReportColumn): string | number | Date | null {
  const v = row[col.key];
  if (v === null || v === undefined) return "";
  switch (col.type) {
    case "money":
      return typeof v === "number" ? v : Number(v);
    case "number":
      return typeof v === "number" ? v : Number(v);
    case "date":
    case "datetime":
      return v instanceof Date ? v : new Date(String(v));
    case "status":
      return String(v);
    default:
      return String(v);
  }
}

function formatMoney(n: number): string {
  return `₹${Number(n).toLocaleString("en-IN", { maximumFractionDigits: 2 })}`;
}

// pdfkit's built-in Helvetica fonts use WinAnsi encoding, which has no glyph
// for the rupee symbol (U+20B9). Emitting "₹" would produce a blank/garbled
// character in the PDF, so the PDF path uses a font-safe plain-text rupee.
function pdfMoney(n: number): string {
  return `Rs. ${Number(n).toLocaleString("en-IN", { maximumFractionDigits: 2 })}`;
}

function pdfSafeText(s: string): string {
  return s.replace(/₹/g, "Rs. ");
}

// ---------------------------------------------------------------------------
// PDF export using pdfkit (returns a Buffer)
// ---------------------------------------------------------------------------

const PAGE_W = 515; // A4 width minus 2×40 margin
const PAGE_BOTTOM = 790; // rows must stop before the footer band
const HEADER_H = 20;
const ROW_PAD_X = 3;
const ROW_PAD_Y = 4;
const MIN_ROW_H = 16;

/**
 * Compute column widths. Money/number columns get a fixed narrow width;
 * remaining space is shared between the other (text-ish) columns.
 */
function computeColWidths(report: Report): number[] {
  const colCount = report.columns.length;
  const widths = report.columns.map(() => PAGE_W / colCount);
  for (let i = 0; i < colCount; i++) {
    if (report.columns[i].type === "money" || report.columns[i].type === "number") {
      widths[i] = 70;
    }
  }
  const fixed = widths.reduce((a, b) => a + b, 0);
  const extra = PAGE_W - fixed;
  const flexibleCount = widths.filter((_, i) => {
    const t = report.columns[i].type;
    return t !== "money" && t !== "number";
  }).length;
  const per = extra / Math.max(flexibleCount, 1);
  for (let i = 0; i < colCount; i++) {
    const t = report.columns[i].type;
    if (t !== "money" && t !== "number") widths[i] += per;
  }
  return widths;
}

/** Draw the table header band at the current pdf.y; leaves pdf.y below it. */
function drawHeader(pdf: any, report: Report, colWidths: number[]) {
  const top = pdf.y;
  pdf.rect(40, top, PAGE_W, HEADER_H).fill("#2E7D32");
  pdf.fillColor("#FFF").fontSize(7).font("Helvetica-Bold");
  let x = 40;
  for (let i = 0; i < report.columns.length; i++) {
    const col = report.columns[i];
    const align = col.type === "money" || col.type === "number" ? "right" : "left";
    pdf.text(col.label, x + ROW_PAD_X, top + ROW_PAD_Y + 3, {
      width: colWidths[i] - ROW_PAD_X * 2,
      align,
      lineBreak: false,
    });
    x += colWidths[i];
  }
  pdf.font("Helvetica").fillColor("#000");
  pdf.y = top + HEADER_H;
}

/** Draw one data/total row; returns the row height actually used. */
function drawRow(
  pdf: any,
  report: Report,
  colWidths: number[],
  values: string[],
  opts: { bg: string; fg: string; bold?: boolean; firstIsLabel?: boolean }
) {
  // Measure the tallest cell so the row band fits wrapped text.
  const fontSize = 7;
  let maxH = MIN_ROW_H;
  for (let i = 0; i < values.length; i++) {
    const w = colWidths[i] - ROW_PAD_X * 2;
    const h = pdf.fontSize(fontSize).heightOfString(values[i], { width: w });
    if (h + ROW_PAD_Y * 2 > maxH) maxH = h + ROW_PAD_Y * 2;
  }
  const rowH = Math.ceil(maxH);

  if (pdf.y + rowH > PAGE_BOTTOM) {
    pdf.addPage();
    pdf.y = 40;
    drawHeader(pdf, report, colWidths);
  }

  const top = pdf.y;
  pdf.rect(40, top, PAGE_W, rowH).fill(opts.bg);
  pdf.fillColor(opts.fg).fontSize(fontSize);
  if (opts.bold) pdf.font("Helvetica-Bold");
  let x = 40;
  for (let i = 0; i < values.length; i++) {
    const col = report.columns[i];
    const align = col.type === "money" || col.type === "number" ? "right" : "left";
    const text = opts.firstIsLabel && i === 0 ? "TOTALS" : values[i];
    pdf.text(text, x + ROW_PAD_X, top + ROW_PAD_Y, {
      width: colWidths[i] - ROW_PAD_X * 2,
      align,
      lineBreak: false,
    });
    x += colWidths[i];
  }
  pdf.font("Helvetica").fillColor("#000");
  pdf.y = top + rowH;
  return rowH;
}

export async function reportToPdf(report: Report): Promise<Buffer> {
  const PDFDocument = (await import("pdfkit")).default;
  const pdf = new PDFDocument({ size: "A4", margin: 40, bufferPages: true });

  const chunks: Buffer[] = [];
  pdf.on("data", (c: Buffer) => chunks.push(c));

  // Title
  pdf.fontSize(18).fillColor("#1B5E20").text(report.title, { align: "center" });
  pdf.moveDown(0.3);
  pdf.fontSize(10).fillColor("#666666").text(report.subtitle, { align: "center" });
  pdf.moveDown(0.2);

  // Period + generated
  const periodParts: string[] = [];
  if (report.period.from) periodParts.push(`From: ${report.period.from}`);
  if (report.period.to) periodParts.push(`To: ${report.period.to}`);
  pdf.fontSize(8).fillColor("#999999").text(
    `Generated: ${new Date(report.generatedAt).toLocaleString("en-IN")}${periodParts.length ? "  |  " + periodParts.join("  |  ") : ""}`,
    { align: "center" }
  );
  pdf.moveDown(0.8);

  // Summary cards (2 columns)
  if (report.cards.length > 0) {
    const cardW = 240;
    const startX = 40;
    let y = pdf.y;
    for (let i = 0; i < report.cards.length; i++) {
      const x = startX + (i % 2) * (cardW + 20);
      if (i > 0 && i % 2 === 0) y += 40;
      pdf.roundedRect(x, y, cardW, 34, 4).fillAndStroke("#F1F8E9", "#C5E1A5");
      pdf.fontSize(8).fillColor("#666").text(report.cards[i].label, x + 8, y + 5, { width: cardW - 16 });
      pdf.fontSize(12).fillColor("#1B5E20").font("Helvetica-Bold").text(pdfSafeText(report.cards[i].value), x + 8, y + 17, { width: cardW - 16 });
      pdf.font("Helvetica").fillColor("#000");
    }
    pdf.y = y + 48;
  }

  // Table
  if (report.rows.length > 0) {
    const colWidths = computeColWidths(report);
    const totalKeys = Object.keys(report.totals);

    drawHeader(pdf, report, colWidths);

    // Rows
    for (let ri = 0; ri < report.rows.length; ri++) {
      const values = report.columns.map((col) => formatPdfCell(report.rows[ri], col));
      drawRow(pdf, report, colWidths, values, {
        bg: ri % 2 === 0 ? "#FFFFFF" : "#FAFAFA",
        fg: "#333333",
      });
    }

    // Totals
    if (totalKeys.length > 0) {
      const values = report.columns.map((col) => {
        const v = report.totals[col.key];
        return v !== undefined ? pdfMoney(v) : "";
      });
      drawRow(pdf, report, colWidths, values, {
        bg: "#F1F8E9",
        fg: "#1B5E20",
        bold: true,
        firstIsLabel: true,
      });
    }
  } else {
    pdf.moveDown(1).fontSize(10).fillColor("#999").text("No data found for the selected filters.", { align: "center" });
  }

  // Footer — page numbers. Keep the baseline well above pdfkit's maxY()
  // (A4 height 841.89 − 40 margin = 801.89) or the LineWrapper auto-adds a
  // phantom page for every footer line it writes.
  const range = pdf.bufferedPageRange();
  const footerY = 788;
  for (let i = range.start; i < range.start + range.count; i++) {
    pdf.switchToPage(i);
    pdf.fontSize(7).fillColor("#999").text(
      `Onion Facility Center  •  Page ${i - range.start + 1} of ${range.count}`,
      40, footerY, { align: "center", width: 515 }
    );
  }

  pdf.end();
  return new Promise<Buffer>((resolve) => {
    pdf.on("end", () => resolve(Buffer.concat(chunks)));
  });
}

function formatPdfCell(row: Record<string, unknown>, col: ReportColumn): string {
  const v = row[col.key];
  if (v === null || v === undefined) return "";
  if (col.type === "money") return pdfMoney(Number(v));
  if (col.type === "number") {
    const n = Number(v);
    return isNaN(n) ? String(v) : n.toLocaleString("en-IN");
  }
  if (col.type === "date" || col.type === "datetime") {
    const dt = new Date(String(v));
    if (isNaN(dt.getTime())) return String(v);
    return dt.toLocaleString("en-IN", {
      day: "2-digit",
      month: "short",
      year: "numeric",
      ...(col.type === "datetime" ? { hour: "2-digit", minute: "2-digit" } : {}),
    });
  }
  return String(v);
}
