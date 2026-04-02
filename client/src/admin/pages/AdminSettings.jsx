export default function AdminSettings() {
  return (
    <>
      <div className="page-header">
        <h1>Admin Settings</h1>
        <div className="page-date">Platform configuration</div>
      </div>

      <div className="admin-card">
        <div className="admin-card-header">
          <h2>Coming soon</h2>
        </div>
        <div style={{ padding: '20px', color: 'var(--text-secondary)' }}>
          Platform-level settings will appear here — pricing config, email templates, feature flags, and more.
        </div>
      </div>
    </>
  );
}
