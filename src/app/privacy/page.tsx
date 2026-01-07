export default function PrivacyPage() {
  return (
    <main
      style={{
        maxWidth: 900,
        margin: "40px auto",
        padding: 16,
        fontFamily: "system-ui",
      }}
    >
      <h1 style={{ fontWeight: 900, fontSize: 28, marginBottom: 10 }}>
        Privacy Policy
      </h1>

      <p style={{ color: "var(--muted)" }}>
        This privacy policy explains what data is collected when you use this
        website.
      </p>

      <h2 style={{ marginTop: 24 }}>Analytics</h2>
      <p style={{ color: "var(--muted)" }}>
        If you accept analytics, we use Google Analytics (GA4) to understand how
        visitors use the website (for example: which pages are visited and where
        traffic comes from). Analytics is only enabled after you click “Accept”
        in the analytics banner.
      </p>

      <h2 style={{ marginTop: 24 }}>Cookies / Local Storage</h2>
      <p style={{ color: "var(--muted)" }}>
        We store your analytics choice in your browser (local storage key:{" "}
        <b>tv_consent_analytics</b>).
      </p>

      <h2 style={{ marginTop: 24 }}>Contact</h2>
      <p style={{ color: "var(--muted)" }}>
        If you have questions, contact: <b>info@seveho.com</b>
      </p>

      <div style={{ marginTop: 24, color: "var(--muted)", fontSize: 12 }}>
        Last updated: {new Date().toISOString().slice(0, 10)}
      </div>
    </main>
  );
}
