/** Card layout for the plugin manager. */
export const PLUGIN_UI_CSS = `
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
}

.yapmod-plugin-card-body {
  display: flex;
  flex: 1;
  flex-direction: column;
  align-items: flex-start;
  gap: 9px;
  padding: 14px;
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

.yapmod-plugin-tags {
  display: flex;
  flex-wrap: wrap;
  gap: 5px;
  margin-top: 2px;
}

.yapmod-plugin-tag {
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
  align-items: center;
  justify-content: space-between;
  gap: 10px;
  padding: 10px 14px 14px;
  border-top: 1px solid var(--ym-border, var(--border, rgba(127, 127, 127, 0.16)));
}

.yapmod-plugin-card-actions {
  display: flex;
  align-items: center;
  min-width: 0;
  gap: 6px;
}

.yapmod-plugin-install {
  width: 100%;
}

.yapmod-plugin-icon-button {
  display: inline-grid;
  width: 40px;
  min-width: 40px;
  height: 38px;
  place-items: center;
  justify-content: center;
  padding: 0;
}

.yapmod-plugin-action-icon {
  display: block;
}

.yapmod-plugin-setting-row input.switch {
  flex: none;
}

.yapmod-plugin-status {
  margin: 12px 0 0;
}

.yapmod-plugin-status-error {
  color: var(--ym-danger, var(--danger, #d9485f));
}

.yapmod-plugin-setting-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 16px;
  padding: 12px 0;
  border-bottom: 1px solid var(--ym-border, var(--border, rgba(127, 127, 127, 0.2)));
  cursor: pointer;
}

.yapmod-plugin-setting-row:last-child {
  border-bottom: 0;
}

.yapmod-plugin-source-note {
  margin-top: 4px;
  font-size: 0.85em;
  opacity: 0.72;
}

.yapmod-plugin-setting-row input {
  flex: none;
}

.yapmod-plugin-source-file {
  margin-top: 10px;
  border: 1px solid var(--ym-border, var(--border, rgba(127, 127, 127, 0.25)));
  border-radius: 8px;
  overflow: hidden;
}

.yapmod-plugin-source-file summary {
  padding: 9px 12px;
  cursor: pointer;
  font-weight: 600;
}

.yapmod-plugin-source-code {
  max-height: 48vh;
  margin: 0;
  padding: 12px;
  overflow: auto;
  background: var(--ym-bg-elev, var(--bg-elev, rgba(127, 127, 127, 0.06)));
  font-size: 0.78em;
  tab-size: 2;
  white-space: pre;
}

.yapmod-plugin-source-code code {
  font-family: var(--font-mono, ui-monospace, SFMono-Regular, Menlo, monospace);
}
`;
