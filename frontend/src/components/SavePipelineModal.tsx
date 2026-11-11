import React, { useState } from 'react';
import { X, Save } from 'lucide-react';
import { pipelineService } from '../services/auth';
import { PipelineStep } from '../types';

interface SavePipelineModalProps {
  isOpen: boolean;
  onClose: () => void;
  pipeline: PipelineStep[];
  onSaveSuccess: () => void;
}

export const SavePipelineModal: React.FC<SavePipelineModalProps> = ({
  isOpen,
  onClose,
  pipeline,
  onSaveSuccess,
}) => {
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [isPublic, setIsPublic] = useState(false);
  const [category, setCategory] = useState('');
  const [tags, setTags] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  if (!isOpen) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    
    if (!name.trim()) {
      setError('Pipeline name is required');
      return;
    }

    if (pipeline.length === 0) {
      setError('Cannot save empty pipeline');
      return;
    }

    setLoading(true);

    try {
      await pipelineService.createPipeline({
        name: name.trim(),
        description: description.trim() || undefined,
        pipeline_data: pipeline.map(step => ({
          name: step.name,
          params: step.params,
        })),
        is_public: isPublic,
        category: category.trim() || undefined,
        tags: tags.trim() ? tags.split(',').map(t => t.trim()).filter(t => t) : undefined,
      });

      // Reset form
      setName('');
      setDescription('');
      setIsPublic(false);
      setCategory('');
      setTags('');
      
      onSaveSuccess();
      onClose();
    } catch (err: any) {
      console.error('Failed to save pipeline:', err);
      setError(err.response?.data?.detail || 'Failed to save pipeline');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-[100] p-4">
      <div className="bg-white rounded-lg shadow-xl max-w-md w-full max-h-[90vh] overflow-y-auto">
        {/* Header */}
        <div className="flex items-center justify-between p-6 border-b border-gray-200">
          <div className="flex items-center space-x-2">
            <Save aria-hidden="true" className="w-5 h-5 text-blue-600" />
            <h2 className="text-xl font-bold text-gray-900">Save Pipeline</h2>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close save pipeline dialog"
            className="text-gray-400 hover:text-gray-600 transition-colors"
          >
            <X aria-hidden="true" className="w-6 h-6" />
          </button>
        </div>

        {/* Form */}
        <form onSubmit={handleSubmit} className="p-6 space-y-4">
          {error && (
            <div className="p-3 bg-red-50 border border-red-200 text-red-700 rounded-md text-sm">
              {error}
            </div>
          )}

          {/* Pipeline info */}
          <div className="p-3 bg-blue-50 border border-blue-200 rounded-md">
            <p className="text-sm text-blue-800">
              <strong>{pipeline.length}</strong> operation{pipeline.length !== 1 ? 's' : ''} in pipeline
            </p>
          </div>

          {/* Name */}
          <div>
            <label htmlFor="name" className="block text-sm font-medium text-gray-700 mb-1">
              Pipeline Name *
            </label>
            <input
              id="name"
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g., Instagram-style filter"
              className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              required
              disabled={loading}
            />
          </div>

          {/* Description */}
          <div>
            <label htmlFor="description" className="block text-sm font-medium text-gray-700 mb-1">
              Description
            </label>
            <textarea
              id="description"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Describe what this pipeline does..."
              rows={3}
              className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent resize-none"
              disabled={loading}
            />
          </div>

          {/* Category */}
          <div>
            <label htmlFor="category" className="block text-sm font-medium text-gray-700 mb-1">
              Category
            </label>
            <select
              id="category"
              value={category}
              onChange={(e) => setCategory(e.target.value)}
              className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              disabled={loading}
            >
              <option value="">Select a category</option>
              <option value="Filters">Filters</option>
              <option value="Adjustments">Adjustments</option>
              <option value="Effects">Effects</option>
              <option value="Enhancement">Enhancement</option>
              <option value="Edge Detection">Edge Detection</option>
              <option value="Other">Other</option>
            </select>
          </div>

          {/* Tags */}
          <div>
            <label htmlFor="tags" className="block text-sm font-medium text-gray-700 mb-1">
              Tags (comma-separated)
            </label>
            <input
              id="tags"
              type="text"
              value={tags}
              onChange={(e) => setTags(e.target.value)}
              placeholder="e.g., vintage, blur, black-white"
              className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              disabled={loading}
            />
          </div>

          {/* Public checkbox */}
          <div className="flex items-start">
            <input
              id="is_public"
              type="checkbox"
              checked={isPublic}
              onChange={(e) => setIsPublic(e.target.checked)}
              className="mt-1 h-4 w-4 text-blue-600 focus:ring-blue-500 border-gray-300 rounded"
              disabled={loading}
            />
            <label htmlFor="is_public" className="ml-2 block text-sm text-gray-700">
              <span className="font-medium">Make this pipeline public</span>
              <p className="text-gray-500 text-xs mt-1">
                Other users will be able to view and use this pipeline
              </p>
            </label>
          </div>

          {/* Buttons */}
          <div className="flex items-center justify-end space-x-3 pt-4">
            <button
              type="button"
              onClick={onClose}
              disabled={loading}
              className="px-4 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-md hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500 disabled:opacity-50"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={loading || !name.trim()}
              className="px-4 py-2 text-sm font-medium text-white bg-blue-600 border border-transparent rounded-md hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {loading ? 'Saving...' : 'Save Pipeline'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
