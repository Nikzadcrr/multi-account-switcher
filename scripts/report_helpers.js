// report_helpers.js — RTL Persian helpers + R1 cover (adapted RTL) for docx-js
const {
  Paragraph, TextRun, Table, TableRow, TableCell, AlignmentType, BorderStyle,
  ShadingType, WidthType, TableLayoutType, HeadingLevel,
} = require("docx");

// ─── Palette: Cool + Heavy + Active (tech report) ───
const P = {
  primary: "16233A", body: "1C2A3D", secondary: "5B6B7D",
  accent: "2F6FED", surface: "F5F7FA",
  cover: {
    bg: "16233A", titleColor: "FFFFFF", subtitleColor: "B7C4D8",
    metaColor: "D7DEE9", footerColor: "8FA0B5", accent: "4C8DFF",
  },
};

const FA = { ascii: "Tahoma", hAnsi: "Tahoma", cs: "Tahoma", eastAsia: "Tahoma" };
const MONO = { ascii: "Consolas", hAnsi: "Consolas", cs: "Consolas" };

const allNoBorders = {
  top: { style: BorderStyle.NONE }, bottom: { style: BorderStyle.NONE },
  left: { style: BorderStyle.NONE }, right: { style: BorderStyle.NONE },
  insideHorizontal: { style: BorderStyle.NONE }, insideVertical: { style: BorderStyle.NONE },
};
const noBorders = {
  top: { style: BorderStyle.NONE }, bottom: { style: BorderStyle.NONE },
  left: { style: BorderStyle.NONE }, right: { style: BorderStyle.NONE },
};

// Persian run (RTL)
function fa(text, opts = {}) {
  return new TextRun({ text, rightToLeft: true, font: FA, ...opts });
}
// Latin/URL run (LTR, inside RTL paragraphs)
function en(text, opts = {}) {
  return new TextRun({ text, font: FA, ...opts });
}

// Persian body paragraph — bidi + justified
function bodyP(children, opts = {}) {
  const runs = typeof children === "string" ? [fa(children)] : children;
  return new Paragraph({
    bidirectional: true,
    alignment: AlignmentType.JUSTIFIED,
    spacing: { line: 312, after: 120, ...(opts.spacing || {}) },
    ...opts, children: runs,
  });
}

// Headings (bidi → start = right side visually)
function h1(text) {
  return new Paragraph({
    heading: HeadingLevel.HEADING_1, bidirectional: true,
    alignment: AlignmentType.START,
    spacing: { before: 360, after: 160, line: 312 },
    children: [fa(text, { bold: true, size: 30, color: P.primary })],
  });
}
function h2(text) {
  return new Paragraph({
    heading: HeadingLevel.HEADING_2, bidirectional: true,
    alignment: AlignmentType.START,
    spacing: { before: 240, after: 120, line: 312 },
    children: [fa(text, { bold: true, size: 26, color: P.primary })],
  });
}

// LTR code block paragraph (Consolas, shaded)
function codeP(line, opts = {}) {
  return new Paragraph({
    alignment: AlignmentType.LEFT,
    spacing: { line: 276, after: 0, before: 0 },
    shading: { type: ShadingType.CLEAR, fill: "F6F8FA" },
    indent: { left: 200, right: 200 },
    ...(opts.para || {}),
    children: [new TextRun({
      text: line.length ? line : " ",
      font: MONO, size: 17, color: "24292F",
    })],
  });
}
function codeBlock(lines) {
  const paras = lines.map((l) => codeP(l));
  return paras;
}

// Table title (keepNext)
function tableTitle(text) {
  return new Paragraph({
    bidirectional: true, keepNext: true,
    alignment: AlignmentType.START,
    spacing: { before: 200, after: 80, line: 312 },
    children: [fa(text, { bold: true, size: 21, color: P.secondary })],
  });
}

// RTL data table — first column appears rightmost
function rtlTable(headerCells, rows, widths) {
  const mk = (text, isHeader, w, i) => new TableCell({
    width: { size: w[i], type: WidthType.PERCENTAGE },
    margins: { top: 80, bottom: 80, left: 120, right: 120 },
    shading: isHeader ? { type: ShadingType.CLEAR, fill: "E8EFFB" } : undefined,
    children: [new Paragraph({
      bidirectional: true,
      alignment: AlignmentType.START,
      spacing: { line: 288 },
      children: (typeof text === "string" ? [fa(text, {
        bold: isHeader, size: 19,
        color: isHeader ? P.primary : P.body,
      })] : text),
    })],
  });
  return new Table({
    visuallyRightToLeft: true,
    width: { size: 100, type: WidthType.PERCENTAGE },
    layout: TableLayoutType.FIXED,
    borders: {
      top: { style: BorderStyle.SINGLE, size: 4, color: "9AA6B2" },
      bottom: { style: BorderStyle.SINGLE, size: 4, color: "9AA6B2" },
      left: { style: BorderStyle.NONE }, right: { style: BorderStyle.NONE },
      insideHorizontal: { style: BorderStyle.SINGLE, size: 2, color: "D5DCE5" },
      insideVertical: { style: BorderStyle.SINGLE, size: 2, color: "E2E8F0" },
    },
    rows: [
      new TableRow({ tableHeader: true, cantSplit: true, children: headerCells.map((t, i) => mk(t, true, widths, i)) }),
      ...rows.map((r) => new TableRow({ cantSplit: true, children: r.map((t, i) => mk(t, false, widths, i)) })),
    ],
  });
}

// Cell content helper for mixed runs (URL etc.)
function cellRuns(parts) {
  return parts.map((p) => (p.ltr
    ? new TextRun({ text: p.text, font: MONO, size: 16, color: p.color || P.body })
    : fa(p.text, { size: 19, color: p.color || P.body, bold: !!p.bold })));
}

// ─── Cover title layout (Persian-aware width estimate) ───
function splitTitleLines(title, charsPerLine) {
  if (title.length <= charsPerLine) return [title];
  const breakAfter = new Set([..."،؛:!؟", ..."-_—–·/", ..." \t"]);
  const lines = [];
  let remaining = title;
  while (remaining.length > charsPerLine) {
    let breakAt = -1;
    for (let i = charsPerLine; i >= Math.floor(charsPerLine * 0.6); i--) {
      if (i < remaining.length && breakAfter.has(remaining[i - 1])) { breakAt = i; break; }
    }
    if (breakAt === -1) {
      const limit = Math.min(remaining.length, Math.ceil(charsPerLine * 1.3));
      for (let i = charsPerLine + 1; i < limit; i++) {
        if (breakAfter.has(remaining[i - 1])) { breakAt = i; break; }
      }
    }
    if (breakAt === -1) breakAt = charsPerLine;
    lines.push(remaining.slice(0, breakAt).trim());
    remaining = remaining.slice(breakAt).trim();
  }
  if (remaining) lines.push(remaining);
  if (lines.length > 1 && lines[lines.length - 1].length <= 2) {
    const last = lines.pop();
    lines[lines.length - 1] += " " + last;
  }
  return lines;
}

function calcTitleLayout(title, maxWidthTwips, preferredPt = 40, minPt = 24) {
  // Persian/Arabic glyphs ≈ pt*13 twips avg in Tahoma; Latin ≈ pt*11
  const charWidth = (pt) => pt * 13;
  const charsPerLine = (pt) => Math.floor(maxWidthTwips / charWidth(pt));
  let titlePt = preferredPt, lines;
  while (titlePt >= minPt) {
    const cpl = charsPerLine(titlePt);
    if (cpl < 2) { titlePt -= 2; continue; }
    lines = splitTitleLines(title, cpl);
    if (lines.length <= 3) break;
    titlePt -= 2;
  }
  if (!lines || lines.length > 3) {
    lines = splitTitleLines(title, charsPerLine(minPt));
    titlePt = minPt;
  }
  return { titlePt, titleLines: lines };
}

function calcCoverSpacing(params) {
  const { titleLineCount = 1, titlePt = 36, hasSubtitle = false, hasEnglishLabel = false,
    metaLineCount = 0, fixedHeight = 800, pageHeight = 16838, marginTop = 0, marginBottom = 0 } = params;
  const SAFETY = 1200;
  const usableHeight = pageHeight - marginTop - marginBottom - SAFETY;
  const titleHeight = titleLineCount * (titlePt * 23 + 200);
  const subtitleHeight = hasSubtitle ? (12 * 23 + 600) : 0;
  const englishLabelHeight = hasEnglishLabel ? (9 * 23 + 600) : 0;
  const metaHeight = metaLineCount * (10 * 23 + 100);
  const implicitParaHeight = 3 * 300;
  const contentHeight = titleHeight + subtitleHeight + englishLabelHeight + metaHeight + fixedHeight + implicitParaHeight;
  const remainingSpace = usableHeight - contentHeight;
  const safeRemaining = Math.max(remainingSpace, 400);
  const FOOTER_MIN = 800;
  const rawTop = Math.floor(safeRemaining * 0.45);
  const rawBottom = Math.floor(safeRemaining * 0.45);
  const bottomSpacing = Math.max(rawBottom, FOOTER_MIN);
  const topSpacing = Math.max(rawTop - Math.max(0, FOOTER_MIN - rawBottom), 400);
  const midSpacing = Math.max(safeRemaining - topSpacing - bottomSpacing, 0);
  return { topSpacing, midSpacing, bottomSpacing };
}

// ─── Cover R1 — RTL adaptation (right-aligned, accent bar on right) ───
function buildCoverR1RTL(config) {
  const C = config.palette;
  const padR = 1200, padL = 800;
  const availableWidth = 11906 - padR - padL - 300;
  const { titlePt, titleLines } = calcTitleLayout(config.title, availableWidth, 40, 24);
  const titleSize = titlePt * 2;
  const spacing = calcCoverSpacing({
    titleLineCount: titleLines.length, titlePt,
    hasSubtitle: !!config.subtitle, hasEnglishLabel: !!config.englishLabel,
    metaLineCount: (config.metaLines || []).length, fixedHeight: 400,
  });
  const accentRight = { style: BorderStyle.SINGLE, size: 8, color: C.accent, space: 12 };
  const children = [];

  children.push(new Paragraph({ spacing: { before: spacing.topSpacing } }));

  if (config.englishLabel) {
    children.push(new Paragraph({
      alignment: AlignmentType.START, bidirectional: true,
      indent: { right: padR, left: padL }, spacing: { after: 500 },
      border: { bottom: { style: BorderStyle.SINGLE, size: 6, color: C.accent, space: 8 } },
      children: [new TextRun({
        text: config.englishLabel.split("").join(" "),
        size: 18, color: C.accent, font: FA, characterSpacing: 40,
      })],
    }));
  }

  for (let i = 0; i < titleLines.length; i++) {
    children.push(new Paragraph({
      bidirectional: true, alignment: AlignmentType.START,
      indent: { right: padR },
      spacing: { after: i < titleLines.length - 1 ? 100 : 300, line: Math.ceil(titlePt * 23), lineRule: "atLeast" },
      children: [fa(titleLines[i], { size: titleSize, bold: true, color: C.titleColor })],
    }));
  }

  if (config.subtitle) {
    children.push(new Paragraph({
      bidirectional: true, alignment: AlignmentType.START,
      indent: { right: padR }, spacing: { after: 800, line: 400, lineRule: "atLeast" },
      children: [fa(config.subtitle, { size: 24, color: C.subtitleColor })],
    }));
  }

  for (const line of (config.metaLines || [])) {
    children.push(new Paragraph({
      bidirectional: true, alignment: AlignmentType.START,
      indent: { right: padR + 200 }, spacing: { after: 80, line: 312 },
      border: { right: accentRight },
      children: Array.isArray(line)
        ? line
        : [fa(line, { size: 22, color: C.metaColor })],
    }));
  }

  children.push(new Paragraph({ spacing: { before: spacing.bottomSpacing } }));

  children.push(new Paragraph({
    bidirectional: true, alignment: AlignmentType.START,
    indent: { right: padR, left: padL },
    border: { top: { style: BorderStyle.SINGLE, size: 2, color: C.accent, space: 8 } },
    spacing: { before: 200 },
    children: [
      fa(config.footerRight || "", { size: 16, color: C.footerColor }),
      new TextRun({ text: "                                        ", size: 16 }),
      new TextRun({ text: config.footerLeft || "", size: 16, color: C.footerColor, font: FA }),
    ],
  }));

  return [new Table({
    width: { size: 100, type: WidthType.PERCENTAGE },
    layout: TableLayoutType.FIXED,
    borders: allNoBorders,
    rows: [new TableRow({
      height: { value: 16838, rule: "exact" },
      children: [new TableCell({
        shading: { type: ShadingType.CLEAR, fill: C.bg },
        borders: noBorders,
        children,
      })],
    })],
  })];
}

module.exports = {
  P, FA, MONO, allNoBorders, noBorders,
  fa, en, bodyP, h1, h2, codeBlock, tableTitle, rtlTable, cellRuns,
  buildCoverR1RTL, calcTitleLayout, calcCoverSpacing,
};
