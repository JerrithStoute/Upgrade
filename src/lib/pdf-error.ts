/** A PDF that won't open, in words a contractor can act on (pdf.js messages mean nothing to them). */
export function pdfErrorMessage(e: unknown, fallback = "Couldn't open this PDF."): string {
  const name = e instanceof Error ? e.name : "";
  const msg = e instanceof Error ? e.message : "";
  if (name === "InvalidPDFException" || /invalid pdf|pdf structure|bad xref|startxref/i.test(msg))
    return "This PDF is damaged — ask for a new copy and upload it again.";
  if (name === "PasswordException" || /password/i.test(msg))
    return "This PDF is password-protected — ask for a copy without a password.";
  if (name === "MissingPDFException" || /missing pdf|404/i.test(msg)) return "This PDF's file is missing — upload it again.";
  return fallback;
}
