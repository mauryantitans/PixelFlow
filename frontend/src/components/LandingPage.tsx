import React from 'react';
import { useNavigate } from 'react-router-dom';
import { 
  Zap, Image as ImageIcon, Layers, Lock, Users, Github, ArrowRight, CheckCircle,
  Upload, Settings, Download, Eye, Sparkles, Clock
} from 'lucide-react';
import { Header } from './Header';
import { useDocumentTitle } from '../hooks/useDocumentTitle';

export const LandingPage: React.FC = () => {
  const navigate = useNavigate();
  useDocumentTitle('Visual image processing pipeline builder');

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 via-blue-50 to-indigo-50 dark:from-zinc-950 dark:via-zinc-900 dark:to-zinc-950">
      <a href="#main-content" className="skip-link">Skip to main content</a>
      <Header />

      <main id="main-content" tabIndex={-1} className="focus:outline-none">
      {/* Hero Section */}
      <section className="max-w-7xl mx-auto px-6 py-20">
        <div className="text-center mb-16">
          {/* Icon Display */}
          <div className="flex justify-center mb-8">
            <img 
              src="/PixelFlow_Icon.png" 
              alt="" 
              className="w-24 h-24 rounded-2xl shadow-lg"
            />
          </div>
          
          <h1 className="text-5xl font-bold text-slate-900 dark:text-slate-50 mb-6">
            Visual Image Processing
            <br />
            <span className="text-transparent bg-clip-text bg-gradient-to-r from-blue-600 to-indigo-600 dark:from-blue-400 dark:to-indigo-400">
              Made Simple
            </span>
          </h1>
          <p className="text-xl text-slate-600 dark:text-slate-300 mb-8 max-w-3xl mx-auto">
            Build powerful image processing pipelines with 50+ operations from OpenCV and Scikit-Image. 
            No coding required. Real-time preview. Export and share.
          </p>
          
          <div className="flex items-center justify-center space-x-4">
            <button
              onClick={() => navigate('/app')}
              className="group flex items-center space-x-2 px-8 py-4 bg-blue-600 text-white text-lg font-semibold rounded-lg hover:bg-blue-700 transition-all shadow-lg hover:shadow-xl"
            >
              <span>Start Building</span>
              <ArrowRight aria-hidden="true" className="w-5 h-5 group-hover:translate-x-1 transition-transform" />
            </button>
            <button
              onClick={() => navigate('/auth')}
              className="px-8 py-4 bg-white dark:bg-zinc-800 text-slate-900 dark:text-slate-50 text-lg font-semibold rounded-lg hover:bg-slate-50 dark:hover:bg-zinc-700 transition-colors border-2 border-slate-300 dark:border-zinc-700 shadow-sm"
            >
              Sign Up Free
            </button>
          </div>
          
          <div className="flex items-center justify-center flex-wrap gap-6 mt-6 text-sm text-slate-600 dark:text-slate-400">
            <div className="flex items-center space-x-2">
              <CheckCircle aria-hidden="true" className="w-4 h-4 text-green-700 dark:text-green-400" />
              <span>100% Free Forever</span>
            </div>
            <div className="flex items-center space-x-2">
              <CheckCircle aria-hidden="true" className="w-4 h-4 text-green-700 dark:text-green-400" />
              <span>No Sign-Up Required</span>
            </div>
            <div className="flex items-center space-x-2">
              <CheckCircle aria-hidden="true" className="w-4 h-4 text-green-700 dark:text-green-400" />
              <span>Browser-Based</span>
            </div>
          </div>
        </div>
      </section>

      {/* How It Works Section */}
      <section className="bg-white dark:bg-zinc-900 py-20 border-y-2 border-slate-300 dark:border-zinc-800">
        <div className="max-w-7xl mx-auto px-6">
          <h2 className="text-3xl font-bold text-center text-slate-900 dark:text-slate-50 mb-12">
            How It Works
          </h2>
          
          <div className="grid md:grid-cols-3 gap-12 max-w-5xl mx-auto">
            <div className="text-center">
              <div className="w-16 h-16 bg-blue-100 dark:bg-blue-900/30 rounded-full flex items-center justify-center mx-auto mb-4">
                <Upload aria-hidden="true" className="w-8 h-8 text-blue-600 dark:text-blue-400" />
              </div>
              <h3 className="text-xl font-semibold text-slate-900 dark:text-slate-50 mb-2">1. Upload Images</h3>
              <p className="text-slate-600 dark:text-slate-300">
                Drag and drop or select images from your computer. Supports JPG, PNG, BMP, and TIFF formats.
              </p>
            </div>

            <div className="text-center">
              <div className="w-16 h-16 bg-indigo-100 dark:bg-indigo-900/30 rounded-full flex items-center justify-center mx-auto mb-4">
                <Settings aria-hidden="true" className="w-8 h-8 text-indigo-600 dark:text-indigo-400" />
              </div>
              <h3 className="text-xl font-semibold text-slate-900 dark:text-slate-50 mb-2">2. Build Pipeline</h3>
              <p className="text-slate-600 dark:text-slate-300">
                Add operations like blur, sharpen, edge detection. Adjust parameters and see changes in real-time.
              </p>
            </div>

            <div className="text-center">
              <div className="w-16 h-16 bg-purple-100 dark:bg-purple-900/30 rounded-full flex items-center justify-center mx-auto mb-4">
                <Download aria-hidden="true" className="w-8 h-8 text-purple-600 dark:text-purple-400" />
              </div>
              <h3 className="text-xl font-semibold text-slate-900 dark:text-slate-50 mb-2">3. Export Results</h3>
              <p className="text-slate-600 dark:text-slate-300">
                Download processed images or save your pipeline to reuse later. Share with your team.
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* Features Section */}
      <section id="features" className="max-w-7xl mx-auto px-6 py-20">
        <h2 className="text-3xl font-bold text-center text-slate-900 dark:text-slate-50 mb-12">
          Everything You Need for Image Processing
        </h2>
        
        <div className="grid md:grid-cols-3 gap-8">
          {/* Feature 1 */}
          <div className="bg-white dark:bg-zinc-900 p-8 rounded-xl border-2 border-slate-300 dark:border-zinc-800 hover:shadow-lg dark:hover:shadow-black/40 transition-all">
            <div className="w-12 h-12 bg-blue-100 dark:bg-blue-900/30 rounded-lg flex items-center justify-center mb-4">
              <Clock aria-hidden="true" className="w-6 h-6 text-blue-600 dark:text-blue-400" />
            </div>
            <h3 className="text-xl font-semibold text-slate-900 dark:text-slate-50 mb-3">Live Processing</h3>
            <p className="text-slate-600 dark:text-slate-300">
              See changes in real-time as you adjust parameters. No waiting, no rendering delays. Instant feedback.
            </p>
          </div>

          {/* Feature 2 */}
          <div className="bg-white dark:bg-zinc-900 p-8 rounded-xl border-2 border-slate-300 dark:border-zinc-800 hover:shadow-lg dark:hover:shadow-black/40 transition-all">
            <div className="w-12 h-12 bg-indigo-100 dark:bg-indigo-900/30 rounded-lg flex items-center justify-center mb-4">
              <Sparkles aria-hidden="true" className="w-6 h-6 text-indigo-600 dark:text-indigo-400" />
            </div>
            <h3 className="text-xl font-semibold text-slate-900 dark:text-slate-50 mb-3">50+ Operations</h3>
            <p className="text-slate-600 dark:text-slate-300">
              Professional-grade filters from OpenCV and Scikit-Image. Basic adjustments to advanced computer vision.
            </p>
          </div>

          {/* Feature 3 */}
          <div className="bg-white dark:bg-zinc-900 p-8 rounded-xl border-2 border-slate-300 dark:border-zinc-800 hover:shadow-lg dark:hover:shadow-black/40 transition-all">
            <div className="w-12 h-12 bg-purple-100 dark:bg-purple-900/30 rounded-lg flex items-center justify-center mb-4">
              <Layers aria-hidden="true" className="w-6 h-6 text-purple-600 dark:text-purple-400" />
            </div>
            <h3 className="text-xl font-semibold text-slate-900 dark:text-slate-50 mb-3">Visual Pipeline Builder</h3>
            <p className="text-slate-600 dark:text-slate-300">
              Drag, drop, and reorder operations. Build complex workflows visually without writing any code.
            </p>
          </div>

          {/* Feature 4 */}
          <div className="bg-white dark:bg-zinc-900 p-8 rounded-xl border-2 border-slate-300 dark:border-zinc-800 hover:shadow-lg dark:hover:shadow-black/40 transition-all">
            <div className="w-12 h-12 bg-green-100 dark:bg-green-900/30 rounded-lg flex items-center justify-center mb-4">
              <Lock aria-hidden="true" className="w-6 h-6 text-green-700 dark:text-green-400" />
            </div>
            <h3 className="text-xl font-semibold text-slate-900 dark:text-slate-50 mb-3">Save & Share</h3>
            <p className="text-slate-600 dark:text-slate-300">
              Create an account to save your pipelines. Share them with your team or publish to the community.
            </p>
          </div>

          {/* Feature 5 */}
          <div className="bg-white dark:bg-zinc-900 p-8 rounded-xl border-2 border-slate-300 dark:border-zinc-800 hover:shadow-lg dark:hover:shadow-black/40 transition-all">
            <div className="w-12 h-12 bg-yellow-100 dark:bg-yellow-900/30 rounded-lg flex items-center justify-center mb-4">
              <ImageIcon aria-hidden="true" className="w-6 h-6 text-amber-700 dark:text-yellow-400" />
            </div>
            <h3 className="text-xl font-semibold text-slate-900 dark:text-slate-50 mb-3">Batch Processing</h3>
            <p className="text-slate-600 dark:text-slate-300">
              Upload multiple images and process them all at once. Perfect for consistent editing across photo sets.
            </p>
          </div>

          {/* Feature 6 */}
          <div className="bg-white dark:bg-zinc-900 p-8 rounded-xl border-2 border-slate-300 dark:border-zinc-800 hover:shadow-lg dark:hover:shadow-black/40 transition-all">
            <div className="w-12 h-12 bg-red-100 dark:bg-red-900/30 rounded-lg flex items-center justify-center mb-4">
              <Eye aria-hidden="true" className="w-6 h-6 text-red-600 dark:text-red-400" />
            </div>
            <h3 className="text-xl font-semibold text-slate-900 dark:text-slate-50 mb-3">Advanced Analytics</h3>
            <p className="text-slate-600 dark:text-slate-300">
              RGB histograms, color statistics, and image analysis. Compare before/after with detailed metrics.
            </p>
          </div>
        </div>
      </section>

      {/* Use Cases Section */}
      <section className="bg-slate-100 dark:bg-zinc-900/50 py-20 border-y-2 border-slate-300 dark:border-zinc-800">
        <div className="max-w-7xl mx-auto px-6">
          <h2 className="text-3xl font-bold text-center text-slate-900 dark:text-slate-50 mb-4">
            Perfect For
          </h2>
          <p className="text-center text-slate-600 dark:text-slate-400 mb-12 max-w-2xl mx-auto">
            Whether you're a designer, researcher, or developer - PixelFlow has you covered.
          </p>
          
          <div className="grid md:grid-cols-3 gap-6 max-w-4xl mx-auto">
            <div className="bg-white dark:bg-zinc-900 p-6 rounded-xl border-2 border-slate-300 dark:border-zinc-800 shadow-sm hover:shadow-md dark:hover:shadow-black/40 transition-all">
              <h3 className="font-semibold text-slate-900 dark:text-slate-50 mb-2"><span aria-hidden="true">🎨 </span>Designers</h3>
              <p className="text-sm text-slate-600 dark:text-slate-300">Quick image adjustments and creative effects for your design projects</p>
            </div>

            <div className="bg-white dark:bg-zinc-900 p-6 rounded-xl border-2 border-slate-300 dark:border-zinc-800 shadow-sm hover:shadow-md dark:hover:shadow-black/40 transition-all">
              <h3 className="font-semibold text-slate-900 dark:text-slate-50 mb-2"><span aria-hidden="true">🔬 </span>Researchers</h3>
              <p className="text-sm text-slate-600 dark:text-slate-300">Image analysis, preprocessing, and scientific visualization workflows</p>
            </div>

            <div className="bg-white dark:bg-zinc-900 p-6 rounded-xl border-2 border-slate-300 dark:border-zinc-800 shadow-sm hover:shadow-md dark:hover:shadow-black/40 transition-all">
              <h3 className="font-semibold text-slate-900 dark:text-slate-50 mb-2"><span aria-hidden="true">💻 </span>Developers</h3>
              <p className="text-sm text-slate-600 dark:text-slate-300">Prototype computer vision pipelines visually before coding</p>
            </div>
          </div>
        </div>
      </section>

      {/* CTA Section */}
      <section className="max-w-4xl mx-auto px-6 py-20 text-center">
        <div className="bg-white dark:bg-zinc-900 rounded-2xl p-12 shadow-xl dark:shadow-black/50 border-2 border-slate-300 dark:border-zinc-800">
          <h2 className="text-3xl font-bold text-slate-900 dark:text-slate-50 mb-4">
            Ready to Transform Your Images?
          </h2>
          <p className="text-xl text-slate-600 dark:text-slate-300 mb-8">
            Start building powerful image processing pipelines in seconds.
          </p>
          <div className="flex items-center justify-center space-x-4">
            <button
              onClick={() => navigate('/app')}
              className="px-8 py-4 bg-blue-600 hover:bg-blue-700 text-white text-lg font-semibold rounded-lg transition-colors shadow-lg hover:shadow-xl"
            >
              Try Without Account
            </button>
            <button
              onClick={() => navigate('/auth')}
              className="px-8 py-4 bg-slate-100 dark:bg-zinc-800 hover:bg-slate-200 dark:hover:bg-zinc-700 text-slate-900 dark:text-slate-50 text-lg font-semibold rounded-lg transition-colors border-2 border-slate-300 dark:border-zinc-700"
            >
              Create Free Account
            </button>
          </div>
        </div>
      </section>

      </main>

      {/* Footer */}
      <footer className="border-t-2 border-slate-300 dark:border-zinc-800 bg-white dark:bg-zinc-900">
        <div className="max-w-7xl mx-auto px-6 py-12">
          <div className="grid md:grid-cols-4 gap-8 mb-8">
            {/* About */}
            <div>
              <div className="flex items-center space-x-2 mb-4">
                <img 
                  src="/PixelFlow_Icon.png" 
                  alt="" 
                  className="w-6 h-6 rounded"
                />
                <span className="font-bold text-slate-900 dark:text-slate-50">PixelFlow</span>
              </div>
              <p className="text-sm text-slate-600 dark:text-slate-400">
                Visual image processing pipeline builder powered by OpenCV and Scikit-Image.
              </p>
            </div>

            {/* Product */}
            <div>
              <h2 className="font-semibold text-slate-900 dark:text-slate-50 mb-4">Product</h2>
              <ul className="space-y-2 text-sm">
                <li>
                  <button onClick={() => navigate('/app')} className="text-slate-600 dark:text-slate-400 hover:text-blue-600 dark:hover:text-blue-400 transition-colors">
                    Try App
                  </button>
                </li>
                <li>
                  <button onClick={() => navigate('/auth')} className="text-slate-600 dark:text-slate-400 hover:text-blue-600 dark:hover:text-blue-400 transition-colors">
                    Sign Up
                  </button>
                </li>
                <li>
                  <a href="#features" onClick={(e) => { e.preventDefault(); document.getElementById('features')?.scrollIntoView({ behavior: 'smooth' }); }} className="text-slate-600 dark:text-slate-400 hover:text-blue-600 dark:hover:text-blue-400 transition-colors cursor-pointer">
                    Features
                  </a>
                </li>
              </ul>
            </div>

            {/* Resources */}
            <div>
              <h2 className="font-semibold text-slate-900 dark:text-slate-50 mb-4">Resources</h2>
              <ul className="space-y-2 text-sm">
                <li>
                  <a href="https://github.com/Mauryantitans/PixelFlow/blob/React_FastAPI/README.md" target="_blank" rel="noopener noreferrer" className="text-slate-600 dark:text-slate-400 hover:text-blue-600 dark:hover:text-blue-400 transition-colors">
                    Documentation
                  </a>
                </li>
                <li>
                  <a href="https://github.com/Mauryantitans/PixelFlow/issues" target="_blank" rel="noopener noreferrer" className="text-slate-600 dark:text-slate-400 hover:text-blue-600 dark:hover:text-blue-400 transition-colors">
                    Support
                  </a>
                </li>
                <li>
                  <a href="#features" onClick={(e) => { e.preventDefault(); document.getElementById('features')?.scrollIntoView({ behavior: 'smooth' }); }} className="text-slate-600 dark:text-slate-400 hover:text-blue-600 dark:hover:text-blue-400 transition-colors cursor-pointer">
                    Features
                  </a>
                </li>
              </ul>
            </div>

            {/* Community */}
            <div>
              <h2 className="font-semibold text-slate-900 dark:text-slate-50 mb-4">Community</h2>
              <ul className="space-y-2 text-sm">
                <li>
                  <a href="https://github.com/Mauryantitans/PixelFlow" target="_blank" rel="noopener noreferrer" className="text-slate-600 dark:text-slate-400 hover:text-blue-600 dark:hover:text-blue-400 transition-colors flex items-center space-x-2">
                    <Github aria-hidden="true" size={16} />
                    <span>GitHub</span>
                  </a>
                </li>
                <li>
                  <a href="https://github.com/Mauryantitans/PixelFlow/discussions" target="_blank" rel="noopener noreferrer" className="text-slate-600 dark:text-slate-400 hover:text-blue-600 dark:hover:text-blue-400 transition-colors">
                    Discussions
                  </a>
                </li>
                <li>
                  <a href="https://github.com/Mauryantitans/PixelFlow/issues" target="_blank" rel="noopener noreferrer" className="text-slate-600 dark:text-slate-400 hover:text-blue-600 dark:hover:text-blue-400 transition-colors">
                    Report Issue
                  </a>
                </li>
              </ul>
            </div>
          </div>

          {/* Bottom bar */}
          <div className="pt-8 border-t-2 border-slate-300 dark:border-zinc-800 flex flex-col md:flex-row items-center justify-between space-y-4 md:space-y-0">
            <p className="text-sm text-slate-600 dark:text-slate-400">
              © 2025 PixelFlow. Open source image processing.{' '}
              <a 
                href="https://github.com/Mauryantitans/PixelFlow/blob/React_FastAPI/LICENSE" 
                target="_blank" 
                rel="noopener noreferrer"
                className="text-blue-700 dark:text-blue-400 underline hover:no-underline"
              >
                Apache-2.0 License
              </a>
            </p>
            <div className="flex items-center space-x-6 text-sm">
              <a href="https://github.com/Mauryantitans/PixelFlow" target="_blank" rel="noopener noreferrer" className="text-slate-600 dark:text-slate-400 hover:text-blue-600 dark:hover:text-blue-400 transition-colors">
                Privacy
              </a>
              <a href="https://github.com/Mauryantitans/PixelFlow" target="_blank" rel="noopener noreferrer" className="text-slate-600 dark:text-slate-400 hover:text-blue-600 dark:hover:text-blue-400 transition-colors">
                Terms
              </a>
              <a href="https://github.com/Mauryantitans/PixelFlow/blob/main/LICENSE" target="_blank" rel="noopener noreferrer" className="text-slate-600 dark:text-slate-400 hover:text-blue-600 dark:hover:text-blue-400 transition-colors">
                License
              </a>
            </div>
          </div>
        </div>
      </footer>
    </div>
  );
};
