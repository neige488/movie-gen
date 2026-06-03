import { useState } from "react";
import type { LibraryDto } from "../../shared/dto.js";
import { CharacterCard } from "./CharacterCard.js";
import { ReferenceGrid } from "./ReferenceGrid.js";

type Tab = "characters" | "locations" | "props";

interface Props {
  library: LibraryDto;
  onUploaded: () => void;
}

export function LibraryPage({ library, onUploaded }: Props) {
  const [tab, setTab] = useState<Tab>("characters");

  return (
    <div className="library">
      <header className="library__header">
        <h2 className="library__title">Asset Library</h2>
        <div className="library__tabs" role="tablist">
          <TabButton current={tab} value="characters" onClick={setTab}>
            Characters ({library.characters.length})
          </TabButton>
          <TabButton current={tab} value="locations" onClick={setTab}>
            Locations ({library.locations.length})
          </TabButton>
          <TabButton current={tab} value="props" onClick={setTab}>
            Props ({library.props.length})
          </TabButton>
        </div>
      </header>

      {tab === "characters" && (
        <div className="library__list">
          {library.characters.length === 0 ? (
            <EmptyHint domain="characters" />
          ) : (
            library.characters.map((c) => (
              <CharacterCard
                key={c.name}
                character={c}
                onUploaded={onUploaded}
              />
            ))
          )}
        </div>
      )}

      {tab === "locations" && (
        <div className="library__list">
          {library.locations.length === 0 ? (
            <EmptyHint domain="locations" />
          ) : (
            library.locations.map((l) => (
              <ReferenceGrid
                key={l.name}
                kind="location"
                name={l.name}
                references={l.references}
                onUploaded={onUploaded}
              />
            ))
          )}
        </div>
      )}

      {tab === "props" && (
        <div className="library__list">
          {library.props.length === 0 ? (
            <EmptyHint domain="props" />
          ) : (
            library.props.map((p) => (
              <ReferenceGrid
                key={p.name}
                kind="prop"
                name={p.name}
                references={p.references}
                onUploaded={onUploaded}
              />
            ))
          )}
        </div>
      )}
    </div>
  );
}

function TabButton({
  current,
  value,
  onClick,
  children,
}: {
  current: Tab;
  value: Tab;
  onClick: (v: Tab) => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      role="tab"
      aria-selected={current === value}
      className={`library__tab ${current === value ? "library__tab--active" : ""}`}
      onClick={() => onClick(value)}
    >
      {children}
    </button>
  );
}

function EmptyHint({ domain }: { domain: string }) {
  return (
    <div className="status">
      No {domain} yet. Add a YAML file under <code>data/{domain}/</code> via
      Claude Code to populate this tab.
    </div>
  );
}
