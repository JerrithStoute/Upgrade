import { LegalPage } from "../legal";

export const metadata = { title: "Terms of Service" };

export default function TermsPage() {
  return (
    <LegalPage
      title="Terms of Service"
      updated="October 12, 2026"
      sections={[
        {
          h: "The service",
          p: [
            "The Builder Station is online software for home builders and remodelers: takeoffs, estimates, schedules, budgets, purchasing, and portals for clients and vendors. These terms are between The Builder Station and the company that signs up (“you”).",
          ],
        },
        {
          h: "Your account",
          p: [
            "You're responsible for the people you give logins to — your team, your clients and your vendors — and for what they do in your account. Keep passwords private and tell us right away if you think someone got into your account.",
          ],
        },
        {
          h: "Your data is yours",
          p: [
            "Everything you put in — plans, estimates, prices, schedules, files, client and vendor details — belongs to you. We use it only to run the service for you, and we don't sell it. You can get your data out at any time while your account is open, and for 30 days after it closes.",
          ],
        },
        {
          h: "Billing",
          p: [
            "Plans are billed monthly, per company, with unlimited users. There's no contract: you can cancel any time and your plan runs to the end of the month you've paid for. We'll give you at least 30 days' notice before a price change.",
          ],
        },
        {
          h: "Acceptable use",
          p: [
            "Don't use the service to break the law, to send spam, to upload anything you don't have the right to share, or to try to get into other companies' accounts or the service's systems.",
          ],
        },
        {
          h: "Your numbers are your call",
          p: [
            "The Builder Station helps you measure, count and price — including suggestions like span tables and waste. You're responsible for checking quantities, sizes, prices and code requirements before you bid, order or build.",
          ],
        },
        {
          h: "Availability and changes",
          p: [
            "We work to keep the service running and backed up, but it's provided “as is” and may occasionally be down for maintenance or outages. We improve the service over time and may change features; we won't take away something you rely on without notice.",
          ],
        },
        {
          h: "Limits of liability",
          p: [
            "To the extent the law allows, our total liability for any claim is limited to what you paid us in the 12 months before it, and we aren't liable for indirect or lost-profit damages.",
          ],
        },
        {
          h: "Ending your account",
          p: [
            "You can close your account any time. We may suspend or close an account that doesn't pay or breaks these terms, after letting you know when we reasonably can.",
          ],
        },
        {
          h: "Contact",
          p: ["Questions about these terms: support@thebuilderstation.com."],
        },
      ]}
    />
  );
}
