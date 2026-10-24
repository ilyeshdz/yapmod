/** Card layout for the plugin manager. */
export const PLUGIN_UI_CSS = `
.yapmod-plugin-tabs,
.yapmod-plugin-toolbar {
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: 8px;
  margin-bottom: 12px;
}

.yapmod-plugin-toolbar {
  justify-content: flex-end;
}

.yapmod-plugin-toolbar[hidden],
.yapmod-plugin-grid[hidden] {
  display: none;
}

.yapmod-plugin-search {
  flex: 1 1 220px;
  min-width: 160px;
}

.yapmod-plugin-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(260px, 1fr));
  gap: 10px;
}

.yapmod-plugin-card {
  display: flex;
  flex-direction: column;
  min-width: 0;
  background: var(--ym-bg-elev, var(--bg-elev, rgba(127, 127, 127, 0.06)));
  border: 1px solid var(--ym-border, var(--border, rgba(127, 127, 127, 0.25)));
  border-radius: var(--ym-radius, var(--radius, 10px));
  transition: border-color 0.12s ease;
}

.yapmod-plugin-card:hover,
.yapmod-plugin-card.yapmod-plugin-active {
  border-color: var(--ym-accent, var(--accent, #ff6b4a));
}

.yapmod-plugin-card-body {
  display: flex;
  flex: 1;
  flex-direction: column;
  align-items: flex-start;
  gap: 8px;
  padding: 12px;
}

.yapmod-plugin-card-title-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  width: 100%;
  gap: 8px;
}

.yapmod-plugin-card-name {
  min-width: 0;
  margin: 0;
  font-size: 1em;
  font-weight: 600;
}

.yapmod-plugin-state {
  flex: none;
  padding: 2px 7px;
  border: 1px solid var(--ym-border, var(--border, rgba(127, 127, 127, 0.25)));
  border-radius: 999px;
  font-size: 0.72em;
  opacity: 0.7;
}

.yapmod-plugin-state-active {
  border-color: var(--ym-accent, var(--accent, #ff6b4a));
  color: var(--ym-accent, var(--accent, #ff6b4a));
  opacity: 1;
}

.yapmod-plugin-card-meta,
.yapmod-plugin-card-description {
  margin: 0;
}

.yapmod-plugin-card-meta {
  font-size: 0.78em;
  opacity: 0.65;
}

.yapmod-plugin-card-description {
  font-size: 0.88em;
  line-height: 1.4;
}

.yapmod-plugin-capabilities {
  display: flex;
  flex-wrap: wrap;
  gap: 5px;
  margin-top: 2px;
}

.yapmod-plugin-capability {
  padding: 3px 6px;
  border-radius: 5px;
  background: var(--ym-bg-hover, var(--bg-hover, rgba(127, 127, 127, 0.12)));
  font-size: 0.68em;
  opacity: 0.78;
}

.yapmod-plugin-error {
  margin: 0;
  color: var(--ym-danger, var(--danger, #d9485f));
  font-size: 0.82em;
  overflow-wrap: anywhere;
}

.yapmod-plugin-card-foot {
  display: flex;
  justify-content: flex-end;
  gap: 7px;
  padding: 0 10px 10px;
}

.yapmod-plugin-enable {
  border-color: transparent !important;
  background: var(--ym-accent, var(--tint-a, #5865f2)) !important;
  color: var(--ym-on-accent, var(--on-accent, #fff)) !important;
}

.yapmod-plugin-status {
  margin: 12px 0 0;
}

.yapmod-plugin-status-error {
  color: var(--ym-danger, var(--danger, #d9485f));
}
`;
