import React, { useState, useEffect } from 'react';
import * as LucideReact from 'lucide-react';
import { Settings, Database, Trash2, HardDrive, Clock, Shield, RefreshCw, X, Save, Check, Lock } from 'lucide-react';
import axios from 'axios';

interface AdminPanelProps {
  isOpen: boolean;
  onClose: () => void;
}

export const AdminPanel: React.FC<AdminPanelProps> = ({ isOpen, onClose }) => {
  const [activeTab, setActiveTab] = useState<'limits' | 'cleanup' | 'storage' | 'retention' | 'database'>('limits');
  const [stats, setStats] = useState<any>(null);
  const [settings, setSettings] = useState<any>(null);
  const [editedSettings, setEditedSettings] = useState<any>(null);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  
  // Database viewer state
  const [showUserData, setShowUserData] = useState(false);
  const [pinVerified, setPinVerified] = useState(false);
  const [showPinDialog, setShowPinDialog] = useState(false);
  const [pin, setPin] = useState('');
  const [hasPinSet, setHasPinSet] = useState(false);
  const [databaseData, setDatabaseData] = useState<any>(null);
  const [loadingDetailedData, setLoadingDetailedData] = useState(false);
  const [selectedUser, setSelectedUser] = useState<any>(null);
  const [userImages, setUserImages] = useState<any[]>([]);
  const [userPipelines, setUserPipelines] = useState<any[]>([]);
  const [loadingUserImages, setLoadingUserImages] = useState(false);
  const [loadingUserPipelines, setLoadingUserPipelines] = useState(false);
  const [activeUserTab, setActiveUserTab] = useState<'images' | 'pipelines'>('images');
  const [deletingUser, setDeletingUser] = useState(false);
  const [deletingImage, setDeletingImage] = useState<number | null>(null);
  const [deletingPipeline, setDeletingPipeline] = useState<number | null>(null);
  const [fixingOrphans, setFixingOrphans] = useState(false);
  const [deletingAllImages, setDeletingAllImages] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [lastRefresh, setLastRefresh] = useState<Date>(new Date());

  // Auth travels in the httpOnly cookie (axios withCredentials default).
  const apiBase = `${process.env.REACT_APP_API_URL || 'http://localhost:8000/api'}/admin`;

  // Load data on open, but DON'T auto-refresh
  useEffect(() => {
    if (isOpen) {
      loadData();
    } else {
      // Reset PIN verification when panel closes
      setPinVerified(false);
      setShowUserData(false);
      setPin('');
      setSelectedUser(null);
    }
    // Intentionally runs only when the dialog opens/changes; listing the
    // loader (re-created every render) would re-run it on every render.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOpen]);

  const loadData = async () => {
    setRefreshing(true);
    try {
      const [storageResp, cleanupResp, settingsResp, dbOverviewResp] = await Promise.all([
        axios.get(`${apiBase}/storage/overview`, {
          headers: {}
        }),
        axios.get(`${apiBase}/cleanup/stats`, {
          headers: {}
        }),
        axios.get(`${apiBase}/settings`, {
          headers: {}
        }),
        axios.get(`${apiBase}/database/overview`, {
          headers: {}
        })
      ]);

      setStats({
        storage: storageResp.data,
        cleanup: cleanupResp.data
      });

      // Only update settings if user hasn't made unsaved changes
      const hasUnsavedChanges = editedSettings && JSON.stringify(settings) !== JSON.stringify(editedSettings);

      if (!hasUnsavedChanges) {
        setSettings(settingsResp.data.settings);
        setEditedSettings(JSON.parse(JSON.stringify(settingsResp.data.settings)));
      } else {
        // User has unsaved changes — only update the baseline for comparison
        setSettings(settingsResp.data.settings);
      }
      
      setDatabaseData((prev: any) => ({
        ...dbOverviewResp.data,
        // Preserve detailed data from loadDetailedData() to prevent auto-refresh from clearing it
        detailed_users: prev?.detailed_users || undefined,
        detailed_sessions: prev?.detailed_sessions || undefined,
        detailed_images: prev?.detailed_images || undefined
      }));
      
      // Check if PIN is set
      setHasPinSet(!!settingsResp.data.settings?.meta?.has_pin);
      
      setLastRefresh(new Date());
    } catch (error) {
      console.error('❌ Failed to load admin data:', error);
    } finally {
      setRefreshing(false);
    }
  };

  const handleSettingChange = (category: string, field: string, value: any) => {
    setEditedSettings((prev: any) => ({
      ...prev,
      [category]: {
        ...prev[category],
        [field]: value
      }
    }));
    setSaved(false);
  };

  const saveSettings = async () => {
    setSaving(true);
    setSaved(false);
    
    try {
      const updates: any = {};
      Object.keys(editedSettings).forEach(category => {
        if (category !== 'meta') {
          Object.keys(editedSettings[category]).forEach(field => {
            updates[field] = editedSettings[category][field];
          });
        }
      });
      
      await axios.put(
        `${apiBase}/settings`,
        updates,
        { headers: {} }
      );
      
      setSaved(true);
      setTimeout(() => setSaved(false), 3000);
      
      // Fetch fresh settings from server to sync everything
      const freshDataResp = await axios.get(`${apiBase}/settings`, {
        headers: {}
      });
      
      // Sync both with the fresh server data
      setSettings(freshDataResp.data.settings);
      setEditedSettings(JSON.parse(JSON.stringify(freshDataResp.data.settings)));
      
      // Refresh other stats (storage, cleanup, database overview)
      await loadData();
      
    } catch (error) {
      alert('Failed to save settings.');
    } finally {
      setSaving(false);
    }
  };

  const handlePinSubmit = async () => {
    try {
      if (!hasPinSet) {
        // Set new PIN
        await axios.post(
          `${apiBase}/pin/set`,
          { pin },
          { headers: { 'Content-Type': 'application/json' } }
        );
        setShowPinDialog(false);
        setPin('');
        
        // Reload data to get updated has_pin status from server
        await loadData();
        
        setPinVerified(true);
        setShowUserData(true);
        loadDetailedData();
        alert('PIN created successfully! You will need to enter this PIN each time you want to view sensitive database information.');
      } else {
        // Verify PIN
        await axios.post(
          `${apiBase}/pin/verify`,
          { pin },
          { headers: { 'Content-Type': 'application/json' } }
        );
        setPinVerified(true);
        setShowPinDialog(false);
        setShowUserData(true);
        setPin('');
        loadDetailedData();
      }
    } catch (error: any) {
      let errorMessage = 'An error occurred';
      
      if (error.response?.data?.detail) {
        // Backend returned an error with detail
        if (typeof error.response.data.detail === 'string') {
          errorMessage = error.response.data.detail;
        } else if (typeof error.response.data.detail === 'object') {
          errorMessage = JSON.stringify(error.response.data.detail);
        }
      } else if (error.message) {
        errorMessage = error.message;
      }
      
      alert(errorMessage);
      setPin('');
    }
  };

  const handleToggleUserData = () => {
    if (!showUserData) {
      // Turning ON - need PIN
      if (!pinVerified) {
        setShowPinDialog(true);
      } else {
        setShowUserData(true);
        loadDetailedData();
      }
    } else {
      // Turning OFF
      setShowUserData(false);
    }
  };

  const loadDetailedData = async () => {
    setLoadingDetailedData(true);

    try {
      const [usersResp, sessionsResp] = await Promise.all([
        axios.get(`${apiBase}/database/users?limit=100`, {
          headers: {}
        }),
        axios.get(`${apiBase}/database/sessions?limit=50`, {
          headers: {}
        })
      ]);

      setDatabaseData((prev: any) => ({
        ...prev,
        detailed_users: usersResp.data.users || [],
        detailed_sessions: sessionsResp.data.sessions || []
      }));
    } catch (error: any) {
      
      let errorMsg = 'Failed to load database details.';
      if (error.response?.status === 401) {
        errorMsg = 'Authentication failed. Please log out and log back in as an admin.';
      } else if (error.response?.status === 403) {
        errorMsg = 'Access denied. You must be an admin to view this data.';
      } else if (error.response?.data?.detail) {
        errorMsg = `Error: ${error.response.data.detail}`;
      }
      
      alert(errorMsg + ' Check console for details.');
    } finally {
      setLoadingDetailedData(false);
    }
  };

  const runCleanup = async () => {
    setLoading(true);
    try {
      const response = await axios.post(
        `${apiBase}/cleanup/run`,
        {},
        { headers: {} }
      );
      
      alert(`Cleanup complete! Deleted ${response.data.results.total_deleted} items.`);
      await loadData();
    } catch (error) {
      alert('Cleanup failed.');
      console.error(error);
    } finally {
      setLoading(false);
    }
  };

  const loadUserImages = async (userId: number) => {
    setLoadingUserImages(true);
    try {
      const response = await axios.get(`${apiBase}/database/users/${userId}/images`, {
        headers: {}
      });

      setUserImages(response.data.images || []);
    } catch (error) {
      console.error(`Failed to load images for user ${userId}:`, error);
      alert('Failed to load user images. Check console for details.');
    } finally {
      setLoadingUserImages(false);
    }
  };

  const loadUserPipelines = async (userId: number) => {
    setLoadingUserPipelines(true);
    try {
      const response = await axios.get(`${apiBase}/database/users/${userId}/pipelines`, {
        headers: {}
      });

      setUserPipelines(response.data.pipelines || []);
    } catch (error) {
      console.error(`Failed to load pipelines for user ${userId}:`, error);
      alert('Failed to load user pipelines. Check console for details.');
    } finally {
      setLoadingUserPipelines(false);
    }
  };

  const viewUserDetails = (user: any) => {
    setSelectedUser(user);
    setActiveUserTab('images');
    loadUserImages(user.id);
    loadUserPipelines(user.id);
  };

  const backToUsersList = () => {
    setSelectedUser(null);
    setUserImages([]);
    setUserPipelines([]);
    setActiveUserTab('images');
  };

  const fixOrphanedImages = async () => {
    if (!window.confirm('This will reassign all guest images to their rightful users based on session data. Continue?')) {
      return;
    }
    
    setFixingOrphans(true);
    try {
      const response = await axios.post(
        `${apiBase}/database/fix-orphaned-images`,
        {},
        { headers: {} }
      );
      
      alert(
        `✅ Fixed ${response.data.fixed} orphaned images!\n` +
        `Still orphaned: ${response.data.still_orphaned}\n\n` +
        `Refreshing data...`
      );
      
      // Reload all data to see updated counts
      await loadData();
      if (showUserData) {
        await loadDetailedData();
      }
    } catch (error: any) {
      console.error('Failed to fix orphaned images:', error);
      alert('Failed to fix orphaned images. Check console for details.');
    } finally {
      setFixingOrphans(false);
    }
  };

  const deleteUser = async (userId: number, userEmail: string) => {
    if (!window.confirm(`⚠️ WARNING: This will permanently delete the user "${userEmail}" and ALL their data:

• All uploaded images
• All processed images
• All saved pipelines
• All sessions

This action CANNOT be undone.

Type DELETE to confirm.`)) {
      return;
    }
    
    const confirmation = window.prompt('Type DELETE to confirm:');
    if (confirmation !== 'DELETE') {
      alert('Deletion cancelled.');
      return;
    }
    
    setDeletingUser(true);
    try {
      const response = await axios.delete(
        `${apiBase}/database/users/${userId}`,
        { 
          headers: {},
          params: { confirm: 'DELETE_USER' }
        }
      );
      
      alert(
        `✅ Successfully deleted user and all their data!\n\n` +
        `Images: ${response.data.deleted_images}\n` +
        `Pipelines: ${response.data.deleted_pipelines}\n` +
        `Sessions: ${response.data.deleted_sessions}\n\n` +
        `Refreshing...`
      );
      
      // Go back to users list and refresh
      backToUsersList();
      await loadData();
      await loadDetailedData();
    } catch (error: any) {
      console.error('Failed to delete user:', error);
      alert('Failed to delete user. Check console for details.');
    } finally {
      setDeletingUser(false);
    }
  };

  const deleteImage = async (imageId: number, filename: string) => {
    if (!window.confirm(`Delete image "${filename}"?\n\nThis will also delete any processed versions of this image.`)) {
      return;
    }
    
    setDeletingImage(imageId);
    try {
      await axios.delete(
        `${apiBase}/database/images/${imageId}`,
        { headers: {} }
      );
      
      // Refresh user images
      if (selectedUser) {
        await loadUserImages(selectedUser.id);
        // Also update the user's image count
        const updatedUser = { ...selectedUser, image_count: selectedUser.image_count - 1 };
        setSelectedUser(updatedUser);
      }
      await loadData();
    } catch (error: any) {
      console.error('Failed to delete image:', error);
      alert('Failed to delete image. Check console for details.');
    } finally {
      setDeletingImage(null);
    }
  };

  const deletePipeline = async (pipelineId: number, pipelineName: string) => {
    if (!window.confirm(`Delete pipeline "${pipelineName}"?\n\nThis action cannot be undone.`)) {
      return;
    }
    
    setDeletingPipeline(pipelineId);
    try {
      await axios.delete(
        `${apiBase}/database/pipelines/${pipelineId}`,
        { headers: {} }
      );
      
      // Refresh user pipelines
      if (selectedUser) {
        await loadUserPipelines(selectedUser.id);
        // Also update the user's pipeline count
        const updatedUser = { ...selectedUser, pipeline_count: selectedUser.pipeline_count - 1 };
        setSelectedUser(updatedUser);
      }
      await loadData();
    } catch (error: any) {
      console.error('Failed to delete pipeline:', error);
      alert('Failed to delete pipeline. Check console for details.');
    } finally {
      setDeletingPipeline(null);
    }
  };

  const deleteAllImages = async () => {
    if (!window.confirm('⚠️ WARNING: This will DELETE ALL IMAGES from the database!\n\nThis action CANNOT be undone.\n\nType DELETE in the next prompt to confirm.')) {
      return;
    }
    
    const confirmation = window.prompt('Type DELETE to confirm:');
    if (confirmation !== 'DELETE') {
      alert('Deletion cancelled.');
      return;
    }
    
    setDeletingAllImages(true);
    try {
      const response = await axios.post(
        `${apiBase}/database/delete-all-images`,
        {},
        { 
          headers: {},
          params: { confirm: 'DELETE_ALL_IMAGES' }
        }
      );
      
      alert(
        `✅ Successfully deleted ALL images!\n\n` +
        `Uploaded: ${response.data.deleted_uploaded}\n` +
        `Processed: ${response.data.deleted_processed}\n` +
        `Total: ${response.data.total_deleted}\n\n` +
        `Database is now clean. Refreshing...`
      );
      
      // Reload all data
      await loadData();
      if (showUserData) {
        await loadDetailedData();
      }
    } catch (error: any) {
      console.error('Failed to delete all images:', error);
      alert('Failed to delete images. Check console for details.');
    } finally {
      setDeletingAllImages(false);
    }
  };

  if (!isOpen || !editedSettings) return null;

  const hasChanges = settings && editedSettings && JSON.stringify(settings) !== JSON.stringify(editedSettings);

  return (
    <div className="fixed inset-0 bg-black/60 z-[300] flex items-center justify-center p-4">
      <div className="bg-white dark:bg-zinc-900 rounded-xl shadow-2xl w-full max-w-6xl h-[90vh] flex flex-col border-2 border-slate-300 dark:border-zinc-800">
        {/* Header */}
        <div className="flex-shrink-0 flex items-center justify-between p-6 border-b border-slate-300 dark:border-zinc-800">
          <div className="flex items-center space-x-3">
            <div className="w-10 h-10 bg-purple-100 dark:bg-purple-900/30 rounded-lg flex items-center justify-center">
              <Settings className="w-6 h-6 text-purple-600 dark:text-purple-400" />
            </div>
            <div>
              <h2 className="text-xl font-bold text-slate-900 dark:text-slate-50">Admin Tools</h2>
              <p className="text-sm text-slate-500 dark:text-slate-400">
                Last updated: {lastRefresh.toLocaleTimeString()} {refreshing && '• Updating...'}
              </p>
            </div>
          </div>
          <div className="flex items-center space-x-2">
            <button
              onClick={async () => {
                await loadData();
                // Also refresh detailed user data if viewing it
                if (showUserData && !selectedUser) {
                  await loadDetailedData();
                } else if (showUserData && selectedUser) {
                  // Refresh current user's images
                  await loadUserImages(selectedUser.id);
                }
              }}
              disabled={refreshing || loadingDetailedData || loadingUserImages}
              className="flex items-center space-x-2 px-3 py-2 bg-slate-100 dark:bg-zinc-800 hover:bg-slate-200 dark:hover:bg-zinc-700 text-slate-700 dark:text-slate-300 rounded-lg transition-colors disabled:opacity-50 text-sm"
              title="Refresh data"
            >
              <RefreshCw className={`w-4 h-4 ${(refreshing || loadingDetailedData || loadingUserImages) ? 'animate-spin' : ''}`} />
              <span>Refresh</span>
            </button>
            {hasChanges && (
              <button
                onClick={saveSettings}
                disabled={saving}
                className="flex items-center space-x-2 px-4 py-2 bg-green-600 hover:bg-green-700 text-white rounded-lg transition-colors disabled:opacity-50"
              >
                {saving ? (
                  <>
                    <RefreshCw className="w-4 h-4 animate-spin" />
                    <span>Saving...</span>
                  </>
                ) : saved ? (
                  <>
                    <Check className="w-4 h-4" />
                    <span>Saved!</span>
                  </>
                ) : (
                  <>
                    <Save className="w-4 h-4" />
                    <span>Save Changes</span>
                  </>
                )}
              </button>
            )}
            <button onClick={onClose} className="p-2 hover:bg-slate-100 dark:hover:bg-zinc-800 rounded-lg text-slate-700 dark:text-slate-300">
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* Tabs */}
        <div className="flex-shrink-0 flex space-x-1 p-4 border-b border-slate-300 dark:border-zinc-800 bg-slate-50 dark:bg-zinc-900/50 overflow-x-auto">
          {[
            { id: 'limits', icon: Settings, label: 'Limits' },
            { id: 'cleanup', icon: Trash2, label: 'Cleanup' },
            { id: 'storage', icon: HardDrive, label: 'Storage' },
            { id: 'retention', icon: Clock, label: 'Retention' },
            { id: 'database', icon: Database, label: 'Database', protected: true }
          ].map(tab => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id as any)}
              className={`px-4 py-2 rounded-md text-sm font-medium transition-colors whitespace-nowrap ${
                activeTab === tab.id
                  ? 'bg-white dark:bg-zinc-800 text-blue-600 dark:text-blue-400 shadow-sm'
                  : 'text-slate-600 dark:text-slate-400 hover:bg-white/50 dark:hover:bg-zinc-800/50'
              }`}
            >
              <tab.icon className="w-4 h-4 inline mr-2" />
              {tab.label}
              {tab.protected && <Lock className="w-3 h-3 inline ml-1" />}
            </button>
          ))}
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto p-6 min-h-0">
          {/* LIMITS TAB */}
          {activeTab === 'limits' && editedSettings && (
            <div className="space-y-6">
              <div className="bg-slate-50 dark:bg-zinc-800/50 rounded-lg p-3 mb-4">
                <p className="text-sm text-slate-700 dark:text-slate-300">
                  <strong>Current Behavior:</strong> Images persist until manually deleted or quota exceeded. Sessions stay active for 5 minutes after last heartbeat.
                </p>
              </div>

              {/* Pipeline Limits */}
              <div className="bg-white dark:bg-zinc-800 rounded-lg p-4 border border-slate-300 dark:border-zinc-700">
                <h3 className="text-lg font-semibold text-slate-900 dark:text-slate-50 mb-4">Pipeline Limits</h3>
                <div className="space-y-4">
                  <div>
                    <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-2">
                      Free Users - Max Saved Pipelines
                    </label>
                    <input
                      type="number"
                      min="1"
                      max="100"
                      value={editedSettings.user_limits.free_user_max_pipelines}
                      onChange={(e) => handleSettingChange('user_limits', 'free_user_max_pipelines', parseInt(e.target.value))}
                      className="w-full px-3 py-2 bg-white dark:bg-zinc-700 border border-slate-300 dark:border-zinc-600 rounded-md text-slate-900 dark:text-slate-50"
                    />
                    <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">
                      Current: {editedSettings.user_limits.free_user_max_pipelines} pipelines
                    </p>
                  </div>
                </div>
              </div>

              {/* Storage Quotas */}
              <div className="bg-white dark:bg-zinc-800 rounded-lg p-4 border border-slate-300 dark:border-zinc-700">
                <h3 className="text-lg font-semibold text-slate-900 dark:text-slate-50 mb-4">Storage Quotas</h3>
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-2">
                      Guest Users (MB)
                    </label>
                    <input
                      type="number"
                      min="10"
                      max="1000"
                      value={editedSettings.user_limits.guest_storage_quota_mb}
                      onChange={(e) => handleSettingChange('user_limits', 'guest_storage_quota_mb', parseInt(e.target.value))}
                      className="w-full px-3 py-2 bg-white dark:bg-zinc-700 border border-slate-300 dark:border-zinc-600 rounded-md text-slate-900 dark:text-slate-50"
                    />
                    <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">Current: {editedSettings.user_limits.guest_storage_quota_mb}MB</p>
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-2">
                      Registered Users (MB)
                    </label>
                    <input
                      type="number"
                      min="100"
                      max="10000"
                      value={editedSettings.user_limits.free_user_storage_quota_mb}
                      onChange={(e) => handleSettingChange('user_limits', 'free_user_storage_quota_mb', parseInt(e.target.value))}
                      className="w-full px-3 py-2 bg-white dark:bg-zinc-700 border border-slate-300 dark:border-zinc-600 rounded-md text-slate-900 dark:text-slate-50"
                    />
                    <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">Current: {editedSettings.user_limits.free_user_storage_quota_mb}MB</p>
                  </div>
                </div>
              </div>

              {/* Image Limits */}
              <div className="bg-white dark:bg-zinc-800 rounded-lg p-4 border border-slate-300 dark:border-zinc-700">
                <h3 className="text-lg font-semibold text-slate-900 dark:text-slate-50 mb-4">Image Upload Limits</h3>
                <div className="grid grid-cols-3 gap-4">
                  <div>
                    <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-2">
                      Guest Max Images/Session
                    </label>
                    <input
                      type="number"
                      min="10"
                      max="500"
                      value={editedSettings.user_limits.guest_max_images_per_session}
                      onChange={(e) => handleSettingChange('user_limits', 'guest_max_images_per_session', parseInt(e.target.value))}
                      className="w-full px-3 py-2 bg-white dark:bg-zinc-700 border border-slate-300 dark:border-zinc-600 rounded-md text-slate-900 dark:text-slate-50"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-2">
                      User Max Images/Session
                    </label>
                    <input
                      type="number"
                      min="50"
                      max="1000"
                      value={editedSettings.user_limits.free_user_max_images_per_session}
                      onChange={(e) => handleSettingChange('user_limits', 'free_user_max_images_per_session', parseInt(e.target.value))}
                      className="w-full px-3 py-2 bg-white dark:bg-zinc-700 border border-slate-300 dark:border-zinc-600 rounded-md text-slate-900 dark:text-slate-50"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-2">
                      Max Per Upload
                    </label>
                    <input
                      type="number"
                      min="5"
                      max="100"
                      value={editedSettings.user_limits.max_images_per_upload}
                      onChange={(e) => handleSettingChange('user_limits', 'max_images_per_upload', parseInt(e.target.value))}
                      className="w-full px-3 py-2 bg-white dark:bg-zinc-700 border border-slate-300 dark:border-zinc-600 rounded-md text-slate-900 dark:text-slate-50"
                    />
                  </div>
                </div>
              </div>

              {/* Quota Behavior */}
              <div className="bg-white dark:bg-zinc-800 rounded-lg p-4 border border-slate-300 dark:border-zinc-700">
                <h3 className="text-lg font-semibold text-slate-900 dark:text-slate-50 mb-4">Quota Behavior</h3>
                <div className="space-y-3">
                  <label className="flex items-start space-x-3">
                    <input
                      type="checkbox"
                      checked={editedSettings.cleanup.delete_oldest_on_quota}
                      onChange={(e) => handleSettingChange('cleanup', 'delete_oldest_on_quota', e.target.checked)}
                      className="w-5 h-5 mt-0.5 text-blue-600 rounded"
                    />
                    <div>
                      <p className="font-medium text-slate-900 dark:text-slate-50">Auto-delete oldest when quota exceeded</p>
                      <p className="text-sm text-slate-600 dark:text-slate-400">If OFF: Shows popup. If ON: Auto-deletes oldest images (NOT recommended)</p>
                    </div>
                  </label>
                  
                  <div>
                    <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-2">
                      Warn at Percentage (%)
                    </label>
                    <input
                      type="number"
                      min="50"
                      max="95"
                      value={editedSettings.cleanup.warn_at_percentage}
                      onChange={(e) => handleSettingChange('cleanup', 'warn_at_percentage', parseInt(e.target.value))}
                      className="w-full px-3 py-2 bg-white dark:bg-zinc-700 border border-slate-300 dark:border-zinc-600 rounded-md text-slate-900 dark:text-slate-50"
                    />
                    <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">Warn users when storage reaches this %</p>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* CLEANUP TAB */}
          {activeTab === 'cleanup' && editedSettings && (
            <div className="space-y-6">
              <div className="bg-slate-50 dark:bg-zinc-800/50 rounded-lg p-3 mb-4">
                <p className="text-sm text-slate-700 dark:text-slate-300">
                  <strong>Current Behavior:</strong> Tab close and logout do NOT delete data. Manual cleanup tools available below.
                </p>
              </div>

              <div className="bg-white dark:bg-zinc-800 rounded-lg p-4 border border-slate-300 dark:border-zinc-700">
                <h3 className="text-lg font-semibold text-slate-900 dark:text-slate-50 mb-4">Active Session Tracking</h3>
                <div className="space-y-3">
                  <div className="flex justify-between items-center">
                    <div>
                      <p className="font-medium text-slate-900 dark:text-slate-50">Active Window</p>
                      <p className="text-sm text-slate-600 dark:text-slate-400">Sessions with heartbeat in last 5 minutes</p>
                    </div>
                    <span className="text-lg font-bold text-blue-600 dark:text-blue-400">5 min</span>
                  </div>
                  <div className="flex justify-between items-center">
                    <div>
                      <p className="font-medium text-slate-900 dark:text-slate-50">Session Retention</p>
                      <p className="text-sm text-slate-600 dark:text-slate-400">How long to keep sessions in database</p>
                    </div>
                    <span className="text-lg font-bold text-purple-600 dark:text-purple-400">30 days</span>
                  </div>
                </div>
              </div>

              {/* Cleanup Stats */}
              {stats?.cleanup && (
                <div className="bg-white dark:bg-zinc-800 rounded-lg p-4 border border-slate-300 dark:border-zinc-700">
                  <h3 className="text-lg font-semibold text-slate-900 dark:text-slate-50 mb-2">Manual Cleanup Tools</h3>
                  <p className="text-sm text-slate-600 dark:text-slate-400 mb-4">
                    These items can be manually removed. Automatic cleanup runs daily in background.
                  </p>
                  <div className="grid grid-cols-2 gap-4 mb-4">
                    <div className="bg-red-50 dark:bg-red-900/20 rounded-lg p-3">
                      <p className="text-sm text-red-800 dark:text-red-300">Expired Sessions</p>
                      <p className="text-3xl font-bold text-red-900 dark:text-red-200">
                        {stats.cleanup.expired_sessions || 0}
                      </p>
                    </div>
                    <div className="bg-orange-50 dark:bg-orange-900/20 rounded-lg p-3">
                      <p className="text-sm text-orange-800 dark:text-orange-300">Orphaned Images</p>
                      <p className="text-3xl font-bold text-orange-900 dark:text-orange-200">
                        {stats.cleanup.orphaned_images || 0}
                      </p>
                    </div>
                  </div>

                  <button
                    onClick={runCleanup}
                    disabled={loading}
                    className="w-full flex items-center justify-center space-x-2 px-4 py-3 bg-red-600 hover:bg-red-700 text-white rounded-lg transition-colors disabled:opacity-50 font-medium"
                  >
                    {loading ? (
                      <>
                        <RefreshCw className="w-5 h-5 animate-spin" />
                        <span>Running...</span>
                      </>
                    ) : (
                      <>
                        <Trash2 className="w-5 h-5" />
                        <span>Run Cleanup Now</span>
                      </>
                    )}
                  </button>
                </div>
              )}
            </div>
          )}

          {/* STORAGE TAB */}
          {activeTab === 'storage' && databaseData && (
            <div className="space-y-6">
              <div className="bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded-lg p-4">
                <div className="flex items-start space-x-2">
                  <LucideReact.Activity className="w-5 h-5 text-blue-600 dark:text-blue-400 mt-0.5" />
                  <div>
                    <p className="text-sm text-blue-800 dark:text-blue-300">
                      <strong>Active Sessions</strong> = Tabs with heartbeat in last 5 minutes<br />
                      Green "Live" indicator shows heartbeat is active. Sessions persist for 30 days.
                    </p>
                  </div>
                </div>
              </div>

              <div className="grid grid-cols-4 gap-4">
                <div className="bg-blue-100 dark:bg-blue-900/30 rounded-lg p-4">
                  <p className="text-sm text-blue-800 dark:text-blue-300 mb-1">Uploaded</p>
                  <p className="text-3xl font-bold text-blue-900 dark:text-blue-200">
                    {databaseData.images?.uploaded || 0}
                  </p>
                </div>
                <div className="bg-purple-100 dark:bg-purple-900/30 rounded-lg p-4">
                  <p className="text-sm text-purple-800 dark:text-purple-300 mb-1">Processed</p>
                  <p className="text-3xl font-bold text-purple-900 dark:text-purple-200">
                    {databaseData.images?.processed || 0}
                  </p>
                </div>
                <div className="bg-green-100 dark:bg-green-900/30 rounded-lg p-4">
                  <p className="text-sm text-green-800 dark:text-green-300 mb-1">Storage</p>
                  <p className="text-3xl font-bold text-green-900 dark:text-green-200">
                    {databaseData.storage?.total_mb || 0}MB
                  </p>
                </div>
                <div className="bg-orange-100 dark:bg-orange-900/30 rounded-lg p-4">
                  <p className="text-sm text-orange-800 dark:text-orange-300 mb-1">Sessions</p>
                  <p className="text-3xl font-bold text-orange-900 dark:text-orange-200">
                    {databaseData.sessions?.active || 0}
                  </p>
                </div>
              </div>

              <div className="bg-white dark:bg-zinc-800 rounded-lg p-4 border border-slate-300 dark:border-zinc-700">
                <div className="flex items-center justify-between mb-4">
                  <h3 className="text-lg font-semibold text-slate-900 dark:text-slate-50">Breakdown</h3>
                  <button
                    onClick={loadData}
                    disabled={refreshing}
                    className="px-2 py-1 text-xs bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-300 hover:bg-blue-200 dark:hover:bg-blue-900/50 rounded transition-colors disabled:opacity-50"
                  >
                    <RefreshCw className={`w-3 h-3 inline mr-1 ${refreshing ? 'animate-spin' : ''}`} />
                    Refresh
                  </button>
                </div>
                <div className="space-y-2 text-sm">
                  <div className="flex justify-between">
                    <span className="text-slate-600 dark:text-slate-400">Guest Images:</span>
                    <span className="font-medium text-slate-900 dark:text-slate-50">{databaseData.images?.guest_images || 0}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-slate-600 dark:text-slate-400">User Images:</span>
                    <span className="font-medium text-slate-900 dark:text-slate-50">{databaseData.images?.user_images || 0}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-slate-600 dark:text-slate-400">Total Users:</span>
                    <span className="font-medium text-slate-900 dark:text-slate-50">{databaseData.users?.total || 0}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-slate-600 dark:text-slate-400">Total Pipelines:</span>
                    <span className="font-medium text-slate-900 dark:text-slate-50">{databaseData.pipelines?.total || 0}</span>
                  </div>
                </div>
                
                {/* Fix Orphaned Images Button */}
                {(databaseData.images?.guest_images || 0) > 0 && (
                  <div className="mt-4 pt-4 border-t border-slate-200 dark:border-zinc-700">
                    <div className="bg-yellow-50 dark:bg-yellow-900/20 rounded-lg p-3 mb-3">
                      <p className="text-xs text-yellow-800 dark:text-yellow-300">
                        ⚠️ <strong>{databaseData.images.guest_images} guest images</strong> found. These may be from logged-in users before the recent fix.
                      </p>
                    </div>
                    <button
                      onClick={fixOrphanedImages}
                      disabled={fixingOrphans}
                      className="w-full flex items-center justify-center space-x-2 px-4 py-2 bg-orange-600 hover:bg-orange-700 text-white rounded-lg transition-colors disabled:opacity-50 text-sm font-medium"
                    >
                      {fixingOrphans ? (
                        <>
                          <RefreshCw className="w-4 h-4 animate-spin" />
                          <span>Fixing...</span>
                        </>
                      ) : (
                        <>
                          <LucideReact.Link className="w-4 h-4" />
                          <span>Fix Orphaned Images</span>
                        </>
                      )}
                    </button>
                    <p className="text-xs text-slate-500 dark:text-slate-400 mt-2 text-center">
                      This will link guest images to users based on their sessions
                    </p>
                  </div>
                )}
                
                {/* Delete All Images Button */}
                <div className="mt-4 pt-4 border-t border-slate-200 dark:border-zinc-700">
                  <div className="bg-red-50 dark:bg-red-900/20 rounded-lg p-3 mb-3">
                    <p className="text-xs text-red-800 dark:text-red-300">
                      ⚠️ <strong>Danger Zone:</strong> Delete all images from database
                    </p>
                  </div>
                  <button
                    onClick={deleteAllImages}
                    disabled={deletingAllImages}
                    className="w-full flex items-center justify-center space-x-2 px-4 py-2 bg-red-600 hover:bg-red-700 text-white rounded-lg transition-colors disabled:opacity-50 text-sm font-medium"
                  >
                    {deletingAllImages ? (
                      <>
                        <RefreshCw className="w-4 h-4 animate-spin" />
                        <span>Deleting...</span>
                      </>
                    ) : (
                      <>
                        <Trash2 className="w-4 h-4" />
                        <span>Delete ALL Images</span>
                      </>
                    )}
                  </button>
                  <p className="text-xs text-slate-500 dark:text-slate-400 mt-2 text-center">
                    Permanently deletes all uploaded and processed images
                  </p>
                </div>
              </div>
            </div>
          )}

          {/* RETENTION TAB */}
          {activeTab === 'retention' && editedSettings && (
            <div className="space-y-6">
              <div className="bg-purple-50 dark:bg-purple-900/20 border border-purple-200 dark:border-purple-800 rounded-lg p-4">
                <p className="text-sm text-purple-800 dark:text-purple-300">
                  📅 <strong>Real-World Retention Policy</strong><br />
                  Guest images: 30 days • User images: 90 days • Processed images: 7-30 days<br />
                  Background cleanup jobs handle old data automatically.
                </p>
              </div>

              <div className="bg-white dark:bg-zinc-800 rounded-lg p-4 border border-slate-300 dark:border-zinc-700">
                <h3 className="text-lg font-semibold text-slate-900 dark:text-slate-50 mb-4">Upload Retention (Days)</h3>
                <p className="text-sm text-slate-600 dark:text-slate-400 mb-3">How long to keep uploaded images before automatic cleanup</p>
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-2">
                      Guest (hours)
                    </label>
                    <input
                      type="number"
                      min="1"
                      max="168"
                      value={editedSettings.retention.guest_upload_retention_hours}
                      onChange={(e) => handleSettingChange('retention', 'guest_upload_retention_hours', parseInt(e.target.value))}
                      className="w-full px-3 py-2 bg-white dark:bg-zinc-700 border border-slate-300 dark:border-zinc-600 rounded-md text-slate-900 dark:text-slate-50"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-2">
                      Users (days)
                    </label>
                    <input
                      type="number"
                      min="1"
                      max="365"
                      value={editedSettings.retention.free_user_upload_retention_days}
                      onChange={(e) => handleSettingChange('retention', 'free_user_upload_retention_days', parseInt(e.target.value))}
                      className="w-full px-3 py-2 bg-white dark:bg-zinc-700 border border-slate-300 dark:border-zinc-600 rounded-md text-slate-900 dark:text-slate-50"
                    />
                  </div>
                </div>
              </div>

              <div className="bg-white dark:bg-zinc-800 rounded-lg p-4 border border-slate-300 dark:border-zinc-700">
                <h3 className="text-lg font-semibold text-slate-900 dark:text-slate-50 mb-4">Processed Image Retention (Days)</h3>
                <p className="text-sm text-slate-600 dark:text-slate-400 mb-3">Processed results can be regenerated, so shorter retention periods</p>
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-2">
                      Guest (hours)
                    </label>
                    <input
                      type="number"
                      min="1"
                      max="168"
                      value={editedSettings.retention.guest_processed_retention_hours}
                      onChange={(e) => handleSettingChange('retention', 'guest_processed_retention_hours', parseInt(e.target.value))}
                      className="w-full px-3 py-2 bg-white dark:bg-zinc-700 border border-slate-300 dark:border-zinc-600 rounded-md text-slate-900 dark:text-slate-50"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-2">
                      Users (hours)
                    </label>
                    <input
                      type="number"
                      min="1"
                      max="168"
                      value={editedSettings.retention.free_user_processed_retention_hours}
                      onChange={(e) => handleSettingChange('retention', 'free_user_processed_retention_hours', parseInt(e.target.value))}
                      className="w-full px-3 py-2 bg-white dark:bg-zinc-700 border border-slate-300 dark:border-zinc-600 rounded-md text-slate-900 dark:text-slate-50"
                    />
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* DATABASE TAB - PIN PROTECTED */}
          {activeTab === 'database' && (
            <div className="space-y-6">
              <div className="bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg p-4">
                <div className="flex items-start space-x-3">
                  <Shield className="w-5 h-5 text-red-600 dark:text-red-400 mt-0.5" />
                  <div>
                    <p className="font-medium text-red-800 dark:text-red-300 mb-1">Sensitive Data Area - PIN Protected</p>
                    <p className="text-sm text-red-700 dark:text-red-400">
                      View user emails, sessions, and images. Sessions are kept for 30 days and show as "active" if heartbeat received in last 5 minutes.
                    </p>
                  </div>
                </div>
              </div>

              {/* PIN Protected Toggle */}
              <div className="bg-white dark:bg-zinc-800 rounded-lg p-4 border border-slate-300 dark:border-zinc-700">
                <div className="flex items-center justify-between">
                  <div>
                    <h3 className="text-lg font-semibold text-slate-900 dark:text-slate-50">View User Data</h3>
                    <p className="text-sm text-slate-600 dark:text-slate-400">Show emails, sessions, and uploaded images</p>
                  </div>
                  <label className="relative inline-block w-12 h-6">
                    <input
                      type="checkbox"
                      checked={showUserData}
                      onChange={handleToggleUserData}
                      className="sr-only peer"
                    />
                    <div className="w-full h-full bg-slate-300 dark:bg-zinc-700 peer-checked:bg-blue-600 rounded-full peer transition-all cursor-pointer"></div>
                    <div className="absolute top-0.5 left-0.5 bg-white w-5 h-5 rounded-full transition-all peer-checked:translate-x-6"></div>
                  </label>
                </div>
              </div>

              {/* Database Overview (always visible) */}
              {databaseData && (
                <div className="grid grid-cols-3 gap-4">
                  <div className="bg-blue-50 dark:bg-blue-900/20 rounded-lg p-4">
                    <p className="text-sm text-blue-800 dark:text-blue-300 mb-1">Total Users</p>
                    <p className="text-3xl font-bold text-blue-900 dark:text-blue-200">{databaseData.users?.total || 0}</p>
                  </div>
                  <div className="bg-green-50 dark:bg-green-900/20 rounded-lg p-4">
                    <p className="text-sm text-green-800 dark:text-green-300 mb-1">Active Sessions</p>
                    <p className="text-3xl font-bold text-green-900 dark:text-green-200">{databaseData.sessions?.active || 0}</p>
                  </div>
                  <div className="bg-purple-50 dark:bg-purple-900/20 rounded-lg p-4">
                    <p className="text-sm text-purple-800 dark:text-purple-300 mb-1">Total Pipelines</p>
                    <p className="text-3xl font-bold text-purple-900 dark:text-purple-200">{databaseData.pipelines?.total || 0}</p>
                  </div>
                </div>
              )}
              
              {/* Show message when toggle is on but no data */}
              {showUserData && !loadingDetailedData && databaseData && (!databaseData.detailed_users || databaseData.detailed_users.length === 0) && (
                <div className="bg-white dark:bg-zinc-800 rounded-lg p-4 border border-slate-300 dark:border-zinc-700">
                  <div className="text-center py-12">
                    <Database className="w-16 h-16 mx-auto mb-4 text-slate-400 dark:text-slate-600" />
                    <h3 className="text-lg font-semibold text-slate-900 dark:text-slate-50 mb-2">No User Data Available</h3>
                    <p className="text-sm text-slate-600 dark:text-slate-400 mb-4">
                      The database is empty. Create a user account to see data here.
                    </p>
                    <p className="text-xs text-slate-500 dark:text-slate-500">
                      Tip: Register a new account or use OAuth login to populate the database.
                    </p>
                  </div>
                </div>
              )}
              
              {/* Loading indicator */}
              {showUserData && loadingDetailedData && (
                <div className="bg-white dark:bg-zinc-800 rounded-lg p-4 border border-slate-300 dark:border-zinc-700">
                  <div className="text-center py-12">
                    <RefreshCw className="w-16 h-16 mx-auto mb-4 text-blue-600 dark:text-blue-400 animate-spin" />
                    <h3 className="text-lg font-semibold text-slate-900 dark:text-slate-50 mb-2">Loading Database Details...</h3>
                    <p className="text-sm text-slate-600 dark:text-slate-400">
                      Fetching user data from the database
                    </p>
                  </div>
                </div>
              )}

              {/* Users List View */}
              {showUserData && !selectedUser && databaseData?.detailed_users && databaseData.detailed_users.length > 0 && (
                <div className="bg-white dark:bg-zinc-800 rounded-lg p-4 border border-slate-300 dark:border-zinc-700">
                  <h3 className="text-lg font-semibold text-slate-900 dark:text-slate-50 mb-4">Users Overview</h3>
                  <p className="text-sm text-slate-600 dark:text-slate-400 mb-4">Click on a user to view their uploaded images</p>
                  <div className="overflow-x-auto">
                    <table className="w-full text-sm">
                      <thead className="bg-slate-100 dark:bg-zinc-700">
                        <tr>
                          <th className="px-3 py-2 text-left text-slate-700 dark:text-slate-300">Email</th>
                          <th className="px-3 py-2 text-left text-slate-700 dark:text-slate-300">Username</th>
                          <th className="px-3 py-2 text-left text-slate-700 dark:text-slate-300">Type</th>
                          <th className="px-3 py-2 text-right text-slate-700 dark:text-slate-300">Images</th>
                          <th className="px-3 py-2 text-right text-slate-700 dark:text-slate-300">Pipelines</th>
                          <th className="px-3 py-2 text-center text-slate-700 dark:text-slate-300">Action</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-200 dark:divide-zinc-700">
                        {databaseData.detailed_users.map((user: any) => (
                          <tr key={user.id} className="hover:bg-slate-50 dark:hover:bg-zinc-700/50">
                            <td className="px-3 py-2 text-slate-900 dark:text-slate-50">{user.email}</td>
                            <td className="px-3 py-2 text-slate-900 dark:text-slate-50">{user.username}</td>
                            <td className="px-3 py-2">
                              {user.is_admin ? (
                                <span className="px-2 py-0.5 bg-purple-100 dark:bg-purple-900/30 text-purple-700 dark:text-purple-300 rounded text-xs">Admin</span>
                              ) : user.oauth_provider ? (
                                <span className="px-2 py-0.5 bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-300 rounded text-xs">OAuth</span>
                              ) : (
                                <span className="px-2 py-0.5 bg-slate-100 dark:bg-zinc-700 text-slate-700 dark:text-slate-300 rounded text-xs">Regular</span>
                              )}
                            </td>
                            <td className="px-3 py-2 text-right">
                              <span className={`font-medium ${
                                user.image_count > 0 ? 'text-blue-600 dark:text-blue-400' : 'text-slate-400 dark:text-slate-600'
                              }`}>
                                {user.image_count}
                              </span>
                            </td>
                            <td className="px-3 py-2 text-right text-slate-900 dark:text-slate-50">{user.pipeline_count}</td>
                            <td className="px-3 py-2 text-center">
                              <button
                                onClick={() => viewUserDetails(user)}
                                className="px-3 py-1 bg-blue-600 hover:bg-blue-700 text-white rounded text-xs transition-colors font-medium"
                              >
                                View Details
                              </button>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}

              {/* Detailed User View */}
              {showUserData && selectedUser && (
                <div className="bg-white dark:bg-zinc-800 rounded-lg p-4 border border-slate-300 dark:border-zinc-700">
                  {/* User Header */}
                  <div className="flex items-center justify-between mb-6 pb-4 border-b border-slate-200 dark:border-zinc-700">
                    <div className="flex items-center space-x-4">
                      <button
                        onClick={backToUsersList}
                        className="p-2 hover:bg-slate-100 dark:hover:bg-zinc-700 rounded-lg text-slate-600 dark:text-slate-400 transition-colors"
                      >
                        <LucideReact.ArrowLeft className="w-5 h-5" />
                      </button>
                      <div>
                        <h3 className="text-xl font-bold text-slate-900 dark:text-slate-50">{selectedUser.email}</h3>
                        <div className="flex items-center space-x-3 mt-1">
                          <span className="text-sm text-slate-600 dark:text-slate-400">@{selectedUser.username}</span>
                          {selectedUser.is_admin && (
                            <span className="px-2 py-0.5 bg-purple-100 dark:bg-purple-900/30 text-purple-700 dark:text-purple-300 rounded text-xs font-medium">Admin</span>
                          )}
                          {selectedUser.oauth_provider && (
                            <span className="px-2 py-0.5 bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-300 rounded text-xs font-medium">
                              {selectedUser.oauth_provider} OAuth
                            </span>
                          )}
                        </div>
                      </div>
                    </div>
                    <div className="flex items-center space-x-6">
                      <div className="text-center">
                        <p className="text-2xl font-bold text-blue-600 dark:text-blue-400">{selectedUser.image_count}</p>
                        <p className="text-xs text-slate-600 dark:text-slate-400">Images</p>
                      </div>
                      <div className="text-center">
                        <p className="text-2xl font-bold text-purple-600 dark:text-purple-400">{selectedUser.pipeline_count}</p>
                        <p className="text-xs text-slate-600 dark:text-slate-400">Pipelines</p>
                      </div>
                      <button
                        onClick={() => deleteUser(selectedUser.id, selectedUser.email)}
                        disabled={deletingUser}
                        className="px-4 py-2 bg-red-600 hover:bg-red-700 text-white rounded-lg transition-colors disabled:opacity-50 flex items-center space-x-2 text-sm font-medium"
                      >
                        {deletingUser ? (
                          <>
                            <RefreshCw className="w-4 h-4 animate-spin" />
                            <span>Deleting...</span>
                          </>
                        ) : (
                          <>
                            <Trash2 className="w-4 h-4" />
                            <span>Delete User</span>
                          </>
                        )}
                      </button>
                    </div>
                  </div>

                  {/* Tabs for Images and Pipelines */}
                  <div className="flex space-x-2 mb-6 border-b border-slate-200 dark:border-zinc-700">
                    <button
                      onClick={() => setActiveUserTab('images')}
                      className={`px-4 py-2 text-sm font-medium transition-colors border-b-2 -mb-px ${
                        activeUserTab === 'images'
                          ? 'border-blue-600 text-blue-600 dark:border-blue-400 dark:text-blue-400'
                          : 'border-transparent text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-200'
                      }`}
                    >
                      <LucideReact.Image className="w-4 h-4 inline mr-2" />
                      Images ({selectedUser.image_count})
                    </button>
                    <button
                      onClick={() => setActiveUserTab('pipelines')}
                      className={`px-4 py-2 text-sm font-medium transition-colors border-b-2 -mb-px ${
                        activeUserTab === 'pipelines'
                          ? 'border-purple-600 text-purple-600 dark:border-purple-400 dark:text-purple-400'
                          : 'border-transparent text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-200'
                      }`}
                    >
                      <LucideReact.Workflow className="w-4 h-4 inline mr-2" />
                      Pipelines ({selectedUser.pipeline_count})
                    </button>
                  </div>

                  {/* Images Tab Content */}
                  {activeUserTab === 'images' && (
                    loadingUserImages ? (
                      <div className="text-center py-12">
                        <RefreshCw className="w-12 h-12 mx-auto mb-4 text-blue-600 dark:text-blue-400 animate-spin" />
                        <p className="text-sm text-slate-600 dark:text-slate-400">Loading user images...</p>
                      </div>
                    ) : userImages.length > 0 ? (
                      <div>
                        <div className="flex items-center justify-between mb-4">
                          <h4 className="font-semibold text-slate-900 dark:text-slate-50">Uploaded Images ({userImages.length})</h4>
                        </div>
                        <div className="grid grid-cols-5 gap-4">
                          {userImages.map((img: any) => (
                            <div key={img.id} className="bg-slate-50 dark:bg-zinc-700 rounded-lg p-3 border border-slate-200 dark:border-zinc-600 hover:shadow-lg transition-shadow relative group">
                              <div className="aspect-square bg-white dark:bg-zinc-600 rounded mb-2 overflow-hidden flex items-center justify-center">
                                {img.thumbnail_url ? (
                                  <img 
                                    src={img.thumbnail_url} 
                                    alt={img.filename}
                                    className="w-full h-full object-cover"
                                    onError={(e) => {
                                      console.error('Image load error for:', img.filename);
                                      (e.target as HTMLImageElement).style.display = 'none';
                                    }}
                                  />
                                ) : (
                                  <LucideReact.Image className="w-12 h-12 text-slate-400 dark:text-slate-600" />
                                )}
                              </div>
                              <p className="text-xs text-slate-900 dark:text-slate-50 truncate font-medium mb-1" title={img.filename}>
                                {img.filename}
                              </p>
                              <div className="space-y-0.5 mb-2">
                                <p className="text-xs text-slate-600 dark:text-slate-400">
                                  {img.dimensions}
                                </p>
                                <p className="text-xs text-slate-600 dark:text-slate-400">
                                  {img.size_mb}MB • {img.format}
                                </p>
                                <p className="text-xs text-slate-500 dark:text-slate-500">
                                  {new Date(img.uploaded_at).toLocaleDateString()}
                                </p>
                              </div>
                              <button
                                onClick={() => deleteImage(img.id, img.filename)}
                                disabled={deletingImage === img.id}
                                className="w-full px-2 py-1 bg-red-600 hover:bg-red-700 text-white rounded text-xs transition-colors disabled:opacity-50 flex items-center justify-center space-x-1"
                              >
                                {deletingImage === img.id ? (
                                  <>
                                    <RefreshCw className="w-3 h-3 animate-spin" />
                                    <span>Deleting...</span>
                                  </>
                                ) : (
                                  <>
                                    <Trash2 className="w-3 h-3" />
                                    <span>Delete</span>
                                  </>
                                )}
                              </button>
                            </div>
                          ))}
                        </div>
                      </div>
                    ) : (
                      <div className="text-center py-12">
                        <LucideReact.Image className="w-16 h-16 mx-auto mb-4 text-slate-300 dark:text-slate-700" />
                        <p className="text-sm text-slate-600 dark:text-slate-400">This user hasn't uploaded any images yet</p>
                      </div>
                    )
                  )}

                  {/* Pipelines Tab Content */}
                  {activeUserTab === 'pipelines' && (
                    loadingUserPipelines ? (
                      <div className="text-center py-12">
                        <RefreshCw className="w-12 h-12 mx-auto mb-4 text-purple-600 dark:text-purple-400 animate-spin" />
                        <p className="text-sm text-slate-600 dark:text-slate-400">Loading user pipelines...</p>
                      </div>
                    ) : userPipelines.length > 0 ? (
                      <div>
                        <div className="flex items-center justify-between mb-4">
                          <h4 className="font-semibold text-slate-900 dark:text-slate-50">Saved Pipelines ({userPipelines.length})</h4>
                        </div>
                        <div className="space-y-3">
                          {userPipelines.map((pipeline: any) => (
                            <div key={pipeline.id} className="bg-slate-50 dark:bg-zinc-700 rounded-lg p-4 border border-slate-200 dark:border-zinc-600 hover:shadow-md transition-shadow">
                              <div className="flex items-start justify-between">
                                <div className="flex-1">
                                  <h5 className="font-semibold text-slate-900 dark:text-slate-50 mb-1">{pipeline.name}</h5>
                                  {pipeline.description && (
                                    <p className="text-sm text-slate-600 dark:text-slate-400 mb-2">{pipeline.description}</p>
                                  )}
                                  <div className="flex items-center space-x-4 text-xs text-slate-500 dark:text-slate-500">
                                    <span>📅 Created: {new Date(pipeline.created_at).toLocaleDateString()}</span>
                                    <span>🔄 Updated: {new Date(pipeline.updated_at).toLocaleDateString()}</span>
                                    <span>🔧 {pipeline.operation_count || 0} operations</span>
                                  </div>
                                </div>
                                <button
                                  onClick={() => deletePipeline(pipeline.id, pipeline.name)}
                                  disabled={deletingPipeline === pipeline.id}
                                  className="ml-4 px-3 py-1.5 bg-red-600 hover:bg-red-700 text-white rounded text-xs transition-colors disabled:opacity-50 flex items-center space-x-1"
                                >
                                  {deletingPipeline === pipeline.id ? (
                                    <>
                                      <RefreshCw className="w-3 h-3 animate-spin" />
                                      <span>Deleting...</span>
                                    </>
                                  ) : (
                                    <>
                                      <Trash2 className="w-3 h-3" />
                                      <span>Delete</span>
                                    </>
                                  )}
                                </button>
                              </div>
                            </div>
                          ))}
                        </div>
                      </div>
                    ) : (
                      <div className="text-center py-12">
                        <LucideReact.Workflow className="w-16 h-16 mx-auto mb-4 text-slate-300 dark:text-slate-700" />
                        <p className="text-sm text-slate-600 dark:text-slate-400">This user hasn't saved any pipelines yet</p>
                      </div>
                    )
                  )}
                </div>
              )}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="p-4 border-t border-slate-300 dark:border-zinc-800 bg-slate-50 dark:bg-zinc-900/50 flex items-center justify-between">
          <div className="text-xs text-slate-500 dark:text-slate-400">
            {settings?.meta?.updated_at && (
              <span>Last updated: {new Date(settings.meta.updated_at).toLocaleString()}</span>
            )}
          </div>
          {hasChanges && (
            <p className="text-sm text-orange-600 dark:text-orange-400 font-medium animate-pulse">
              ● Unsaved changes
            </p>
          )}
        </div>
      </div>

      {/* PIN Dialog */}
      {showPinDialog && (
        <div className="fixed inset-0 bg-black/80 z-[400] flex items-center justify-center p-4">
          <div className="bg-white dark:bg-zinc-900 rounded-xl shadow-2xl max-w-md w-full p-6">
            <div className="text-center mb-6">
              <div className="w-16 h-16 bg-purple-100 dark:bg-purple-900/30 rounded-full flex items-center justify-center mx-auto mb-4">
                <Lock className="w-8 h-8 text-purple-600 dark:text-purple-400" />
              </div>
              <h3 className="text-xl font-bold text-slate-900 dark:text-slate-50 mb-2">
                {hasPinSet ? 'Enter Your Admin PIN' : 'Create Your Admin PIN'}
              </h3>
              <p className="text-sm text-slate-600 dark:text-slate-400">
                {hasPinSet 
                  ? 'Enter the 4-6 digit PIN you created earlier to access sensitive user data'
                  : 'Create a 4-6 digit PIN to protect access to sensitive user data. You\'ll need this PIN every time you want to view the database.'}
              </p>
            </div>

            <input
              type="password"
              inputMode="numeric"
              maxLength={6}
              value={pin}
              onChange={(e) => setPin(e.target.value.replace(/\D/g, ''))}
              placeholder={hasPinSet ? "Enter your PIN" : "Create a PIN (4-6 digits)"}
              className="w-full px-4 py-3 bg-white dark:bg-zinc-800 border-2 border-slate-300 dark:border-zinc-700 rounded-lg text-center text-2xl tracking-widest mb-6 text-slate-900 dark:text-slate-50"
              autoFocus
              onKeyPress={(e) => {
                if (e.key === 'Enter' && pin.length >= 4) {
                  handlePinSubmit();
                }
              }}
            />

            <div className="flex space-x-3">
              <button
                onClick={() => {
                  setShowPinDialog(false);
                  setPin('');
                  setShowUserData(false); // Turn toggle back off if user cancels
                }}
                className="flex-1 px-4 py-2 bg-slate-200 dark:bg-zinc-700 hover:bg-slate-300 dark:hover:bg-zinc-600 rounded-lg text-slate-900 dark:text-slate-50"
              >
                Cancel
              </button>
              <button
                onClick={handlePinSubmit}
                disabled={pin.length < 4}
                className="flex-1 px-4 py-2 bg-purple-600 hover:bg-purple-700 text-white rounded-lg disabled:opacity-50"
              >
                {hasPinSet ? 'Verify PIN' : 'Create PIN'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
