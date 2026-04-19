import { PDFDocument } from "pdf-lib";

export async function pngsToPdf(pngs: Buffer[]): Promise<Buffer> {
  const doc = await PDFDocument.create();
  for (const png of pngs) {
    const img = await doc.embedPng(png);
    const page = doc.addPage([1080, 1350]);
    page.drawImage(img, { x: 0, y: 0, width: 1080, height: 1350 });
  }
  const bytes = await doc.save();
  return Buffer.from(bytes);
}
