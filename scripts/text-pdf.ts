import { PDFDocument, StandardFonts } from "pdf-lib";

export const SAMPLE_PAGES = [
  `Helios Community Foundation requests $250,000 from the Texas Community Development Block Grant for a workforce training center in Hidalgo County. Eligible applicants must be 501(c)(3) organizations operating in Texas. The project period runs from January 1, 2027 through December 31, 2027. A 10 percent cash or in-kind match is required. The submission deadline is March 15, 2027. Questions must be filed at least 14 days before the deadline.`,
  `Proposals are scored on community need for 30 points, organizational capacity for 25 points, budget realism for 25 points, and outcomes for 20 points. Required attachments are an IRS determination letter, a current board list, and a logic model. Funds may not be used for construction of residential housing.`,
  `The workforce program must serve at least 80 adults and report job placement within 90 days of completion. Participants must be Hidalgo County residents ages 18 or older. The narrative must name the training provider and the weekly instructional hours. Stipends are allowable when tied to attendance.`,
  `Reporting is quarterly. Each report must include enrollment, completion, job placement, and a short variance note if any budget line moves by more than 10 percent. The final report is due 45 days after December 31, 2027. Unused funds are returned within 60 days of the final report.`,
];

export async function buildTextPdf(pages: string[]): Promise<Uint8Array> {
  const doc = await PDFDocument.create();
  const font = await doc.embedFont(StandardFonts.Helvetica);
  for (const text of pages) {
    const page = doc.addPage([612, 792]);
    const words = text.split(/\s+/).filter(Boolean);
    const lines: string[] = [];
    let current = "";
    for (const word of words) {
      const next = current ? `${current} ${word}` : word;
      if (next.length > 85) {
        if (current) lines.push(current);
        current = word;
      } else {
        current = next;
      }
    }
    if (current) lines.push(current);
    let y = 740;
    for (const line of lines) {
      if (y < 48) break;
      page.drawText(line, { x: 54, y, size: 11, font });
      y -= 16;
    }
  }
  return new Uint8Array(await doc.save());
}
