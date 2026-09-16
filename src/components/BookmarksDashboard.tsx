import React, { useState, useEffect, useRef } from 'react';
import { bookmarkStorage, Bookmark, BookmarkFolder } from '../utils/bookmarks';
import { ContextMenu, ContextMenuAction } from './ContextMenu';

interface BookmarksDashboardProps {
  onNavigate: (url: string) => void;
  onCreateTab: (url?: string) => void;
}

export function BookmarksDashboard({ onNavigate, onCreateTab }: BookmarksDashboardProps) {
  const [bookmarks, setBookmarks] = useState<Bookmark[]>([]);
  const [folders, setFolders] = useState<BookmarkFolder[]>([]);
  const [activeFolderId, setActiveFolderId] = useState<string>('all');
  const [activeTag, setActiveTag] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState<string>('');

  // Editing state
  const [editingBookmark, setEditingBookmark] = useState<Bookmark | null>(null);
  const [editTitle, setEditTitle] = useState('');
  const [editUrl, setEditUrl] = useState('');
  const [editFolderId, setEditFolderId] = useState('');
  const [editTagsString, setEditTagsString] = useState('');

  // Add folder state
  const [showAddFolder, setShowAddFolder] = useState(false);
  const [newFolderName, setNewFolderName] = useState('');
  const [newFolderParentId, setNewFolderParentId] = useState('root');

  const fileInputRef = useRef<HTMLInputElement>(null);
  const [bmContextMenu, setBmContextMenu] = useState<{
    visible: boolean;
    x: number;
    y: number;
    bookmark: Bookmark | null;
  }>({ visible: false, x: 0, y: 0, bookmark: null });

  useEffect(() => {
    loadData();
  }, []);

  const loadData = () => {
    setBookmarks(bookmarkStorage.getBookmarks());
    setFolders(bookmarkStorage.getFolders());
  };

  const handleCreateFolder = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newFolderName.trim()) return;

    bookmarkStorage.addFolder({
      name: newFolderName.trim(),
      parentId: newFolderParentId || undefined,
    });

    setNewFolderName('');
    setShowAddFolder(false);
    loadData();
  };

  const handleDeleteBookmark = (id: string) => {
    if (confirm('Are you sure you want to delete this bookmark?')) {
      bookmarkStorage.deleteBookmark(id);
      loadData();
    }
  };

  const handleStartEdit = (b: Bookmark) => {
    setEditingBookmark(b);
    setEditTitle(b.title);
    setEditUrl(b.url);
    setEditFolderId(b.folderId || 'root');
    setEditTagsString(b.tags?.join(', ') || '');
  };

  const handleSaveEdit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingBookmark) return;

    const parsedTags = editTagsString
      .split(',')
      .map(t => t.trim())
      .filter(t => t.length > 0);

    bookmarkStorage.updateBookmark(editingBookmark.id, {
      title: editTitle,
      url: editUrl,
      folderId: editFolderId === 'root' ? undefined : editFolderId,
      tags: parsedTags,
    });

    setEditingBookmark(null);
    loadData();
  };

  const handleImportClick = () => {
    fileInputRef.current?.click();
  };

  const handleFileImport = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = event => {
      const html = event.target?.result as string;
      const count = bookmarkStorage.importFromHTML(html);
      alert(`Successfully imported ${count} bookmarks!`);
      loadData();
    };
    reader.readAsText(file);
  };

  const handleExportClick = () => {
    const htmlData = bookmarkStorage.exportToHTML();
    const blob = new Blob([htmlData], { type: 'text/html' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = 'icrush_bookmarks.html';
    link.click();
    URL.revokeObjectURL(url);
  };

  // Tag helper coloring mapping
  const getTagColorClass = (tag: string) => {
    const t = tag.toLowerCase();
    if (t.includes('read') || t.includes('later')) return 'tag-green';
    if (t.includes('priority') || t.includes('high') || t.includes('todo')) return 'tag-red';
    if (t.includes('work') || t.includes('dev') || t.includes('doc')) return 'tag-blue';
    if (t.includes('research') || t.includes('study')) return 'tag-purple';
    return 'tag-gold';
  };

  // Render folder tree helpers
  const getFolderBreadcrumb = (folderId?: string): string => {
    if (!folderId || folderId === 'root') return '';
    const folder = folders.find(f => f.id === folderId);
    if (!folder) return '';
    const parentPart = getFolderBreadcrumb(folder.parentId);
    return parentPart ? `${parentPart} ➔ ${folder.name}` : folder.name;
  };

  // Fuzzy matching filter implementation
  const query = searchQuery.toLowerCase().trim();
  const handleBmContextMenu = (e: React.MouseEvent, bookmark: Bookmark) => {
    e.preventDefault();
    setBmContextMenu({ visible: true, x: e.clientX, y: e.clientY, bookmark });
  };

  const handleBmMenuAction = (action: ContextMenuAction) => {
    const bm = bmContextMenu.bookmark;
    if (!bm) return;
    switch (action.type) {
      case 'openInNewTab':
        onCreateTab(bm.url);
        break;
      case 'copyUrl':
        navigator.clipboard.writeText(bm.url).catch(() => {});
        break;
      case 'editBookmark':
        handleStartEdit(bm);
        break;
      case 'deleteBookmark':
        handleDeleteBookmark(bm.id);
        break;
    }
    setBmContextMenu(prev => ({ ...prev, visible: false }));
  };

  const filteredBookmarks = bookmarks.filter(b => {
    // 1. Tag selection filter
    if (activeTag && !b.tags?.includes(activeTag)) return false;

    // 2. Folder tree selection filter
    if (activeFolderId !== 'all') {
      if (activeFolderId === 'root') {
        if (b.folderId && b.folderId !== 'root') return false;
      } else {
        if (b.folderId !== activeFolderId) return false;
      }
    }

    // 3. Search query fuzzy match
    if (!query) return true;
    const folderName = folders.find(f => f.id === b.folderId)?.name || '';
    return (
      b.title.toLowerCase().includes(query) ||
      b.url.toLowerCase().includes(query) ||
      b.tags?.some(tag => tag.toLowerCase().includes(query)) ||
      folderName.toLowerCase().includes(query)
    );
  });

  const allTags = bookmarkStorage.getAllTags();

  return (
    <div className="bookmarks-dashboard-container">
      {/* Background blobs for premium glassmorphism overlay */}
      <div className="bookmarks-ambient-blobs">
        <div className="bookmarks-blob bookmarks-azure" />
        <div className="bookmarks-blob bookmarks-indigo" />
      </div>

      {/* Sidebar Panel */}
      <aside className="bookmarks-sidebar">
        <div className="bookmarks-sidebar-title">
          <svg
            width="18"
            height="18"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2.5"
          >
            <path d="M19 21l-7-5-7 5V5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2z" />
          </svg>
          <h2>Bookmarks Bar</h2>
        </div>

        {/* Folders List Tree */}
        <div className="sidebar-section">
          <div className="sidebar-section-header">
            <h3>Folders</h3>
            <button
              className="add-folder-trigger"
              onClick={() => setShowAddFolder(true)}
              title="Create New Folder"
            >
              <svg
                width="14"
                height="14"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2.5"
              >
                <line x1="12" y1="5" x2="12" y2="19" />
                <line x1="5" y1="12" x2="19" y2="12" />
              </svg>
            </button>
          </div>

          <div className="folder-tree-list">
            <button
              className={`folder-tree-node ${activeFolderId === 'all' ? 'active' : ''}`}
              onClick={() => {
                setActiveFolderId('all');
                setActiveTag(null);
              }}
            >
              📁 All Bookmarks
            </button>
            <button
              className={`folder-tree-node ${activeFolderId === 'root' ? 'active' : ''}`}
              onClick={() => {
                setActiveFolderId('root');
                setActiveTag(null);
              }}
            >
              📁 Bookmarks Bar Root
            </button>

            {folders
              .filter(f => f.id !== 'root')
              .map(folder => (
                <button
                  key={folder.id}
                  className={`folder-tree-node child-node ${activeFolderId === folder.id ? 'active' : ''}`}
                  onClick={() => {
                    setActiveFolderId(folder.id);
                    setActiveTag(null);
                  }}
                >
                  <span>📁 {folder.name}</span>
                  {folder.parentId && folder.parentId !== 'root' && (
                    <span className="folder-parent-subtext">
                      in {folders.find(p => p.id === folder.parentId)?.name}
                    </span>
                  )}
                </button>
              ))}
          </div>
        </div>

        {/* Tags List */}
        <div className="sidebar-section">
          <div className="sidebar-section-header">
            <h3>Tags</h3>
          </div>
          <div className="tag-filter-list">
            {allTags.length === 0 ? (
              <span className="no-tags-subtext">
                No tags added yet. Edit a bookmark to add tags.
              </span>
            ) : (
              allTags.map(tag => (
                <button
                  key={tag}
                  className={`tag-sidebar-pill ${activeTag === tag ? 'active' : ''}`}
                  onClick={() => {
                    setActiveTag(activeTag === tag ? null : tag);
                    setActiveFolderId('all');
                  }}
                >
                  <span className={`tag-dot ${getTagColorClass(tag)}`} />
                  <span>{tag}</span>
                </button>
              ))
            )}
          </div>
        </div>
      </aside>

      {/* Main Dashboard Area */}
      <main className="bookmarks-main">
        {/* Header Search & Actions */}
        <header className="bookmarks-header">
          <div className="bookmarks-search-bar">
            <svg
              className="search-icon"
              width="16"
              height="16"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2.5"
            >
              <circle cx="11" cy="11" r="8" />
              <line x1="21" y1="21" x2="16.65" y2="16.65" />
            </svg>
            <input
              type="text"
              placeholder="Search bookmarks, folders, tags, or URLs..."
              value={searchQuery}
              onChange={e => setSearchQuery(e.target.value)}
            />
            {searchQuery && (
              <button className="clear-search-btn" onClick={() => setSearchQuery('')}>
                ×
              </button>
            )}
          </div>

          <div className="bookmarks-actions">
            <button className="action-pill-btn" onClick={handleImportClick}>
              📥 Import HTML
            </button>
            <button className="action-pill-btn" onClick={handleExportClick}>
              📤 Export HTML
            </button>
            <input
              type="file"
              ref={fileInputRef}
              style={{ display: 'none' }}
              accept=".html"
              onChange={handleFileImport}
            />
            <button
              className="home-dashboard-btn"
              onClick={() => onNavigate('about:blank')}
              title="Back to blank tab"
            >
              Home
            </button>
          </div>
        </header>

        {/* Content list */}
        <div className="bookmarks-grid-viewport">
          <div className="viewport-meta">
            <span>
              Showing {filteredBookmarks.length} of {bookmarks.length} bookmark
              {bookmarks.length === 1 ? '' : 's'}
            </span>
            {(activeFolderId !== 'all' || activeTag || searchQuery) && (
              <button
                className="reset-filters-btn"
                onClick={() => {
                  setActiveFolderId('all');
                  setActiveTag(null);
                  setSearchQuery('');
                }}
              >
                Reset Filters
              </button>
            )}
          </div>

          {filteredBookmarks.length === 0 ? (
            <div className="bookmarks-empty-state">
              <svg
                width="48"
                height="48"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="1.5"
              >
                <path d="M19 21l-7-5-7 5V5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2z" />
              </svg>
              <h4>No Bookmarks Found</h4>
              <p>
                Try resetting filters, searching for a different keyword, or importing from Chrome.
              </p>
            </div>
          ) : (
            <div className="bookmarks-cards-list">
              {filteredBookmarks.map(b => {
                const domain = b.url.replace('https://', '').replace('http://', '').split('/')[0];
                const breadcrumb = getFolderBreadcrumb(b.folderId);

                return (
    <div key={b.id} className="bookmark-card" onContextMenu={(e) => handleBmContextMenu(e, b)}>
      {/* Bookmark favicon */}
                    <div className="bookmark-card-icon">
                      <img
                        src={`https://www.google.com/s2/favicons?sz=64&domain=${domain}`}
                        alt="favicon"
                        onError={e => {
                          e.currentTarget.style.display = 'none';
                          const fallback =
                            e.currentTarget.parentElement?.querySelector('.favicon-fallback');
                          if (fallback) (fallback as HTMLElement).style.display = 'flex';
                        }}
                      />
                      <div className="favicon-fallback" style={{ display: 'none' }}>
                        {b.title ? b.title.charAt(0).toUpperCase() : 'B'}
                      </div>
                    </div>

                    {/* Content Details */}
                    <div className="bookmark-card-details">
                      <div className="bookmark-title-row">
                        <span className="bookmark-card-title" onClick={() => onNavigate(b.url)}>
                          {b.title || b.url}
                        </span>
                        {breadcrumb && (
                          <span className="bookmark-card-folder-badge" title={breadcrumb}>
                            📁{' '}
                            {breadcrumb.length > 20 ? breadcrumb.slice(0, 17) + '...' : breadcrumb}
                          </span>
                        )}
                      </div>
                      <span className="bookmark-card-url" onClick={() => onNavigate(b.url)}>
                        {b.url}
                      </span>

                      {/* Bookmark tags list */}
                      {b.tags && b.tags.length > 0 && (
                        <div className="bookmark-card-tags">
                          {b.tags.map(tag => (
                            <span
                              key={tag}
                              className={`bookmark-tag-pill ${getTagColorClass(tag)}`}
                              onClick={e => {
                                e.stopPropagation();
                                setActiveTag(tag);
                              }}
                            >
                              {tag}
                            </span>
                          ))}
                        </div>
                      )}
                    </div>

                    {/* Bookmark actions */}
                    <div className="bookmark-card-actions">
                      <button
                        className="card-action-icon-btn"
                        onClick={() => handleStartEdit(b)}
                        title="Edit bookmark"
                      >
                        ✏️
                      </button>
                      <button
                        className="card-action-icon-btn delete-btn"
                        onClick={() => handleDeleteBookmark(b.id)}
                        title="Delete bookmark"
                      >
                        🗑️
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </main>

      {/* Popover Edit Form Modal */}
      {editingBookmark && (
        <div className="dashboard-modal-overlay" onClick={() => setEditingBookmark(null)}>
          <div className="dashboard-modal-card" onClick={e => e.stopPropagation()}>
            <div className="modal-header">
              <h2>Edit Bookmark</h2>
              <button className="modal-close-x" onClick={() => setEditingBookmark(null)}>
                ×
              </button>
            </div>
            <form onSubmit={handleSaveEdit}>
              <div className="form-group">
                <label>Title</label>
                <input
                  type="text"
                  value={editTitle}
                  onChange={e => setEditTitle(e.target.value)}
                  required
                />
              </div>
              <div className="form-group">
                <label>URL</label>
                <input
                  type="url"
                  value={editUrl}
                  onChange={e => setEditUrl(e.target.value)}
                  required
                />
              </div>
              <div className="form-group">
                <label>Move to Folder</label>
                <select value={editFolderId} onChange={e => setEditFolderId(e.target.value)}>
                  <option value="root">Bookmarks Bar Root</option>
                  {folders
                    .filter(f => f.id !== 'root')
                    .map(f => (
                      <option key={f.id} value={f.id}>
                        {getFolderBreadcrumb(f.id)}
                      </option>
                    ))}
                </select>
              </div>
              <div className="form-group">
                <label>Tags (comma separated)</label>
                <input
                  type="text"
                  value={editTagsString}
                  onChange={e => setEditTagsString(e.target.value)}
                  placeholder="e.g. To Read, High Priority, Work"
                />
              </div>
              <div className="modal-actions">
                <button
                  type="button"
                  className="btn-secondary"
                  onClick={() => setEditingBookmark(null)}
                >
                  Cancel
                </button>
                <button type="submit" className="btn-primary">
                  Save Changes
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Create Folder Popover Modal */}
      {showAddFolder && (
        <div className="dashboard-modal-overlay" onClick={() => setShowAddFolder(false)}>
          <div className="dashboard-modal-card" onClick={e => e.stopPropagation()}>
            <div className="modal-header">
              <h2>Create New Folder</h2>
              <button className="modal-close-x" onClick={() => setShowAddFolder(false)}>
                ×
              </button>
            </div>
            <form onSubmit={handleCreateFolder}>
              <div className="form-group">
                <label>Folder Name</label>
                <input
                  type="text"
                  value={newFolderName}
                  onChange={e => setNewFolderName(e.target.value)}
                  placeholder="e.g. Development, Inspiration"
                  required
                  autoFocus
                />
              </div>
              <div className="form-group">
                <label>Parent Folder</label>
                <select
                  value={newFolderParentId}
                  onChange={e => setNewFolderParentId(e.target.value)}
                >
                  <option value="root">Bookmarks Bar Root</option>
                  {folders
                    .filter(f => f.id !== 'root')
                    .map(f => (
                      <option key={f.id} value={f.id}>
                        {getFolderBreadcrumb(f.id)}
                      </option>
                    ))}
                </select>
              </div>
              <div className="modal-actions">
                <button
                  type="button"
                  className="btn-secondary"
                  onClick={() => setShowAddFolder(false)}
                >
                  Cancel
                </button>
                <button type="submit" className="btn-primary">
                  Create Folder
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {bmContextMenu.visible && bmContextMenu.bookmark && (
        <ContextMenu
          x={bmContextMenu.x}
          y={bmContextMenu.y}
          items={[
            { type: 'item', label: 'Open in New Tab', icon: '↗', action: 'openInNewTab' },
            { type: 'item', label: 'Copy URL', icon: '📋', action: 'copyUrl' },
            { type: 'separator' },
            { type: 'item', label: 'Edit Bookmark', icon: '✏️', action: 'editBookmark' },
            { type: 'item', label: 'Delete Bookmark', icon: '🗑', action: 'deleteBookmark' },
          ]}
          onClose={() => setBmContextMenu(prev => ({ ...prev, visible: false }))}
          onAction={handleBmMenuAction}
        />
      )}
    </div>
  );
}
