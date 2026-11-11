const PDFDocument = require("pdfkit");

/**
 * DeepGuard AI Media Analysis Report Generator
 * Professional, publication-grade forensic report in A4 portrait format.
 *
 * Implements:
 * - Dynamic vertical layout calculation (zero hardcoded overlapping coordinates)
 * - Two-page overflow support with automatic page numbering
 * - Clean academic / technical typography and high-contrast color hierarchy
 * - Multi-tenant, media-type agnostic formatting (Image, Video, Audio, Uncertain)
 * - Accurate timing display ("Not recorded" for absent timings, genuine values preserved)
 */

// Palette definitions (Tailwind Slate / Emerald / Rose / Amber)
const COLORS = {
  textPrimary:   "#0f172a", // Slate 900
  textSecondary: "#334155", // Slate 700
  textMuted:     "#64748b", // Slate 500
  textLight:     "#94a3b8", // Slate 400
  divider:       "#e2e8f0", // Slate 200
  cardBg:        "#f8fafc", // Slate 50
  cardBorder:    "#cbd5e1", // Slate 300

  // Verdict: FAKE
  fakeText:      "#991b1b", // Red 800
  fakeBg:        "#fef2f2", // Red 50
  fakeBorder:    "#f87171", // Red 400

  // Verdict: REAL
  realText:      "#166534", // Green 800
  realBg:        "#f0fdf4", // Green 50
  realBorder:    "#4ade80", // Green 400

  // Verdict: UNCERTAIN
  uncertainText:  "#92400e", // Amber 800
  uncertainBg:    "#fffbeb", // Amber 50
  uncertainBorder:"#fcd34d", // Amber 300

  accentNavy:    "#1e3a8a", // Blue 900
};

/**
 * Format timing numbers cleanly.
 * Returns "Not recorded" when null/undefined.
 * Preserves genuine 0 or positive numbers.
 */
function formatTiming(ms) {
  if (ms === null || ms === undefined || typeof ms !== "number" || isNaN(ms)) {
    return "Not recorded";
  }
  return `${Math.round(ms)} ms`;
}

/**
 * Check if adding a block of height `neededHeight` will exceed page boundary.
 * If so, creates a new page and resets `y` to top margin.
 */
function ensureSpace(doc, neededHeight, pageBottom = 750, topMargin = 45) {
  if (doc.y + neededHeight > pageBottom) {
    doc.addPage();
    doc.y = topMargin;
    return true;
  }
  return false;
}

/**
 * Generate a professional forensic PDF report for an analysis result.
 * @param {Object} result - DetectionResult document from MongoDB
 * @returns {Promise<Buffer>} - Valid PDF buffer
 */
const generateDetectionReport = (result) =>
  new Promise((resolve, reject) => {
    try {
      const doc = new PDFDocument({
        size: "A4",
        margin: 45,
        bufferPages: true,
        autoFirstPage: true,
      });

      const chunks = [];
      doc.on("data", c => chunks.push(c));
      doc.on("end", () => resolve(Buffer.concat(chunks)));
      doc.on("error", reject);

      const contentWidth = 505.28;
      const left = 45;
      const right = left + contentWidth;

      // Extract and sanitize detection metrics
      const isNoFace = result.faceDetected === false || result.verdict === "UNCERTAIN";
      const isFake = Boolean(result.isFake);
      const verdict = isNoFace ? "UNCERTAIN" : (result.verdict || (isFake ? "FAKE" : "REAL"));

      const rawFakeProb = typeof result.rawFakeProbability === "number"
        ? (result.rawFakeProbability * 100).toFixed(1)
        : (typeof result.manipulationProbability === "number"
            ? (result.manipulationProbability * 100).toFixed(1)
            : (isFake ? result.confidencePercent?.toFixed(1) : (100 - (result.confidencePercent || 0)).toFixed(1)));

      const confPercent = typeof result.confidencePercent === "number"
        ? result.confidencePercent.toFixed(1)
        : (isFake ? rawFakeProb : (100 - parseFloat(rawFakeProb)).toFixed(1));

      // ─────────────────────────────────────────────────────────────
      // 1. HEADER SECTION
      // ─────────────────────────────────────────────────────────────
      doc.y = 45;

      // Brand badge
      doc.fontSize(8).font("Helvetica-Bold").fillColor(COLORS.accentNavy)
         .text("DEEPGUARD FORENSIC AI LABS · RESEARCH DEMONSTRATION", left, doc.y, { characterSpacing: 0.5 });
      doc.moveDown(0.3);

      // Main Document Title
      doc.fontSize(18).font("Helvetica-Bold").fillColor(COLORS.textPrimary)
         .text("AI Media Integrity Assessment Report", left, doc.y);
      doc.moveDown(0.2);

      // Subtitle
      doc.fontSize(8.5).font("Helvetica").fillColor(COLORS.textMuted)
         .text("Automated spatial & temporal deepfake detection with convolutional gradient explainability", left, doc.y);
      doc.moveDown(0.6);

      // Divider line
      doc.strokeColor(COLORS.divider).lineWidth(1)
         .moveTo(left, doc.y).lineTo(right, doc.y).stroke();
      doc.moveDown(0.5);

      // Metadata Bar (Report ID, Generated Date, Classification)
      const metaY = doc.y;
      const colW = contentWidth / 3;

      // Col 1: Report ID
      doc.fontSize(7.5).font("Helvetica-Bold").fillColor(COLORS.textMuted).text("ANALYSIS ID", left, metaY);
      doc.fontSize(8).font("Courier").fillColor(COLORS.textPrimary).text(result._id?.toString() || "—", left, metaY + 11, { width: colW - 10, lineBreak: false, ellipsis: true });

      // Col 2: Timestamp
      const genTime = result.createdAt ? new Date(result.createdAt).toLocaleString("en-US", { timeZoneName: "short" }) : new Date().toLocaleString("en-US", { timeZoneName: "short" });
      doc.fontSize(7.5).font("Helvetica-Bold").fillColor(COLORS.textMuted).text("DATE / TIME GENERATED", left + colW, metaY);
      doc.fontSize(8).font("Helvetica").fillColor(COLORS.textPrimary).text(genTime, left + colW, metaY + 11, { width: colW - 10 });

      // Col 3: System Status
      doc.fontSize(7.5).font("Helvetica-Bold").fillColor(COLORS.textMuted).text("INSPECTION STATUS", left + colW * 2, metaY);
      doc.fontSize(8).font("Helvetica-Bold").fillColor(COLORS.accentNavy).text("COMPLETE · AUTOMATED SCAN", left + colW * 2, metaY + 11, { width: colW - 10 });

      doc.y = metaY + 26;
      doc.moveDown(0.4);

      // ─────────────────────────────────────────────────────────────
      // 2. DETECTION SUMMARY BANNER (VERDICT CARD)
      // ─────────────────────────────────────────────────────────────
      const vText = isNoFace ? COLORS.uncertainText : (isFake ? COLORS.fakeText : COLORS.realText);
      const vBg   = isNoFace ? COLORS.uncertainBg   : (isFake ? COLORS.fakeBg   : COLORS.realBg);
      const vBrd  = isNoFace ? COLORS.uncertainBorder: (isFake ? COLORS.fakeBorder: COLORS.realBorder);

      const bannerTitle = isNoFace
        ? "INSUFFICIENT DATA / UNCERTAIN"
        : (isFake ? "POTENTIAL MANIPULATION DETECTED" : "NO STRONG MANIPULATION INDICATORS DETECTED");

      const bannerDesc = isNoFace
        ? (result.errorMessage || (result.faceDetected === false
            ? "Unable to perform facial classification: No human face detected in media."
            : "Unable to evaluate sequence: Insufficient facial frames extracted for reliable temporal analysis."))
        : (isFake
            ? "The convolutional neural network observed anomalous spatial/temporal facial features consistent with synthetic synthesis or face-swap manipulation."
            : "The analyzed facial sequence exhibits structural spatial coherence and facial landmark distributions consistent with authentic non-manipulated media.");

      // Calculate required banner height dynamically
      doc.fontSize(13).font("Helvetica-Bold");
      const titleHeight = doc.heightOfString(bannerTitle, { width: contentWidth - 32 });
      doc.fontSize(8).font("Helvetica");
      const descHeight = doc.heightOfString(bannerDesc, { width: contentWidth - 32 });
      
      const metricsBoxHeight = 40;
      const bannerPadding = 12;
      const bannerTotalHeight = bannerPadding * 2 + titleHeight + 4 + descHeight + 8 + metricsBoxHeight;

      ensureSpace(doc, bannerTotalHeight);

      const bannerStartY = doc.y;

      // Draw background card
      doc.roundedRect(left, bannerStartY, contentWidth, bannerTotalHeight, 5)
         .fillColor(vBg).fill()
         .lineWidth(1.2).strokeColor(vBrd).stroke();

      // Render Title
      let curY = bannerStartY + bannerPadding;
      doc.fontSize(12.5).font("Helvetica-Bold").fillColor(vText)
         .text(bannerTitle, left + 16, curY, { width: contentWidth - 32 });
      curY += titleHeight + 3;

      // Render Description
      doc.fontSize(8).font("Helvetica").fillColor(COLORS.textSecondary)
         .text(bannerDesc, left + 16, curY, { width: contentWidth - 32 });
      curY += descHeight + 8;

      // Render 3 Inner Stat Columns inside Banner
      const statColW = (contentWidth - 32) / 3;
      
      // Stat 1: P(Fake)
      doc.fontSize(7).font("Helvetica-Bold").fillColor(COLORS.textMuted).text("MANIPULATION SCORE P(FAKE)", left + 16, curY);
      const probDisplay = isNoFace ? "N/A" : `${rawFakeProb}%`;
      doc.fontSize(12).font("Helvetica-Bold").fillColor(vText).text(probDisplay, left + 16, curY + 10);
      doc.fontSize(6.8).font("Helvetica").fillColor(COLORS.textMuted).text("Uncalibrated model output", left + 16, curY + 25);

      // Stat 2: Threshold
      doc.fontSize(7).font("Helvetica-Bold").fillColor(COLORS.textMuted).text("DECISION THRESHOLD", left + 16 + statColW, curY);
      doc.fontSize(12).font("Helvetica-Bold").fillColor(COLORS.textPrimary).text("0.50 (Binary cutoff)", left + 16 + statColW, curY + 10);
      doc.fontSize(6.8).font("Helvetica").fillColor(COLORS.textMuted).text("Standard benchmark threshold", left + 16 + statColW, curY + 25);

      // Stat 3: Media Type & Verdict
      doc.fontSize(7).font("Helvetica-Bold").fillColor(COLORS.textMuted).text("MEDIA CLASSIFICATION", left + 16 + statColW * 2, curY);
      const mediaVerdictStr = `${(result.mediaType || "IMAGE").toUpperCase()} · ${verdict}`;
      doc.fontSize(12).font("Helvetica-Bold").fillColor(vText).text(mediaVerdictStr, left + 16 + statColW * 2, curY + 10);
      doc.fontSize(6.8).font("Helvetica").fillColor(COLORS.textMuted).text(`Class Conformity: ${confPercent}%`, left + 16 + statColW * 2, curY + 25);

      // Set doc.y safely below banner
      doc.y = bannerStartY + bannerTotalHeight + 12;

      // ─────────────────────────────────────────────────────────────
      // 3. ANALYSIS SPECIFICATIONS (STRUCTURED DETAILS GRID)
      // ─────────────────────────────────────────────────────────────
      ensureSpace(doc, 130);

      doc.fontSize(10.5).font("Helvetica-Bold").fillColor(COLORS.textPrimary)
         .text("1. Analysis & Model Specifications", left, doc.y);
      doc.moveDown(0.3);

      // Determine video peak string if video has peak info
      let frameInfoStr = "1 frame (isolated face crop)";
      if (result.mediaType === "video") {
        const fCount = result.framesAnalyzed || (result.frameTimeline?.length) || "Adaptive";
        if (typeof result.peakScore === "number") {
          frameInfoStr = `${fCount} frames (Peak: ${(result.peakScore * 100).toFixed(1)}%${result.peakTimestampSec != null ? ` @ ${result.peakTimestampSec}s` : ""})`;
        } else {
          frameInfoStr = `${fCount} frames analyzed`;
        }
      }

      // Prepare table rows (using standard ASCII to ensure 100% font fidelity)
      const tableRows = [
        ["Original Media File", result.originalFilename || "—", "Media Type", (result.mediaType || "image").toUpperCase()],
        ["Neural Network", result.modelVersion || "EfficientNet-B4 (v1.0.0)", "Face Detection", result.faceDetected ? "Verified (Human Face Present)" : "No Face Found"],
        ["Inference Latency", formatTiming(result.processingTimings?.inferenceMs), "Total Execution Time", formatTiming(result.processingTimings?.totalMs)],
        ["Aggregation Strategy", result.mediaType === "video" ? "Quadratic Peak A0 (0.6*wm + 0.4*pk, cutoff=0.50)" : "Single-Frame Spatial Evaluation", "Analyzed Sequence", frameInfoStr],
        ["Saliency Regions", `${result.regionCount ?? (result.suspiciousRegions?.length || 0)} regions identified`, "Human Review Status", "Qualified human review recommended"],
      ];

      const cellW1 = 105;
      const cellW2 = 145;
      const cellW3 = 105;
      const cellW4 = 150;

      tableRows.forEach((row, idx) => {
        // Calculate dynamic height based on values to prevent text clipping
        doc.fontSize(7.5).font("Helvetica");
        const val1H = doc.heightOfString(row[1], { width: cellW2 - 8 });
        const val2H = doc.heightOfString(row[3], { width: cellW4 - 8 });
        const rowHeight = Math.max(20, Math.max(val1H, val2H) + 8);

        const rowY = doc.y;
        const isEven = idx % 2 === 0;

        // Row background
        if (isEven) {
          doc.rect(left, rowY, contentWidth, rowHeight).fillColor(COLORS.cardBg).fill();
        }
        doc.rect(left, rowY, contentWidth, rowHeight).lineWidth(0.5).strokeColor(COLORS.divider).stroke();

        // Cell 1: Label
        doc.fontSize(7.2).font("Helvetica-Bold").fillColor(COLORS.textMuted)
           .text(row[0], left + 6, rowY + 5.5, { width: cellW1 - 8 });

        // Cell 2: Value
        doc.fontSize(7.5).font("Helvetica").fillColor(COLORS.textPrimary)
           .text(row[1], left + cellW1 + 4, rowY + 5.5, { width: cellW2 - 8 });

        // Cell 3: Label
        doc.fontSize(7.2).font("Helvetica-Bold").fillColor(COLORS.textMuted)
           .text(row[2], left + cellW1 + cellW2 + 6, rowY + 5.5, { width: cellW3 - 8 });

        // Cell 4: Value
        doc.fontSize(7.5).font("Helvetica").fillColor(COLORS.textPrimary)
           .text(row[3], left + cellW1 + cellW2 + cellW3 + 4, rowY + 5.5, { width: cellW4 - 8 });

        doc.y = rowY + rowHeight;
      });

      doc.y += 12;

      // ─────────────────────────────────────────────────────────────
      // 4. EXPLAINABILITY & ATTRIBUTION SUMMARY (GRAD-CAM)
      // ─────────────────────────────────────────────────────────────
      const hasRegions = Array.isArray(result.suspiciousRegions) && result.suspiciousRegions.length > 0;
      const explainSectionHeight = hasRegions ? 105 : 55;
      ensureSpace(doc, explainSectionHeight);

      doc.fontSize(10.5).font("Helvetica-Bold").fillColor(COLORS.textPrimary)
         .text("2. Spatial Explainability & Grad-CAM Attribution", left, doc.y);
      doc.moveDown(0.25);

      doc.fontSize(7.8).font("Helvetica").fillColor(COLORS.textSecondary)
         .text("Grad-CAM highlights regions of the input that exerted the strongest influence on the neural network's internal prediction. Highlighted areas indicate convolutional saliency and do NOT constitute proof of pixel-level manipulation.", left, doc.y, { width: contentWidth });
      doc.moveDown(0.4);

      if (hasRegions) {
        // Draw regions table
        const regHeaderY = doc.y;
        doc.rect(left, regHeaderY, contentWidth, 16).fillColor("#f1f5f9").fill();
        doc.rect(left, regHeaderY, contentWidth, 16).lineWidth(0.5).strokeColor(COLORS.divider).stroke();

        doc.fontSize(7.2).font("Helvetica-Bold").fillColor(COLORS.textMuted);
        doc.text("#", left + 8, regHeaderY + 4.5);
        doc.text("BOUNDING BOX (X, Y, W, H)", left + 30, regHeaderY + 4.5);
        doc.text("GRAD-CAM INTENSITY", left + 195, regHeaderY + 4.5);
        doc.text("ATTRIBUTION LEVEL", left + 320, regHeaderY + 4.5);
        doc.text("NOTES", left + 420, regHeaderY + 4.5);

        doc.y = regHeaderY + 16;

        result.suspiciousRegions.slice(0, 4).forEach((r, idx) => {
          const rY = doc.y;
          const rHeight = 16;
          doc.rect(left, rY, contentWidth, rHeight).lineWidth(0.5).strokeColor(COLORS.divider).stroke();

          const levelColor = r.suspicionLevel === "high" ? COLORS.fakeText : (r.suspicionLevel === "medium" ? COLORS.uncertainText : COLORS.realText);

          doc.fontSize(7.5).font("Helvetica-Bold").fillColor(COLORS.textPrimary).text(`${idx + 1}`, left + 8, rY + 4);
          doc.fontSize(7.5).font("Courier").fillColor(COLORS.textSecondary).text(`(${r.x}, ${r.y}) ${r.width}x${r.height} px`, left + 30, rY + 4);
          doc.fontSize(7.5).font("Helvetica").fillColor(COLORS.textPrimary).text(typeof r.intensity === "number" ? r.intensity.toFixed(2) : String(r.intensity || "—"), left + 195, rY + 4);
          doc.fontSize(7.5).font("Helvetica-Bold").fillColor(levelColor).text((r.suspicionLevel || "MODERATE").toUpperCase(), left + 320, rY + 4);
          doc.fontSize(7.2).font("Helvetica").fillColor(COLORS.textMuted).text("CNN Saliency Focus", left + 420, rY + 4);

          doc.y = rY + rHeight;
        });
      } else {
        const emptyY = doc.y;
        doc.roundedRect(left, emptyY, contentWidth, 24, 4).fillColor(COLORS.cardBg).fill().lineWidth(0.5).strokeColor(COLORS.cardBorder).stroke();
        doc.fontSize(7.5).font("Helvetica-Oblique").fillColor(COLORS.textMuted)
           .text(isNoFace ? "No facial saliency map available (no human face detected)." : "No localized high-saliency manipulation clusters isolated.", left + 12, emptyY + 7);
        doc.y = emptyY + 24;
      }

      doc.y += 12;

      // ─────────────────────────────────────────────────────────────
      // 5. RESPONSIBLE AI NOTICE & FORENSIC LIMITATION DISCLOSURE
      // ─────────────────────────────────────────────────────────────
      const disclaimerHeight = 65;
      ensureSpace(doc, disclaimerHeight);

      const discBoxY = doc.y;

      // Left accent bar + container
      doc.roundedRect(left, discBoxY, contentWidth, disclaimerHeight, 4)
         .fillColor(COLORS.cardBg).fill()
         .lineWidth(1).strokeColor(COLORS.divider).stroke();

      // Left accent strip
      doc.rect(left, discBoxY, 4, disclaimerHeight).fillColor(COLORS.accentNavy).fill();

      let dTextY = discBoxY + 7;
      doc.fontSize(7.5).font("Helvetica-Bold").fillColor(COLORS.textPrimary)
         .text("IMPORTANT FORENSIC NOTICE & RESPONSIBLE USE LIMITATIONS", left + 12, dTextY);
      dTextY += 10;

      const disclaimerParagraphs = [
        "• Probabilistic Assessment: Automated deepfake detection models generate statistical estimates based on pattern recognition. Predictions do NOT constitute legally admissible forensic proof or certified ground truth.",
        "• Artifact Sensitivity: Performance may degrade on highly compressed video (H.264/H.265 compression artifacts), motion blur, extreme facial angles, low resolution, or unconventional lighting conditions.",
        "• Mandatory Human Oversight: Consequential determinations (legal, journalistic, personnel, or security) must NOT rely exclusively on this automated score and require independent review by qualified human forensic experts.",
      ];

      doc.fontSize(6.8).font("Helvetica").fillColor(COLORS.textSecondary);
      disclaimerParagraphs.forEach(p => {
        doc.text(p, left + 12, dTextY, { width: contentWidth - 24, lineGap: 1 });
        dTextY = doc.y + 1.5;
      });

      // ─────────────────────────────────────────────────────────────
      // 6. GLOBAL HEADER & FOOTER ON ALL BUFFERED PAGES
      // ─────────────────────────────────────────────────────────────
      const range = doc.bufferedPageRange();
      for (let i = range.start; i < range.start + range.count; i++) {
        doc.switchToPage(i);

        // Temporarily clear bottom margin so footer text never triggers auto page add
        const oldBottom = doc.page.margins.bottom;
        doc.page.margins.bottom = 0;

        // Footer Divider Line
        const footerY = 805;
        doc.strokeColor(COLORS.divider).lineWidth(0.5)
           .moveTo(left, footerY).lineTo(right, footerY).stroke();

        // Footer Text
        doc.fontSize(7).font("Helvetica").fillColor(COLORS.textLight)
           .text("DeepGuard AI Platform · Academic & Research Demonstration · Non-Cryptographically Signed", left, footerY + 6, { width: 350, lineBreak: false });

        doc.fontSize(7).font("Helvetica-Bold").fillColor(COLORS.textMuted)
           .text(`Page ${i + 1} of ${range.count}`, right - 80, footerY + 6, { width: 80, align: "right", lineBreak: false });

        doc.page.margins.bottom = oldBottom;
      }

      doc.end();
    } catch (err) {
      reject(err);
    }
  });

module.exports = { generateDetectionReport };
