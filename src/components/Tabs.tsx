export interface TabDefinition {
  id: string;
  label: string;
  count?: number;
  /** A tab the current role cannot reach is not rendered at all. */
  hidden?: boolean;
}

interface TabsProps {
  tabs: TabDefinition[];
  activeId: string;
  onChange: (id: string) => void;
  label?: string;
}

/** Used only where tabs genuinely group related datasets (PRD section 20). */
export function Tabs({ tabs, activeId, onChange, label = 'Sections' }: TabsProps) {
  const visible = tabs.filter((tab) => !tab.hidden);

  return (
    <div className="tabs" role="tablist" aria-label={label}>
      {visible.map((tab) => (
        <button
          key={tab.id}
          type="button"
          role="tab"
          id={`tab-${tab.id}`}
          aria-selected={tab.id === activeId}
          aria-controls={`panel-${tab.id}`}
          className={`tab${tab.id === activeId ? ' tab--active' : ''}`}
          onClick={() => onChange(tab.id)}
        >
          {tab.label}
          {typeof tab.count === 'number' ? <span className="tab__count">{tab.count}</span> : null}
        </button>
      ))}
    </div>
  );
}

export function TabPanel({
  id,
  activeId,
  children,
}: {
  id: string;
  activeId: string;
  children: React.ReactNode;
}) {
  if (id !== activeId) return null;
  return (
    <div role="tabpanel" id={`panel-${id}`} aria-labelledby={`tab-${id}`}>
      {children}
    </div>
  );
}
