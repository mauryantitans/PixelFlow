import React, { useState, useEffect } from 'react';
import { X, FolderOpen, Users, Lock, Calendar, Layers, Trash2, Edit2, Copy, Eye, EyeOff } from 'lucide-react';
import { useDialog } from '../hooks/useDialog';
import { handleTabListKeyDown } from '../utils/tabs';
import { pipelineService } from '../services/auth';
import { SavedPipeline } from '../types';

interface LoadPipelineModalProps {
  isOpen: boolean;
  onClose: () => void;
  onLoadPipeline: (pipeline: SavedPipeline) => void;
}

export const LoadPipelineModal: React.FC<LoadPipelineModalProps> = ({
  isOpen,
  onClose,
  onLoadPipeline,
}) => {
  const [userPipelines, setUserPipelines] = useState<SavedPipeline[]>([]);
  const [publicPipelines, setPublicPipelines] = useState<SavedPipeline[]>([]);
  const [activeTab, setActiveTab] = useState<'my' | 'public'>('my');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [notification, setNotification] = useState('');

  useEffect(() => {
    if (isOpen) {
      loadPipelines();
    }
  }, [isOpen, activeTab]);

  const loadPipelines = async () => {
    setLoading(true);
    setError('');

    try {
      if (activeTab === 'my') {
        const pipelines = await pipelineService.getUserPipelines();
        setUserPipelines(pipelines);
      } else {
        const pipelines = await pipelineService.getPublicPipelines();
        setPublicPipelines(pipelines);
      }
    } catch (err: any) {
      console.error('Failed to load pipelines:', err);
      setError(err.response?.data?.detail || 'Failed to load pipelines');
    } finally {
      setLoading(false);
    }
  };

  const handleLoadPipeline = (pipeline: SavedPipeline, e: React.MouseEvent) => {
    e.stopPropagation();
    onLoadPipeline(pipeline);
    onClose();
  };

  const handleDelete = async (pipelineId: number, e: React.MouseEvent) => {
    e.stopPropagation();
    
    if (!window.confirm('Are you sure you want to delete this pipeline?')) {
      return;
    }

    try {
      await pipelineService.deletePipeline(pipelineId);
      showNotification('Pipeline deleted');
      loadPipelines(); // Reload list
    } catch (err: any) {
      console.error('Failed to delete pipeline:', err);
      setError(err.response?.data?.detail || 'Failed to delete pipeline');
    }
  };

  const handleTogglePublic = async (pipeline: SavedPipeline, e: React.MouseEvent) => {
    e.stopPropagation();

    try {
      await pipelineService.updatePipeline(pipeline.id, {
        is_public: !pipeline.is_public,
      });
      showNotification(pipeline.is_public ? 'Made private' : 'Made public');
      loadPipelines(); // Reload list
    } catch (err: any) {
      console.error('Failed to update pipeline:', err);
      setError(err.response?.data?.detail || 'Failed to update pipeline');
    }
  };

  const handleDuplicate = async (pipeline: SavedPipeline, e: React.MouseEvent) => {
    e.stopPropagation();
    
    const newName = window.prompt('Enter name for duplicated pipeline:', `${pipeline.name} (Copy)`);
    if (!newName) return;

    try {
      await pipelineService.duplicatePipeline(pipeline.id, newName);
      showNotification('Pipeline duplicated');
      if (activeTab === 'my') {
        loadPipelines(); // Reload to show new pipeline
      }
    } catch (err: any) {
      console.error('Failed to duplicate pipeline:', err);
      setError(err.response?.data?.detail || 'Failed to duplicate pipeline');
    }
  };

  const showNotification = (message: string) => {
    setNotification(message);
    setTimeout(() => setNotification(''), 2000);
  };

  const formatDate = (dateString: string) => {
    const date = new Date(dateString);
    return date.toLocaleDateString('en-US', { 
      month: 'short', 
      day: 'numeric', 
      year: 'numeric' 
    });
  };

  const dialogRef = useDialog<HTMLDivElement>(isOpen, onClose);

  if (!isOpen) return null;

  const pipelines = activeTab === 'my' ? userPipelines : publicPipelines;

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-[100] p-4">
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby="load-pipeline-title"
        tabIndex={-1}
        className="bg-white rounded-lg shadow-xl max-w-3xl w-full max-h-[90vh] flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between p-6 border-b border-gray-200">
          <div className="flex items-center space-x-2">
            <FolderOpen aria-hidden="true" className="w-5 h-5 text-blue-600" />
            <h2 id="load-pipeline-title" className="text-xl font-bold text-gray-900">Load Pipeline</h2>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close load pipeline dialog"
            className="text-gray-600 hover:text-gray-600 transition-colors dark:text-gray-400"
          >
            <X aria-hidden="true" className="w-6 h-6" />
          </button>
        </div>

        {/* Notification */}
        {notification && (
          <div className="mx-6 mt-4 p-3 bg-green-50 border border-green-200 text-green-700 rounded-md text-sm">
            {notification}
          </div>
        )}

        {/* Tabs */}
        <div
          role="tablist"
          aria-label="Pipeline lists"
          onKeyDown={(e) => handleTabListKeyDown(e, ['my', 'public'] as const, activeTab, setActiveTab, 'load-tab')}
          className="flex border-b border-gray-200"
        >
          <button
            type="button"
            role="tab"
            id="load-tab-my"
            aria-selected={activeTab === 'my'}
            aria-controls="load-tabpanel"
            tabIndex={activeTab === 'my' ? 0 : -1}
            onClick={() => setActiveTab('my')}
            className={`flex-1 px-6 py-3 text-sm font-medium transition-colors ${
              activeTab === 'my'
                ? 'text-blue-600 border-b-2 border-blue-600'
                : 'text-gray-600 hover:text-gray-900'
            }`}
          >
            <div className="flex items-center justify-center space-x-2">
              <Lock aria-hidden="true" size={16} />
              <span>My Pipelines</span>
            </div>
          </button>
          <button
            type="button"
            role="tab"
            id="load-tab-public"
            aria-selected={activeTab === 'public'}
            aria-controls="load-tabpanel"
            tabIndex={activeTab === 'public' ? 0 : -1}
            onClick={() => setActiveTab('public')}
            className={`flex-1 px-6 py-3 text-sm font-medium transition-colors ${
              activeTab === 'public'
                ? 'text-blue-600 border-b-2 border-blue-600'
                : 'text-gray-600 hover:text-gray-900'
            }`}
          >
            <div className="flex items-center justify-center space-x-2">
              <Users aria-hidden="true" size={16} />
              <span>Public Pipelines</span>
            </div>
          </button>
        </div>

        {/* Content */}
        <div
          role="tabpanel"
          id="load-tabpanel"
          aria-labelledby={`load-tab-${activeTab}`}
          tabIndex={0}
          className="flex-1 overflow-y-auto p-6"
        >
          {/* Always-present live region so the error is announced when it appears

              (WCAG 3.3.1 Error Identification, 4.1.3 Status Messages). */}

          <div id="load-pipeline-error" role="alert" aria-live="assertive" className={error ? "p-3 bg-red-50 border border-red-200 text-red-700 rounded-md text-sm mb-4" : 'sr-only'}>

            {error}

          </div>

          {loading ? (
            <div className="flex items-center justify-center py-12">
              <div className="text-center" role="status">
                <div aria-hidden="true" className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mx-auto mb-4"></div>
                <p className="text-gray-600">Loading pipelines...</p>
              </div>
            </div>
          ) : pipelines.length === 0 ? (
            <div className="text-center py-12">
              <FolderOpen aria-hidden="true" className="w-16 h-16 text-gray-600 mx-auto mb-4 dark:text-gray-400" />
              <p className="text-gray-600 font-medium mb-2">
                {activeTab === 'my' ? 'No saved pipelines yet' : 'No public pipelines available'}
              </p>
              <p className="text-sm text-gray-600 dark:text-gray-400">
                {activeTab === 'my' 
                  ? 'Create your first pipeline and save it!' 
                  : 'Check back later for community pipelines'}
              </p>
            </div>
          ) : (
            <div className="space-y-3">
              {pipelines.map((pipeline) => (
                <div
                  key={pipeline.id}
                  className="border border-gray-200 rounded-lg p-4 hover:border-blue-300 hover:shadow-md transition-all group"
                >
                  <div className="flex items-start justify-between mb-2">
                    <div className="flex-1">
                      <h3 className="font-semibold text-gray-900 mb-1">
                        {pipeline.name}
                      </h3>
                      {pipeline.description && (
                        <p className="text-sm text-gray-600 mb-2">
                          {pipeline.description}
                        </p>
                      )}
                    </div>
                    {pipeline.is_public && (
                      <span className="ml-2 px-2 py-1 bg-green-100 text-green-700 text-xs font-medium rounded">
                        Public
                      </span>
                    )}
                  </div>

                  <div className="flex items-center space-x-4 text-xs text-gray-600 mb-3 dark:text-gray-400">
                    <div className="flex items-center space-x-1">
                      <Layers aria-hidden="true" size={14} />
                      <span>{pipeline.pipeline_data?.length || 0} operations</span>
                    </div>
                    
                    {pipeline.category && (
                      <div className="flex items-center space-x-1">
                        <span className="px-2 py-0.5 bg-gray-100 text-gray-700 rounded">
                          {pipeline.category}
                        </span>
                      </div>
                    )}
                    
                    <div className="flex items-center space-x-1">
                      <Calendar aria-hidden="true" size={14} />
                      <span>{formatDate(pipeline.created_at)}</span>
                    </div>
                    
                    {pipeline.usage_count > 0 && (
                      <div className="flex items-center space-x-1">
                        <Users aria-hidden="true" size={14} />
                        <span>{pipeline.usage_count} uses</span>
                      </div>
                    )}
                  </div>

                  {pipeline.tags && Array.isArray(pipeline.tags) && pipeline.tags.length > 0 && (
                    <div className="flex flex-wrap gap-1 mb-3">
                      {pipeline.tags.map((tag, index) => (
                        <span
                          key={index}
                          className="px-2 py-0.5 bg-blue-50 text-blue-600 text-xs rounded"
                        >
                          {tag}
                        </span>
                      ))}
                    </div>
                  )}

                  {/* Action Buttons */}
                  <div className="flex items-center space-x-2 pt-2 border-t border-gray-100">
                    <button
                      onClick={(e) => handleLoadPipeline(pipeline, e)}
                      aria-label={`Load ${pipeline.name}`}
                      className="flex-1 flex items-center justify-center space-x-1 px-3 py-2 text-sm text-white bg-blue-600 hover:bg-blue-700 rounded-md transition-colors"
                    >
                      <FolderOpen aria-hidden="true" size={14} />
                      <span>Load</span>
                    </button>

                    {activeTab === 'my' && (
                      <>
                        <button
                          onClick={(e) => handleTogglePublic(pipeline, e)}
                          className="flex items-center justify-center space-x-1 px-3 py-2 text-sm text-gray-700 hover:bg-gray-100 rounded-md transition-colors"
                          title={pipeline.is_public ? 'Make private' : 'Make public'}
                          aria-label={`${pipeline.is_public ? 'Make private' : 'Make public'}: ${pipeline.name}`}
                        >
                          {pipeline.is_public ? <EyeOff aria-hidden="true" size={14} /> : <Eye aria-hidden="true" size={14} />}
                          <span className="hidden sm:inline">
                            {pipeline.is_public ? 'Private' : 'Public'}
                          </span>
                        </button>

                        <button
                          onClick={(e) => handleDuplicate(pipeline, e)}
                          className="flex items-center justify-center space-x-1 px-3 py-2 text-sm text-gray-700 hover:bg-gray-100 rounded-md transition-colors"
                          title="Duplicate"
                          aria-label={`Duplicate ${pipeline.name}`}
                        >
                          <Copy aria-hidden="true" size={14} />
                        </button>

                        <button
                          onClick={(e) => handleDelete(pipeline.id, e)}
                          className="flex items-center justify-center space-x-1 px-3 py-2 text-sm text-red-600 hover:bg-red-50 rounded-md transition-colors"
                          title="Delete"
                          aria-label={`Delete ${pipeline.name}`}
                        >
                          <Trash2 aria-hidden="true" size={14} />
                        </button>
                      </>
                    )}

                    {activeTab === 'public' && (
                      <button
                        onClick={(e) => handleDuplicate(pipeline, e)}
                        className="flex items-center justify-center space-x-1 px-3 py-2 text-sm text-gray-700 hover:bg-gray-100 rounded-md transition-colors"
                        title="Duplicate to My Pipelines"
                        aria-label={`Duplicate ${pipeline.name} to My Pipelines`}
                      >
                        <Copy aria-hidden="true" size={14} />
                        <span className="hidden sm:inline">Duplicate</span>
                      </button>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="p-6 border-t border-gray-200">
          <button
            onClick={onClose}
            className="w-full px-4 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-md hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500"
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
};
