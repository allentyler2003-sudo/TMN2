import { jsPDF } from "jspdf";

const money = (n) =>
  `£${Number(n || 0).toLocaleString("en-GB", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

async function logoBase64() {
  const res = await fetch("/logo-white.png");
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

export async function downloadInvoicePdf(invoice, customerName = "", customerEmail = "") {
  const doc = new jsPDF({ unit: "pt", format: "a4" });
  const W = 595;

  doc.setFillColor(10, 10, 10);
  doc.rect(0, 0, W, 120, "F");
  try {
    doc.addImage(await logoBase64(), "PNG", 40, 28, 64, 64);
  } catch (e) {
    /* logo is decorative — skip on failure */
  }
  doc.setTextColor(245, 244, 240);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(17);
  doc.text("TMN Decorating & Maintenance", 120, 56);
  doc.setFont("helvetica", "normal");
  doc.setFontSize(9);
  doc.setTextColor(190, 190, 190);
  doc.text("Plymouth, UK  ·  info@tmndecorating.co.uk  ·  07736 325643", 120, 76);

  doc.setTextColor(10, 10, 10);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(26);
  doc.text(`Invoice ${invoice.number}`, 40, 175);

  doc.setFont("helvetica", "normal");
  doc.setFontSize(10);
  doc.setTextColor(95, 95, 95);
  doc.text(`Issued: ${day(invoice.created_at?.slice(0, 10))}`, 40, 198);
  doc.text(`Due: ${day(invoice.due_date)}`, 40, 216);

  doc.setFont("helvetica", "bold");
  doc.setTextColor(10, 10, 10);
  doc.text("Billed to:", 380, 175);
  doc.setFont("helvetica", "normal");
  doc.setTextColor(95, 95, 95);
  doc.text(customerName || "-", 380, 193);
  doc.text(customerEmail || "", 380, 209);

  let y = 265;
  doc.setFillColor(10, 10, 10);
  doc.rect(40, y - 16, W - 80, 26, "F");
  doc.setTextColor(245, 244, 240);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(10);
  doc.text("Description", 52, y);
  doc.text("Amount", W - 52, y, { align: "right" });

  y += 42;
  doc.setFont("helvetica", "normal");
  doc.setTextColor(10, 10, 10);
  for (const item of invoice.items || []) {
    doc.setFontSize(10);
    doc.text(item.description, 52, y);
    doc.text(money(item.amount), W - 52, y, { align: "right" });
    doc.setDrawColor(220, 220, 220);
    doc.line(40, y + 10, W - 40, y + 10);
    y += 36;
  }

  doc.setFont("helvetica", "bold");
  doc.setFontSize(14);
  doc.text("Total", 52, y + 8);
  doc.text(money(invoice.total), W - 52, y + 8, { align: "right" });

  y += 44;
  doc.setFont("helvetica", "normal");
  doc.setFontSize(10);
  doc.text(`Status: ${String(invoice.status).toUpperCase()}`, 52, y);

  doc.setFontSize(9);
  doc.setTextColor(130, 130, 130);
  doc.text(
    "Thank you for your business — TMN Decorating & Maintenance, Plymouth UK.",
    40,
    780
  );

  doc.save(`${invoice.number}.pdf`);
}
