import { useState, useEffect } from "react";

interface HomescreenNotesProps {
  onNavigate?: (url: string) => void;
}

export function HomescreenNotes({ onNavigate }: HomescreenNotesProps) {
  const [notes, setNotes] = useState("");
  const [title, setTitle] = useState("Notes");
  const [isEditingTitle, setIsEditingTitle] = useState(false);

  useEffect(() => {
    const saved = localStorage.getItem("gemini-browser-notes");
    if (saved) {
      try {
        const parsed = JSON.parse(saved);
        if (parsed.notes) setNotes(parsed.notes);
        if (parsed.title) setTitle(parsed.title);
      } catch {
        setNotes(saved);
      }
    }
  }, []);

  useEffect(() => {
    localStorage.setItem(
      "gemini-browser-notes",
      JSON.stringify({ notes, title })
    );
    window.dispatchEvent(new CustomEvent("notes-updated", { detail: { notes, title } }));
  }, [notes, title]);

  const handleLaunchWorkspace = () => {
    if (onNavigate) {
      onNavigate("about:workspaces");
    }
  };

  return (
    <div className="homescreen-notes">
      <div className="notes-header">
        {isEditingTitle ? (
          <input
            className="notes-title"
            type="text"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            onBlur={() => setIsEditingTitle(false)}
            onKeyDown={(e) => {
              if (e.key === "Enter") setIsEditingTitle(false);
            }}
            autoFocus
          />
        ) : (
          <span
            className="notes-title"
            onClick={() => setIsEditingTitle(true)}
          >
            {title}
          </span>
        )}
        <button
          className="notes-launch-btn"
          onClick={handleLaunchWorkspace}
        >
          Launch Workspace
        </button>
      </div>
      <textarea
        className="notes-textarea"
        value={notes}
        onChange={(e) => setNotes(e.target.value)}
        placeholder="Write your notes here..."
      />
      <div className="notes-char-count">{notes.length} characters</div>
    </div>
  );
}
