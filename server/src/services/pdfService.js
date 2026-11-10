const PDFDocument = require("pdfkit");

// WHY PDFKit over Puppeteer/html-pdf?
// PDFKit: pure JS, no headless Chrome, ~4MB bundle, zero system dependencies.
// Puppeteer: 200MB Chromium, needs display server on Linux — overkill for text reports.
const generateDetectionReport = (result) =>
  new Promise((resolve, reject) => {
    const doc = new PDFDocument({ margin: 50, size: "A4" });
    const chunks = [];
    doc.on("data", c => chunks.push(c));
    doc.on("end",  () => resolve(Buffer.concat(chunks)));
    doc.on("error", reject);

    // Header
    doc.fontSize(22).font("Helvetica-Bold").fillColor("#1a1a2e")
       .text("DeepGuard — Analysis & Safety Report", { align: "center" });
    doc.moveDown(0.5);
    doc.fontSize(10).font("Helvetica").fillColor("#64748b")
       .text(`Generated: ${new Date().toLocaleString()} · Automated AI Assessment`, { align: "center" });
    doc.moveDown();

    // Verdict banner
    const isNoFace = result.faceDetected === false || result.verdict === "UNCERTAIN";
    const isF = result.isFake;
    const bannerBg = isNoFace ? "#fffbeb" : (isF ? "#fff1f1" : "#f0fff4");
    const bannerBorder = isNoFace ? "#fde68a" : (isF ? "#fca5a5" : "#86efac");
    const bannerText = isNoFace ? "#d97706" : (isF ? "#dc2626" : "#16a34a");

    const bannerTitle = isNoFace
      ? "INSUFFICIENT DATA"
      : isF
      ? "POTENTIAL MANIPULATION DETECTED"
      : "NO STRONG INDICATORS DETECTED";

    const rawProb = typeof result.rawFakeProbability === "number"
      ? (result.rawFakeProbability * 100).toFixed(1)
      : (result.isFake ? result.confidencePercent : 100 - (result.confidencePercent || 0))?.toFixed(1);

    const isInsufficient = result.errorMessage?.includes("few") || (result.faceDetected === true && isNoFace);
    const bannerSub = isNoFace
      ? (result.errorMessage || (result.faceDetected === false ? "Unable to analyze — no human face found in media" : "Unable to analyze — insufficient facial frames for sequence evaluation"))
      : `Manipulation Score P(Fake): ${rawProb}% (Uncalibrated Model Output) · Threshold: 0.50`;

    doc.roundedRect(50, doc.y, 495, 60, 8)
       .fill(bannerBg).stroke(bannerBorder);
    const bannerY = doc.y - 55;
    doc.fontSize(16).font("Helvetica-Bold")
       .fillColor(bannerText)
       .text(bannerTitle, 70, bannerY + 12);
    doc.fontSize(10).font("Helvetica").fillColor("#374151")
       .text(bannerSub, 70, bannerY + 36);
    doc.moveDown(4);

    const confVal = typeof result.confidencePercent === "number"
      ? result.confidencePercent
      : (isF ? parseFloat(rawProb) : 100 - parseFloat(rawProb));

    // Details table
    const details = [
      ["File",                      result.originalFilename],
      ["Media Type",                result.mediaType?.toUpperCase()],
      ["Model Identifier",          result.modelVersion || "efficientnet-b4-epoch34"],
      ["Face Detected",             result.faceDetected ? "Yes" : "No"],
      ["Manipulation Score P(Fake)",isNoFace ? "N/A" : `${rawProb}% (uncalibrated)`],
      ["Predicted Class Conformity",isNoFace ? "N/A" : `${confVal.toFixed(1)}% (score for ${result.verdict || (isF ? "FAKE" : "REAL")})`],
      ["Internal Classification",   isNoFace ? "UNCERTAIN" : (result.verdict || (isF ? "FAKE" : "REAL"))],
      ["Aggregation Method",        result.mediaType === "video" ? "Quadratic Peak A0 (0.6*wm + 0.4*pk, θ=0.50)" : "Single-Frame Direct"],
      ["Suspicious Regions",        `${result.regionCount || 0} detected`],
      ["Inference Latency",         `${result.processingTimings?.inferenceMs || 0}ms`],
      ["Total Processing Time",     `${result.processingTimings?.totalMs || 0}ms`],
      ["Human Review Status",       "Qualified human verification recommended"],
      ["Analysis ID",               result._id?.toString()],
    ];

    doc.fontSize(14).font("Helvetica-Bold").fillColor("#1e293b").text("Analysis Details");
    doc.moveDown(0.3);
    details.forEach(([label, value]) => {
      doc.fontSize(10).font("Helvetica-Bold").fillColor("#64748b").text(label + ":", { continued: true });
      doc.font("Helvetica").fillColor("#1e293b").text("  " + (value || "—"));
    });

    if (result.suspiciousRegions?.length) {
      doc.moveDown();
      doc.fontSize(14).font("Helvetica-Bold").fillColor("#1e293b").text("Attribution Highlights");
      doc.moveDown(0.3);
      result.suspiciousRegions.slice(0, 5).forEach((r, i) => {
        doc.fontSize(10).font("Helvetica").fillColor("#374151")
           .text(`${i+1}. Region @ (${r.x},${r.y}) ${r.width}×${r.height}px — relative Grad-CAM intensity ${r.intensity} (${r.suspicionLevel?.toUpperCase()} attribution toward manipulation logit)`);
      });
    }

    doc.moveDown(2);
    doc.roundedRect(50, doc.y, 495, 55, 6).fill("#f8fafc").stroke("#e2e8f0");
    const discY = doc.y - 48;
    doc.fontSize(8).font("Helvetica-Bold").fillColor("#475569")
       .text("IMPORTANT FORENSIC NOTICE & LIMITATION DISCLOSURE", 60, discY);
    doc.fontSize(7.5).font("Helvetica").fillColor("#64748b")
       .text("This report was generated by an automated machine learning system and does not constitute legally binding or definitive forensic proof. Deepfake detection models can exhibit false alarms on compression artifacts, motion blur, and unfamiliar lighting. Consequential decisions require independent qualified expert review.", 60, discY + 14, { width: 475 });

    doc.moveDown(3);
    doc.fontSize(8).fillColor("#94a3b8")
       .text("DeepGuard AI Detection Platform — Responsible AI Guardrails", { align: "center" });

    doc.end();
  });

module.exports = { generateDetectionReport };
