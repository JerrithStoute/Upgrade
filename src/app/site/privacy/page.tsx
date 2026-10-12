import { LegalPage } from "../legal";

export const metadata = { title: "Privacy Policy" };

export default function PrivacyPage() {
  return (
    <LegalPage
      title="Privacy Policy"
      updated="October 12, 2026"
      sections={[
        {
          h: "What we collect",
          p: [
            "Account details: names, email addresses, phone numbers and passwords (stored only as a secure hash).",
            "What builders put in: jobs, plans, estimates, schedules, files, and details about their clients and vendors.",
            "Basic technical information: sign-in times, IP addresses and browser type, used to keep accounts secure.",
            "If you request an invite on this website: what you type into the form.",
          ],
        },
        {
          h: "How we use it",
          p: [
            "To run the service, keep it secure, send the emails it needs to send (sign-in links, invitations, notices), and answer you when you contact us. We don't sell personal information and we don't use it for advertising.",
          ],
        },
        {
          h: "Builders' clients and vendors",
          p: [
            "When a builder invites you to their client or vendor portal, the builder decides what's shared with you and is responsible for the information they keep about you. We process it on their behalf.",
          ],
        },
        {
          h: "Who helps us run it",
          p: [
            "We use a small number of service providers: hosting and database (Render), file storage and bot protection (Cloudflare), and email delivery (Resend). They get only what they need to do that job.",
          ],
        },
        {
          h: "Cookies",
          p: ["We use one cookie to keep you signed in. No advertising or tracking cookies."],
        },
        {
          h: "Keeping and deleting data",
          p: [
            "We keep a company's data while its account is open, and delete it after the account closes and the export window has passed. Backups roll off on their own schedule. You can ask us to correct or delete your personal information.",
          ],
        },
        {
          h: "Security",
          p: ["Connections are encrypted, each company's data is kept separate from every other company's, and sign-in supports two-step verification."],
        },
        {
          h: "Contact",
          p: ["Privacy questions: support@thebuilderstation.com."],
        },
      ]}
    />
  );
}
