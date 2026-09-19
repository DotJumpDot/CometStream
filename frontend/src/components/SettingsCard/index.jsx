/**
 * Trae-style settings card: a rounded surface that groups related setting
 * rows. Rows rendered as direct children are automatically separated by a
 * hairline divider (see `.settings-card-rows` in index.css), which lets
 * existing row components drop in without internal changes.
 */
export default function SettingsCard({
  title,
  description,
  children,
  className = "",
}) {
  const hasHeader = !!title || !!description;

  return (
    <section
      className={`rounded-xl bg-theme-bg-primary border border-theme-modal-border my-4 ${className}`}
    >
      {hasHeader && (
        <div className="px-4 pt-4 pb-2">
          {title && (
            <p className="text-sm font-semibold text-theme-text-primary">
              {title}
            </p>
          )}
          {description && (
            <p className="text-xs text-theme-text-secondary mt-0.5">
              {description}
            </p>
          )}
        </div>
      )}
      <div className="settings-card-rows px-4 pb-2">{children}</div>
    </section>
  );
}
