import React, { useEffect, useRef, useState } from 'react';
import { useNavigate, useLocation, Link } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { usePipelineContext } from '../contexts/PipelineContext';
import { useTheme } from '../hooks';
import { ConnectionStatus } from './ConnectionStatus';
import { LogOut, Save, FolderOpen, LogIn, Home, BookOpen, Github, Zap, Moon, Sun, Settings } from 'lucide-react';
import { SavePipelineModal } from './SavePipelineModal';
import { LoadPipelineModal } from './LoadPipelineModal';
import { AdminPanel } from './AdminPanel';
import { SavedPipeline } from '../types';
import { announce } from '../utils/announce';
import BrandMark from './BrandMark';
import AppearanceMenu from './AppearanceMenu';

export const Header: React.FC = () => {
  const { user, logout, isAuthenticated } = useAuth();
  const { pipeline, setPipeline } = usePipelineContext();
  const { theme, toggleTheme } = useTheme();
  const navigate = useNavigate();
  const location = useLocation();
  const [showMenu, setShowMenu] = useState(false);
  const [showSaveModal, setShowSaveModal] = useState(false);
  const [showLoadModal, setShowLoadModal] = useState(false);
  const [showAdminPanel, setShowAdminPanel] = useState(false);
  const [notification, setNotification] = useState<{ message: string; type: 'success' | 'error' } | null>(null);

  const isOnApp = location.pathname === '/app';

  // Account menu keyboard support (WAI-ARIA menu button pattern):
  // Enter/Space/ArrowDown opens and focuses the first item, Up/Down/Home/End
  // move between items, Escape closes and returns focus to the button.
  const menuButtonRef = useRef<HTMLButtonElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const menuItems = () => Array.from(menuRef.current?.querySelectorAll<HTMLElement>('[role="menuitem"]') ?? []);

  useEffect(() => {
    if (showMenu) window.requestAnimationFrame(() => menuItems()[0]?.focus());
  }, [showMenu]);

  const closeMenu = (returnFocus = true) => {
    setShowMenu(false);
    if (returnFocus) menuButtonRef.current?.focus();
  };

  const onMenuKeyDown = (e: React.KeyboardEvent) => {
    const items = menuItems();
    const i = items.indexOf(document.activeElement as HTMLElement);
    if (e.key === 'ArrowDown') { e.preventDefault(); items[(i + 1) % items.length]?.focus(); }
    else if (e.key === 'ArrowUp') { e.preventDefault(); items[(i - 1 + items.length) % items.length]?.focus(); }
    else if (e.key === 'Home') { e.preventDefault(); items[0]?.focus(); }
    else if (e.key === 'End') { e.preventDefault(); items[items.length - 1]?.focus(); }
    else if (e.key === 'Escape') { e.preventDefault(); closeMenu(); }
    else if (e.key === 'Tab') { closeMenu(false); }
  };

  const handleSave = () => {
    if (!isAuthenticated) {
      navigate('/auth');
      return;
    }

    if (pipeline.length === 0) {
      showNotification('Add some operations to your pipeline first!', 'error');
      return;
    }

    setShowSaveModal(true);
  };

  const handleLoad = () => {
    if (!isAuthenticated) {
      navigate('/auth');
      return;
    }

    setShowLoadModal(true);
  };

  const handleLoadPipeline = (loadedPipeline: SavedPipeline) => {
    if (!loadedPipeline.pipeline_data) {
      showNotification('Invalid pipeline data: missing data', 'error');
      return;
    }

    if (!Array.isArray(loadedPipeline.pipeline_data)) {
      showNotification('Invalid pipeline data: not an array', 'error');
      return;
    }

    const steps = loadedPipeline.pipeline_data.map((step, index) => ({
      id: `step_${Date.now()}_${index}`,
      name: step.name,
      params: step.params || {},
    }));

    setPipeline(steps);
    showNotification(`Loaded "${loadedPipeline.name}"`, 'success');
  };

  const showNotification = (message: string, type: 'success' | 'error') => {
    setNotification({ message, type });
    // The toast is visual only; announce it for screen-reader users too.
    announce(message, type === 'error' ? 'assertive' : 'polite');
    setTimeout(() => setNotification(null), 3000);
  };

  return (
    <>
      <header className="bg-white dark:bg-zinc-900 border-b border-slate-300 dark:border-zinc-800 px-3 sm:px-6 py-3 relative z-50">
        {/* Wraps instead of overflowing on narrow screens / high zoom (WCAG 1.4.10 Reflow). */}
        <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2">
          {/* Logo and Title */}
          <div className="flex flex-wrap items-center gap-x-6 gap-y-2">
            <Link
              to="/"
              className="flex items-center space-x-3 hover:opacity-80 transition-opacity rounded-md"
            >
              <BrandMark size={40} />
              <div className="flex flex-col">
                <span className="text-xl font-bold text-slate-900 dark:text-slate-50 leading-tight">PixelFlow</span>
                <span className="text-xs text-slate-600 dark:text-slate-400 leading-tight">Image Processing Pipeline Builder</span>
              </div>
            </Link>

            {/* Navigation Links */}
            <nav aria-label="Main" className="flex flex-wrap items-center gap-1">
              <Link
                to="/"
                aria-current={!isOnApp ? 'page' : undefined}
                className={`flex items-center space-x-1.5 px-3 py-2 text-sm font-medium rounded-md transition-colors ${
                  !isOnApp
                    ? 'text-blue-600 dark:text-blue-400 bg-blue-50 dark:bg-blue-900/20'
                    : 'text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-zinc-800'
                }`}
              >
                <Home aria-hidden="true" size={16} />
                <span>Home</span>
              </Link>

              <Link
                to="/app"
                aria-current={isOnApp ? 'page' : undefined}
                className={`flex items-center space-x-1.5 px-3 py-2 text-sm font-medium rounded-md transition-colors ${
                  isOnApp
                    ? 'text-blue-600 dark:text-blue-400 bg-blue-50 dark:bg-blue-900/20'
                    : 'text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-zinc-800'
                }`}
              >
                <Zap aria-hidden="true" size={16} />
                <span>App</span>
              </Link>

              <a
                href="https://github.com/Mauryantitans/PixelFlow/blob/React_FastAPI/README.md"
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center space-x-1.5 px-3 py-2 text-sm font-medium text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-zinc-800 rounded-md transition-colors"
              >
                <BookOpen aria-hidden="true" size={16} />
                <span>Docs</span>
              </a>

              <a
                href="https://github.com/Mauryantitans/PixelFlow"
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center space-x-1.5 px-3 py-2 text-sm font-medium text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-zinc-800 rounded-md transition-colors"
              >
                <Github aria-hidden="true" size={16} />
                <span>Source</span>
              </a>
            </nav>
          </div>

          {/* Backend connection (pings /api/health; no session/database writes) */}
          <ConnectionStatus />

          {/* Right Side Actions */}
          <div className="flex flex-wrap items-center gap-2">
            {/* Theme Toggle - Always visible, positioned first */}
            <button
              onClick={toggleTheme}
              className="p-2 rounded-md hover:bg-slate-100 dark:hover:bg-zinc-800 text-slate-600 dark:text-slate-300 transition-colors"
              title={theme === 'dark' ? 'Switch to light mode' : 'Switch to dark mode'}
              aria-label={theme === 'dark' ? 'Switch to light mode' : 'Switch to dark mode'}
            >
              {theme === 'dark' ? <Sun aria-hidden="true" className="w-5 h-5" /> : <Moon aria-hidden="true" className="w-5 h-5" />}
            </button>

            <AppearanceMenu />

            {/* Vertical Divider */}
            {(isAuthenticated || isOnApp) && (
              <div className="w-px h-6 bg-slate-300 dark:bg-zinc-700 mx-1"></div>
            )}

            {isOnApp && isAuthenticated && user && (
              <>
                {/* Pipeline Actions */}
                <button
                  onClick={handleLoad}
                  className="flex items-center space-x-1.5 px-3 py-1.5 text-sm text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-zinc-800 rounded-md transition-colors"
                  title="Load Pipeline"
                >
                  <FolderOpen aria-hidden="true" size={16} />
                  <span className="sr-only sm:not-sr-only">Load</span>
                </button>

                <button
                  onClick={handleSave}
                  className="flex items-center space-x-1.5 px-3 py-1.5 text-sm text-white bg-blue-600 hover:bg-blue-700 rounded-md transition-colors shadow-sm"
                  title="Save Pipeline"
                >
                  <Save aria-hidden="true" size={16} />
                  <span className="sr-only sm:not-sr-only">Save</span>
                </button>
              </>
            )}

            {isAuthenticated && user ? (
              <>
                {/* User Menu */}
                <div className="relative">
                  <button
                    ref={menuButtonRef}
                    type="button"
                    onClick={() => setShowMenu(!showMenu)}
                    onKeyDown={(e) => {
                      if (e.key === 'ArrowDown' && !showMenu) { e.preventDefault(); setShowMenu(true); }
                    }}
                    aria-haspopup="menu"
                    aria-expanded={showMenu}
                    aria-controls="account-menu"
                    className="flex items-center space-x-2 px-3 py-1.5 text-sm text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-zinc-800 rounded-md transition-colors"
                  >
                    {user.profile_picture ? (
                      <img 
                        src={user.profile_picture} 
                        alt=""
                        className="w-7 h-7 rounded-full object-cover"
                      />
                    ) : (
                      <div aria-hidden="true" className="w-7 h-7 bg-gradient-to-br from-blue-500 to-indigo-500 rounded-full flex items-center justify-center">
                        <span className="text-white text-xs font-semibold">
                          {user.username.charAt(0).toUpperCase()}
                        </span>
                      </div>
                    )}
                    {/* Name comes from the content so it always includes the
                        visible username (WCAG 2.5.3 Label in Name). */}
                    <span className="sr-only">Account menu for </span>
                    <span className="sr-only sm:not-sr-only sm:inline-block max-w-[120px] truncate font-medium text-slate-900 dark:text-slate-50">
                      {user.username}
                    </span>
                  </button>

                  {showMenu && (
                    <>
                      <div
                        className="fixed inset-0 z-40"
                        aria-hidden="true"
                        onClick={() => setShowMenu(false)}
                      />
                      <div
                        ref={menuRef}
                        onKeyDown={onMenuKeyDown}
                        className="absolute right-0 mt-2 w-56 max-w-[calc(100vw-1rem)] bg-white dark:bg-zinc-800 rounded-lg shadow-lg dark:shadow-black/40 border border-slate-300 dark:border-zinc-700 py-1 z-50">
                        <div className="px-4 py-3 border-b border-slate-300 dark:border-zinc-700">
                          <p className="text-sm font-semibold text-slate-900 dark:text-slate-50">
                            {user.full_name || user.username}
                          </p>
                          <p className="text-xs text-slate-600 dark:text-slate-400 truncate mt-0.5">
                            {user.email}
                          </p>
                          {user.is_admin && (
                            <span className="inline-block mt-1 px-2 py-0.5 bg-purple-100 dark:bg-purple-900/30 text-purple-700 dark:text-purple-300 text-xs font-medium rounded">
                              Admin
                            </span>
                          )}
                        </div>

                        <div id="account-menu" role="menu" aria-label={`Account: ${user.username}`}>
                        {user.is_admin && (
                          <>
                            <button
                              type="button"
                              role="menuitem"
                              tabIndex={-1}
                              onClick={() => {
                                // Park focus on the menu button first so the
                                // dialog can return focus there when it closes.
                                menuButtonRef.current?.focus();
                                setShowMenu(false);
                                setShowAdminPanel(true);
                              }}
                              className="w-full flex items-center space-x-2 px-4 py-2 text-sm text-purple-600 dark:text-purple-400 hover:bg-purple-50 dark:hover:bg-purple-900/20 transition-colors"
                            >
                              <Settings aria-hidden="true" size={16} />
                              <span>Admin Tools</span>
                            </button>
                            <div role="separator" className="border-t border-slate-300 dark:border-zinc-700 my-1"></div>
                          </>
                        )}

                        <button
                          type="button"
                          role="menuitem"
                          tabIndex={-1}
                          onClick={async () => {
                            await logout();
                            setShowMenu(false);
                            navigate('/');
                          }}
                          className="w-full flex items-center space-x-2 px-4 py-2 text-sm text-red-700 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-900/20 transition-colors"
                        >
                          <LogOut aria-hidden="true" size={16} />
                          <span>Logout</span>
                        </button>
                        </div>
                      </div>
                    </>
                  )}
                </div>
              </>
            ) : (
              <>
                {/* Guest mode */}
                {isOnApp && (
                  <div className="flex items-center space-x-2 px-3 py-1.5 bg-blue-50 dark:bg-blue-900/20 rounded-md border border-blue-200 dark:border-blue-800">
                    <span className="text-xs text-blue-700 dark:text-blue-400 font-medium">
                      <span aria-hidden="true">👋 </span>Guest Mode
                    </span>
                  </div>
                )}
                <button
                  onClick={() => navigate('/auth')}
                  className="flex items-center space-x-1.5 px-4 py-1.5 text-sm font-medium text-white bg-blue-600 hover:bg-blue-700 rounded-md transition-colors shadow-sm"
                >
                  <LogIn aria-hidden="true" size={16} />
                  <span>Sign In</span>
                </button>
              </>
            )}
          </div>
        </div>

        {/* Notification Toast */}
        {notification && (
          <div aria-hidden="true" className={`absolute top-full left-1/2 transform -translate-x-1/2 mt-2 max-w-[90vw] px-4 py-2 rounded-lg shadow-lg z-50 animate-fade-in ${
            notification.type === 'success' 
              ? 'bg-green-700 dark:bg-green-700' 
              : 'bg-red-700 dark:bg-red-700'
          } text-white text-sm font-medium`}>
            {notification.message}
          </div>
        )}
      </header>

      {/* Modals */}
      {isAuthenticated && (
        <>
          <SavePipelineModal
            isOpen={showSaveModal}
            onClose={() => setShowSaveModal(false)}
            pipeline={pipeline}
            onSaveSuccess={() => showNotification('Pipeline saved successfully!', 'success')}
          />

          <LoadPipelineModal
            isOpen={showLoadModal}
            onClose={() => setShowLoadModal(false)}
            onLoadPipeline={handleLoadPipeline}
          />
          
          {user?.is_admin && (
            <AdminPanel
              isOpen={showAdminPanel}
              onClose={() => setShowAdminPanel(false)}
            />
          )}
        </>
      )}
    </>
  );
};
