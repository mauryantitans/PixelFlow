# PixelFlow

## Visual Image Processing Pipeline Builder

**Version 1.3.0** | [V1.0.0 on GitHub](https://github.com/Mauryantitans/PixelFlow/tree/v1.0.0) | [Changelog](CHANGELOG.md)

---

A comprehensive web application that enables developers and researchers to build, test, and apply sophisticated image processing pipelines through an intuitive visual interface.

PixelFlow eliminates the need for manual parameter tuning by providing **real-time visual feedback** and extensive operation libraries from **OpenCV** and **Scikit-Image**.

---

## 📸 Screenshots

<table>
  <tr>
    <td><img src="images/PixelFlow (1).png" alt="Screenshot 1" width="100%"/></td>
    <td><img src="images/PixelFlow (2).png" alt="Screenshot 2" width="100%"/></td>
    <td><img src="images/PixelFlow (3).png" alt="Screenshot 3" width="100%"/></td>
    <td><img src="images/PixelFlow (4).png" alt="Screenshot 4" width="100%"/></td>
  </tr>
  <tr>
    <td><img src="images/PixelFlow (5).png" alt="Screenshot 5" width="100%"/></td>
    <td><img src="images/PixelFlow (6).png" alt="Screenshot 6" width="100%"/></td>
    <td><img src="images/PixelFlow (7).png" alt="Screenshot 7" width="100%"/></td>
    <td><img src="images/PixelFlow (8).png" alt="Screenshot 8" width="100%"/></td>
  </tr>
  <tr>
    <td><img src="images/PixelFlow (9).png" alt="Screenshot 9" width="100%"/></td>
    <td><img src="images/PixelFlow (10).png" alt="Screenshot 10" width="100%"/></td>
    <td><img src="images/PixelFlow (11).png" alt="Screenshot 11" width="100%"/></td>
    <td><img src="images/PixelFlow (12).png" alt="Screenshot 12" width="100%"/></td>
  </tr>
  <tr>
    <td><img src="images/PixelFlow (13).png" alt="Screenshot 13" width="100%"/></td>
    <td><img src="images/PixelFlow (14).png" alt="Screenshot 14" width="100%"/></td>
    <td><img src="images/PixelFlow (15).png" alt="Screenshot 15" width="100%"/></td>
    <td><img src="images/PixelFlow (16).png" alt="Screenshot 16" width="100%"/></td>
  </tr>
</table>

> 💡 **Want to see it in action?** Check out our live demo deployment below!

---

## 🌐 Live Demo

Experience PixelFlow without any setup required!

**🔗 Live Demo:** [https://pixel-flow-woad.vercel.app](https://pixel-flow-woad.vercel.app)

Register a free account in the app to try the pipeline builder. To explore the
admin features locally, create your own admin account — see [Quick Start](#-quick-start)
(set `ADMIN_EMAIL` / `ADMIN_PASSWORD` and the admin sets their own panel PIN on first use).

> Admin credentials are never published here; provision your own via the
> `ADMIN_EMAIL` / `ADMIN_PASSWORD` environment variables.

---

## 🆕 What's New in 1.3.0 — Sessions, security and accessibility

- ✅ **WCAG 2.1 AA** — keyboard access, screen-reader announcements, focus management, contrast, reflow down to 320px; audit reports in [a11y-reports/](a11y-reports/REPORT.md)
- ✅ **Mobile-friendly layout** — the workspace works on phones and small windows
- ✅ **Automatic cleanup** — the server deletes data past the retention periods every 15 minutes (switchable in Admin → Retention)
- ✅ **Sessions you can trust** — sliding expiry from real activity, never shared between accounts; signing back in restores your work
- ✅ **Stay signed in** — tokens refresh in the background instead of silently dropping you to guest after 30 minutes
- ✅ **Admin PIN enforced by the server**, with a lockout after 5 wrong PINs
- ✅ **Connection badge** — the header shows whether the backend is reachable (`GET /api/health`), replacing the old heartbeat
- ✅ **Workflow fixes** — partial uploads, TIFF previews, Stop-then-Apply in batch mode, stale previews, picking on the right image, pipeline kept on reload

See [CHANGELOG.md](CHANGELOG.md) for details and earlier releases (1.2.0: schema-driven registry and 77 operations; 1.1.0: PostgreSQL, accounts, admin panel).

---

## 📋 Table of Contents

- [Features](#-features)
- [Architecture](#-architecture)
- [Quick Start](#-quick-start)
- [Project Structure](#-project-structure)
- [Usage](#-usage)
- [API Documentation](#-api-documentation)
- [Operations Library](#-operations-library)
- [Deployment](#-deployment)
- [Limitations](#-limitations)
- [Contributing](#-contributing)
- [Contact & Support](#-contact--support)

---

## ✨ Features

### Core Functionality

- **Visual Pipeline Builder**: Real-time parameter controls with immediate visual feedback
- **Dual Processing Modes**:
  - **Live Mode**: Instant single-image processing with real-time preview
  - **Batch Mode**: Efficient multi-image processing with progress tracking
- **77 Operations**: Industry-standard algorithms from OpenCV, Scikit-Image and PIL, served from a declarative backend registry (the UI renders each operation's controls dynamically from its schema)
- **Typed & Interactive Parameters**: Scalars, enums, booleans, angles, colors, and image-coordinate inputs (click a point, drag a region, eyedropper a color) — picked directly on the preview
- **Incremental Live Preview**: A prefix cache recomputes only the steps after the one you edited
- **Step-by-Step Comparison**: Before/after wipe slider, any-two-step side-by-side, and a diff/overlay view
- **Hierarchical Organization**: Logical categorization by library and operation type

### Advanced Features

- **User Authentication**: JWT in httpOnly cookies with CSRF protection, plus optional Google sign-in
- **Admin Panel**: User management, session tracking, quota administration, and database tools
- **Database Storage**: PostgreSQL support with SQLAlchemy ORM for data persistence
- **Session Management**: Activity-based sessions with sliding expiry and automatic cleanup
- **Pipeline Saving**: Save, load, and manage your processing pipelines
- **Performance Analytics**: Millisecond-precision timing for every operation
- **Undo/Redo System**: Complete operation history (Ctrl+Z/Ctrl+Y)
- **Accessible, responsive interface**: WCAG 2.1 AA, dark/light themes, works down to 320px wide
- **Tested + CI**: pytest suite, GitHub Actions (ruff/mypy/pytest), and pre-commit hooks

### Developer Tools

- **Interactive API Docs**: FastAPI automatic documentation at `/docs`
- **Session Monitoring**: Real-time session statistics and debugging
- **Performance Profiling**: Built-in timing and resource usage tracking
- **Database Scripts**: Complete set of utilities for backup, restore, cleanup
- **Extensible Architecture**: Easy addition of new operations and features

---

## 🏗️ Architecture

```
┌─────────────────────┐    ┌────────────────────────┐    ┌─────────────────────┐
│                     │    │                        │    │                     │
│   REACT CLIENT      │    │   FASTAPI SERVER       │    │   POSTGRESQL DB     │
│                     │    │                        │    │                     │
│ • TypeScript        │◄──►│ • Python 3.11+         │◄──►│ • User data         │
│ • Tailwind CSS      │    │ • OpenCV               │    │ • Image storage     │
│ • Custom Hooks      │    │ • Scikit-Image         │    │ • Session tracking  │
│ • State Management  │    │ • SQLAlchemy           │    │ • Pipeline storage  │
│ • Cookie auth       │    │ • Google OAuth         │    │ • Audit logs        │
│                     │    │ • Cleanup scheduler    │    │                     │
└─────────────────────┘    └────────────────────────┘    └─────────────────────┘
```

### Technology Stack

**Frontend:**
- React 18.2+ with TypeScript
- Tailwind CSS for styling
- Axios for API communication
- React Router for navigation
- Lucide React for icons

**Backend:**
- FastAPI 0.115+ (high-performance API)
- OpenCV 4.8+ (computer vision)
- Scikit-Image 0.22+ (scientific image analysis)
- PIL/Pillow 10.4+ (image manipulation)
- SQLAlchemy 2.0+ (database ORM)
- PostgreSQL (production database)
- Alembic (database migrations)

**Quality & Tooling:**
- pytest (test suite) + GitHub Actions CI
- ruff (lint + format) and mypy (typing)
- pre-commit hooks
- Docker + docker-compose

**Authentication & Security:**
- JWT in **httpOnly cookies** (python-jose) — not readable by JS
- **CSRF protection** (double-submit cookie) + refresh-token rotation/revocation
- Google OAuth 2.0 (authlib)
- Bcrypt password hashing (passlib)
- Rate limiting middleware (per-IP on auth/upload/processing)
- Security headers (CSP, HSTS, XSS protection)

---

## 🚀 Quick Start

Fastest path (SQLite, hot reload, both servers):

```bash
git clone https://github.com/MauryanTitans/pixelflow.git
cd pixelflow
./start.sh          # Windows: start.bat
```

Or the full stack with PostgreSQL: `docker compose up`.

- App: http://localhost:3000 · API docs: http://localhost:8000/docs · Health: http://localhost:8000/api/health
- **Admin account:** set `ADMIN_EMAIL` and `ADMIN_PASSWORD` in `backend/.env` before starting; the first admin is created automatically. There are no default credentials.

Manual setup, prerequisites and troubleshooting: [INSTALLATION.md](INSTALLATION.md).

---

## 📂 Project Structure

```
pixelflow/
├── backend/            FastAPI app (app/processing = the operation registry), tests, database scripts
├── frontend/           React + TypeScript app (renders every operation from the API schema)
├── guides/             User, developer, API, admin and OAuth guides
├── deployment/         Render / Vercel deployment docs and env-var reference
├── a11y-reports/       Accessibility audit results and scripts
├── scripts/e2e/        Browser workflow checks
└── docker-compose.yml, start.sh, start.bat
```

A file-by-file architecture tour lives in [CLAUDE.md](CLAUDE.md#architecture).

---

## 💻 Usage

### Basic Workflow

1. **Create Account / Login**
   - Register with email and password
   - Or use Google Sign-In (if configured)

2. **Upload Images**
   - Click "Upload Image(s)" (JPEG, PNG, BMP, TIFF up to 50MB, 20 at a time)
   - Images are stored on the server for your browser session; automatic cleanup removes them after the retention period (24 h for guests, 7 days for accounts by default)

3. **Build Pipeline**
   - Browse 77 operations
   - Add to pipeline and adjust parameters
   - Save pipeline for reuse

4. **Choose Mode**:
   - **Live Mode**: Real-time processing for single image
   - **Batch Mode**: Process multiple images efficiently

5. **Apply & Download**
   - Process images and download results

### Admin Features (Admin Users Only)

- **User Management**: View, activate/deactivate, delete users
- **System Statistics**: Monitor storage, sessions, and usage
- **Database Viewer**: PIN-protected access to user data
- **Cleanup Tools**: Manual cleanup, fix orphaned images
- **Settings**: Adjust quotas, limits, and retention policies

For detailed usage instructions, see [guides/GETTING_STARTED.md](guides/GETTING_STARTED.md)

---

## 📚 API Documentation

Interactive docs run at http://localhost:8000/docs. The guide to auth (httpOnly cookies +
`X-CSRF-Token`), sessions, processing, pipelines, admin and error codes is
[guides/API_REFERENCE.md](guides/API_REFERENCE.md).

---

## 🎨 Operations Library

PixelFlow ships **77 operations** across Basic, OpenCV and Scikit-Image libraries. The
live list is served from the backend registry (`GET /api/processing/operations`) and the UI
renders each operation's controls dynamically from its schema, so the in-app palette is
always the source of truth. Highlights:

- **Adjustments & tone**: Brightness, Contrast, Saturation, Exposure, Gamma, Hue Rotate, Temperature, Detail Enhance
- **Filters & blur**: Gaussian / Median / Box / Bilateral, Non-Local Means, Motion Blur, TV & Wavelet denoise
- **Edges & features**: Canny, Sobel, Scharr, Laplacian, Prewitt, FAST corners, ORB, Harris
- **Morphology & segmentation**: Open / Close / Dilate / Erode / Gradient / Top-Hat / Black-Hat, Skeletonize, Otsu / Adaptive / Triangle thresholding, Watershed, SLIC
- **Stylize & effects**: Sepia, Posterize, Solarize, Vignette, Grain, Emboss, Pixelate, Cartoon, Pencil / Color Sketch, Stylization, Duotone
- **Color spaces & geometry**: RGB ↔ HSV / LAB / YUV, Resize, Rotate, Flip, Crop
- **Interactive (pick on the image)**: Flood Fill (click a seed point), Crop & Inpaint Region (drag a region), eyedropper colors

Operations carry **typed parameters** — scalars, enums, booleans, angles, colors, and
image-coordinate inputs (points / regions) picked directly on the preview. Adding a new
operation is ~10 lines (register a function with its param schema; the UI adapts
automatically) — see [guides/ADDING_OPERATIONS.md](guides/ADDING_OPERATIONS.md).

---

## 🚀 Deployment

Free tiers: **frontend on Vercel**, **backend + PostgreSQL on Render**. The frontend calls `/api`
on its own origin and Vercel proxies it to Render, so the auth cookies stay first-party.

- Step by step: [deployment/DEPLOYMENT_GUIDE.md](deployment/DEPLOYMENT_GUIDE.md)
- Every environment variable: [deployment/ENVIRONMENT_VARIABLES.md](deployment/ENVIRONMENT_VARIABLES.md)
- Other hosts and self-hosting: [deployment/ALTERNATIVE_HOSTING_OPTIONS.md](deployment/ALTERNATIVE_HOSTING_OPTIONS.md)

---

## ⚠️ Limitations

No password reset or email verification yet, synchronous processing, images stored in
Postgres, and the usual free-tier cold starts. Render deletes a free database after 30 days.
The full list is in [CURRENT_LIMITATIONS.md](CURRENT_LIMITATIONS.md).

---

## 🤝 Contributing

We welcome contributions! Here's how you can help:

### Reporting Issues

Use the [GitHub issue tracker](https://github.com/MauryanTitans/pixelflow/issues) to:
- Report bugs with detailed reproduction steps
- Request features with use cases and benefits
- Ask questions about usage or development

### Development Workflow

1. Fork the repository
2. Create a feature branch: `git checkout -b feature/amazing-feature`
3. Make your changes and test thoroughly
4. Commit: `git commit -m 'Add amazing feature'`
5. Push: `git push origin feature/amazing-feature`
6. Open a Pull Request

### Areas Needing Help

See [CURRENT_LIMITATIONS.md](CURRENT_LIMITATIONS.md) for areas where contributions would be valuable:
- Email verification & password reset
- Object storage for images and a job queue for heavy processing
- Accessibility checks in CI
- More image-processing operation batches
- End-to-end (Playwright) tests in CI

### Adding New Operations

Operations are added **entirely in the backend** — write a function and register it with a
typed parameter schema; the UI picks it up automatically (no frontend changes). See
[guides/ADDING_OPERATIONS.md](guides/ADDING_OPERATIONS.md).

---

## 📧 Contact & Support

### Developer

| Platform | Link |
|----------|------|
| **GitHub** | [@MauryanTitans](https://github.com/Mauryantitans) |
| **LinkedIn** | [mourya-arnepalli](https://www.linkedin.com/in/mourya-arnepalli) |
| **Instagram** | [@mouryaarnepalli](https://www.instagram.com/mouryaarnepalli) |

### Support

- **Bug Reports**: [GitHub Issues](https://github.com/MauryanTitans/pixelflow/issues)
- **Questions**: GitHub Discussions
- **Documentation**: [guides/](guides/) folder
- **Deployment Help**: [deployment/](deployment/) folder

---

## 📄 License

This project is licensed under the Apache-2.0 License - see the [LICENSE](LICENSE) file for details.

---

## 📖 Documentation

- **[INSTALLATION.md](INSTALLATION.md)** - Local setup and troubleshooting
- **[guides/GETTING_STARTED.md](guides/GETTING_STARTED.md)** - Using the app
- **[guides/API_REFERENCE.md](guides/API_REFERENCE.md)** - API
- **[a11y-reports/REPORT.md](a11y-reports/REPORT.md)** - Accessibility audit
- **[CHANGELOG.md](CHANGELOG.md)** - Version history and changes
- **[CURRENT_LIMITATIONS.md](CURRENT_LIMITATIONS.md)** - Known issues and limitations
- **[guides/](guides/)** - Development and usage guides
- **[deployment/](deployment/)** - Deployment documentation

---

<div align="center">

### Built with ❤️ for the image processing community

**⭐ Star this repository if PixelFlow helps your projects! ⭐**

[![GitHub stars](https://img.shields.io/github/stars/MauryanTitans/pixelflow?style=social)](https://github.com/MauryanTitans/pixelflow)
[![GitHub forks](https://img.shields.io/github/forks/MauryanTitans/pixelflow?style=social)](https://github.com/MauryanTitans/pixelflow/fork)

**Current Version: 1.3.0** | [View Previous Versions](CHANGELOG.md)

</div>
