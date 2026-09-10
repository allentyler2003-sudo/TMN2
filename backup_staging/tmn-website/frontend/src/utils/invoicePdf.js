import { jsPDF } from "jspdf";

const money = (n) =>
  `£${Number(n || 0).toLocaleString("en-GB", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

async function logoBase64() {
  const res = await fetch("/logo-invoice.png");
  const blob = await res.blob();
  return new Promise((resolve) => {
    const reader = new FileReader();
    reader.onloadend = () => resolve(reader.result);
    reader.readAsDataURL(blob);
  });
}

const day = (value) => {
  if (!value) return "—";
  const d = new Date(`${value}T00:00:00`);
  return isNaN(d)
    ? new Date(value).toLocaleDateString("en-GB")
    : d.toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" });
};

const STATUS_LABEL = { paid: "PAID", sent: "DUE", draft: "DRAFT" };

/* Fully detailed professional A4 invoice with the TMN logo. */
async function buildInvoiceDoc(invoice, customerName, customerEmail, customerAddress) {
  const doc = new jsPDF({ unit: "pt", format: "a4" });
  const W = 595; // A4 @72dpi
  const M = 44; // margin

  /* ---------- letterhead ---------- */
  doc.setFillColor(10, 10, 10);
  doc.rect(0, 0, W, 118, "F");
  try {
    doc.addImage(await logoBase64(), "PNG", M, 26, 66, 66);
  } catch (e) {
    /* logo is decorative — skip on failure */
  }
  doc.setTextColor(245, 244, 240);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(19);
  doc.text("TMN Decorating & Maintenance", M + 82, 52);
  doc.setFont("helvetica", "normal");
  doc.setFontSize(9.5);
  doc.setTextColor(190, 190, 190);
  doc.text("Painting · Decorating · Property Maintenance — Plymouth, UK", M + 82, 71);
  doc.text("info@tmndecorating.co.uk   ·   07736 325643", M + 82, 86);
  doc.setDrawColor(198, 165, 92);
  doc.setLineWidth(2.4);
  doc.line(0, 118, W, 118); // gold brand rule

  /* ---------- invoice meta ---------- */
  doc.setTextColor(10, 10, 10);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(24);
  doc.text("INVOICE", M, 165);
  doc.setFontSize(12);
  doc.text(String(invoice.number || ""), M, 184);

  doc.setFont("helvetica", "normal");
  doc.setFontSize(10);
  doc.setTextColor(95, 95, 95);
  doc.text(`Issue date:  ${day(invoice.created_at?.slice(0, 10))}`, M, 208);
  doc.text(`Due date:  ${day(invoice.due_date)}`, M, 226);

  const label = STATUS_LABEL[String(invoice.status).toLowerCase()] || "DUE";
  doc.setDrawColor(198, 165, 92);
  doc.setLineWidth(1.2);
  doc.setFillColor(252, 249, 240);
  doc.roundedRect(W - M - 108, 148, 108, 30, 8, 8, "FD");
  doc.setFont("helvetica", "bold");
  doc.setFontSize(11);
  doc.setTextColor(146, 116, 40);
  doc.text(label, W - M - 54, 167, { align: "center" });

  /* ---------- billed to ---------- */
  doc.setFont("helvetica", "bold");
  doc.setFontSize(10);
  doc.setTextColor(10, 10, 10);
  doc.text("Billed to:", M, 272);
  doc.setFont("helvetica", "normal");
  doc.setFontSize(11);
  doc.text(customerName || "-", M, 292);
  doc.setFontSize(10);
  doc.setTextColor(95, 95, 95);
  let by = 310;
  if (customerEmail) {
    doc.text(customerEmail, M, by);
    by += 18;
  }
  if (customerAddress) {
    for (const line of String(customerAddress).split("\n").slice(0, 4)) {
      if (!line.trim()) continue;
      doc.text(line.trim(), M, by);
      by += 16;
    }
  }

  /* ---------- items ---------- */
  let y = Math.max(by + 34, 352);
  const drawTableHead = () => {
    doc.setFillColor(10, 10, 10);
    doc.rect(M, y - 15, W - M * 2, 26, "F");
    doc.setTextColor(245, 244, 240);
    doc.setFont("helvetica", "bold");
    doc.setFontSize(10);
    doc.text("Description", M + 12, y);
    doc.text("Amount", W - M - 12, y, { align: "right" });
  };
  drawTableHead();

  y += 40;
  doc.setFont("helvetica", "normal");
  let stripe = false;
  for (const item of invoice.items || []) {
    if (y > 726) {
      doc.addPage();
      y = 80;
      drawTableHead();
      y += 40;
    }
    if (stripe) {
      doc.setFillColor(247, 245, 240);
      doc.rect(M, y - 15, W - M * 2, 30, "F");
    }
    stripe = !stripe;
    doc.setFontSize(10.5);
    doc.setTextColor(30, 30, 30);
    const lines = doc.splitTextToSize(item.description || "—", W - M * 2 - 130);
    doc.text(lines, M + 12, y);
    doc.setTextColor(10, 10, 10);
    doc.text(money(item.amount), W - M - 12, y, { align: "right" });
    doc.setDrawColor(226, 223, 216);
    doc.line(M, y + 12, W - M, y + 12);
    y += 40 + (lines.length - 1) * 13;
  }

  /* ---------- totals ---------- */
  if (y > 690) {
    doc.addPage();
    y = 110;
  }
  doc.setDrawColor(10, 10, 10);
  doc.setLineWidth(1.4);
  doc.line(W - M - 220, y + 6, W - M, y + 6);
  y += 30;
  doc.setFont("helvetica", "bold");
  doc.setFontSize(17);
  doc.text("Total due", W - M - 220, y);
  doc.setFontSize(19);
  doc.text(money(invoice.total), W - M - 12, y, { align: "right" });

  /* ---------- notes + footer ---------- */
  doc.setFont("helvetica", "normal");
  doc.setFontSize(10);
  doc.setTextColor(95, 95, 95);
  doc.text(
    invoice.status === "paid"
      ? "This invoice has been paid in full — thank you."
      : "Please settle by the due date shown. Thank you for your business.",
    M,
    y + 16
  );

  doc.setDrawColor(198, 165, 92);
  doc.setLineWidth(1.2);
  doc.line(M, 796, W - M, 796);
  doc.setFontSize(9);
  doc.setTextColor(130, 130, 130);
  doc.text("TMN Decorating & Maintenance — Plymouth, UK  ·  info@tmndecorating.co.uk  ·  07736 325643", M, 812);

  return doc;
}

export async function downloadInvoicePdf(invoice, customerName = "", customerEmail = "", customerAddress = "") {
  const doc = await buildInvoiceDoc(invoice, customerName, customerEmail, customerAddress);
  doc.save(`${invoice.number}.pdf`);
}

export async function invoicePdfBase64(invoice, customerName = "", customerEmail = "", customerAddress = "") {
  const doc = await buildInvoiceDoc(invoice, customerName, customerEmail, customerAddress);
  // jsPDF 4.x has no "base64" output type (it returns null) — encode the arraybuffer
  const bytes = new Uint8Array(doc.output("arraybuffer"));
  let bin = "";
  const CHUNK = 0x8000;
  for (let i = 0; i < bytes.length; i += CHUNK) {
    bin += String.fromCharCode.apply(null, bytes.subarray(i, i + CHUNK));
  }
  return btoa(bin);
}
