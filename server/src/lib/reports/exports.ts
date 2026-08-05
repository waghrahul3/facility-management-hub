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
  return `₹${Number(n).toLocaleString("en-IN", { maximumFractionDigits: 0 })}`;
}

// ---------------------------------------------------------------------------
// PDF export using pdfkit (returns a Buffer)
// ---------------------------------------------------------------------------

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
      pdf.fontSize(12).fillColor("#1B5E20").font("Helvetica-Bold").text(report.cards[i].value, x + 8, y + 17, { width: cardW - 16 });
      pdf.font("Helvetica").fillColor("#000");
    }
    pdf.y = y + 48;
  }

  // Table
  if (report.rows.length > 0) {
    const colCount = report.columns.length;
    const pageW = 515; // A4 width - margins
    const colWidths = report.columns.map(() => pageW / colCount);
    // Adjust: make money/number columns narrower
    for (let i = 0; i < colCount; i++) {
      if (report.columns[i].type === "money" || report.columns[i].type === "number") {
        colWidths[i] = 65;
      }
    }
    // Redistribute remaining space to text columns
    const totalFixed = colWidths.reduce((a, b) => a + b, 0);
    const extra = pageW - totalFixed;
    const textCols = colWidths.filter((_, i) => report.columns[i].type === "text");
    const perText = extra / Math.max(textCols.length, 1);
    for (let i = 0; i < colCount; i++) {
      if (report.columns[i].type === "text") colWidths[i] += perText;
    }

    // Header
    const headerH = 20;
    let x = 40;
    pdf.rect(x, pdf.y, pageW, headerH).fill("#2E7D32");
    pdf.fillColor("#FFF").fontSize(7).font("Helvetica-Bold");
    for (let i = 0; i < colCount; i++) {
      pdf.text(report.columns[i].label, x + 3, pdf.y + 5, { width: colWidths[i] - 6, align: "left" });
      x += colWidths[i];
    }
    pdf.y += headerH;
    pdf.font("Helvetica").fillColor("#000");

    // Rows
    const rowH = 18;
    for (let ri = 0; ri < report.rows.length; ri++) {
      const row = report.rows[ri];
      if (pdf.y + rowH > 780) {
        pdf.addPage();
        pdf.y = 40;
      }
      const bg = ri % 2 === 0 ? "#FFFFFF" : "#FAFAFA";
      x = 40;
      pdf.rect(40, pdf.y, pageW, rowH).fill(bg);
      pdf.fillColor("#333").fontSize(7);
      for (let ci = 0; ci < colCount; ci++) {
        const val = formatPdfCell(row, report.columns[ci]);
        pdf.text(val, x + 3, pdf.y + 4, { width: colWidths[ci] - 6, align: "left" });
        x += colWidths[ci];
      }
      pdf.y += rowH;
    }

    // Totals
    const totalKeys = Object.keys(report.totals);
    if (totalKeys.length > 0) {
      if (pdf.y + rowH > 780) { pdf.addPage(); pdf.y = 40; }
      x = 40;
      pdf.rect(40, pdf.y, pageW, rowH).fill("#F1F8E9");
      pdf.fillColor("#1B5E20").fontSize(7).font("Helvetica-Bold");
      pdf.text("TOTALS", 43, pdf.y + 4, { width: colWidths[0] - 6 });
      x += colWidths[0];
      for (let ci = 1; ci < colCount; ci++) {
        const v = report.totals[report.columns[ci].key];
        const val = v !== undefined ? formatMoney(v) : "";
        pdf.text(val, x + 3, pdf.y + 4, { width: colWidths[ci] - 6 });
        x += colWidths[ci];
      }
      pdf.y += rowH;
      pdf.font("Helvetica").fillColor("#000");
    }
  } else {
    pdf.moveDown(1).fontSize(10).fillColor("#999").text("No data found for the selected filters.", { align: "center" });
  }

  // Footer — page numbers
  const range = pdf.bufferedPageRange();
  for (let i = range.start; i < range.start + range.count; i++) {
    pdf.switchToPage(i);
    pdf.fontSize(7).fillColor("#999").text(
      `Onion Facility Center  •  Page ${i - range.start + 1} of ${range.count}`,
      40, 780, { align: "center", width: 515 }
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
  if (col.type === "money") return formatMoney(Number(v));
  if (col.type === "date") {
    const dt = new Date(String(v));
    return dt.toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" });
  }
  return String(v);
}
