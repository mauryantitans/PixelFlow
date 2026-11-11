# Getting Started with PixelFlow

A beginner's guide to using PixelFlow for image processing. To install and run it first, see
[INSTALLATION.md](../INSTALLATION.md).

---

## What is PixelFlow?

PixelFlow is a visual image-processing pipeline builder. You can:

- upload one or more images;
- chain operations from a library of 77 (adjustments, filters, OpenCV, scikit-image, stylize effects, and
  more) into a pipeline;
- preview a single image live as you change parameters, or process many images in batch;
- save pipelines to your account and reuse them.

---

## Your first pipeline (5 minutes)

### Step 1: Upload images

1. Go to `http://localhost:3000/app`.
2. Click **Upload Image(s)** and pick one or more files in the file dialog. JPEG, PNG, BMP and TIFF are
   supported, up to 50 MB each and 20 per upload.
3. The images appear in the image list. **Gallery** shows all of them.

### Step 2: Select images

- Click images to select them.
- Select **one** image for Live Processing, or several for batch processing.

### Step 3: Build your pipeline

The operations sidebar is grouped by library and category. Click an operation to add it to the pipeline.
Some good first operations:

1. **Basic → Adjustments → Brightness:** drag the slider to brighten or darken.
2. **Basic → Filters → Grayscale:** converts to black and white.
3. **Basic → Blur & Sharpen → Gaussian Blur:** the radius controls the blur amount.

### Step 4: Process

**Live Processing (one image)**
1. Select exactly one image.
2. Turn on the **Live Processing** toggle.
3. Add operations and adjust parameters. The preview updates as you go.

**Batch (several images)**
1. Select the images.
2. Build the pipeline.
3. Click **Apply Pipeline**. Click **Stop** to cancel a run.
4. Click a result to inspect it.

---

## The interface

```
┌──────────────────────────────────────────────────────────────┐
│  Logo · Nav · Connection · Load · Save · Theme · Account     │  ← Header
├─────────────┬────────────────────────────────────────────────┤
│ OPERATIONS  │  Upload Image(s) · Gallery · Apply Pipeline    │
│             │  Live Processing toggle                        │
│ Search      │                                                │
│ Libraries   │  Pipeline (your steps)                         │
│ Categories  │                                                │
│             │  Results / Inspector                           │
└─────────────┴────────────────────────────────────────────────┘
```

### Header
- **Connection badge:** shows whether the backend is reachable.
- **Load / Save:** your saved pipelines (requires signing in).
- **Sun/moon:** switch between light and dark mode.
- **Palette (Appearance):** choose a theme (Classic, Spectrum, Verdant, Cobalt, Fjord, Orchid, Safelight) and the mode. Your choice is saved in this browser.
- Account menu.

### Operations sidebar
- **Search** at the top (Ctrl+K).
- Grouped by library: **Basic**, **OpenCV**, **Scikit-Image**, **Stylize**. Click a category to expand it.

### Pipeline
- Steps run top to bottom. Each step shows its parameters, and an error banner if that step failed (the other
  steps still run).
- Reorder steps with the up/down buttons or **Alt+Arrow** keys.
- **Undo / Redo** and **Reset**. The pipeline is kept when you reload the page.

### Interactive parameters
Some operations take input from the image itself. For example, **Flood Fill** needs a seed point, **Crop**
and **Inpaint Region** need a dragged rectangle, and color parameters have an eyedropper. Picking works on the
live preview, so turn on Live Processing with one image selected and use the Normal view. Then click the
step's pick button and click or drag on the image.

### Results and Inspector
- **Grid:** all processed results, with downloads.
- **Inspector:** compare stages of a result in **Normal**, **Slider** (before/after) or **Difference** view,
  see intermediate steps, and download them.

---

## Tips

1. **Experiment in Live mode.** It only recomputes from the step you changed, so tweaking parameters is fast.
2. **Save pipelines.** Sign in, then use **Save** in the header to name your pipeline. **Load** brings it back.
3. **Keyboard shortcuts:**
   - **Ctrl+K** or **Ctrl+/**: focus operation search
   - **Ctrl+Z** / **Ctrl+Y**: undo / redo a pipeline change
   - **Escape**: close the top-most dialog or lightbox
4. **Gallery:** select or deselect images in bulk, delete images, and open a full-size view. In the full-size
   view, the mouse wheel zooms and dragging pans (keyboard controls too).

---

## Example workflows

**Basic photo enhancement**
1. Upload a portrait.
2. Add Brightness (+10), Contrast (+15) and Sharpen (Level: Medium).
3. Fine-tune in Live mode, then download the result.

**Artistic look**
1. Upload a landscape.
2. Add Saturation (+30), Vignette, and a light Gaussian Blur.
3. Experiment in Live mode, then save the pipeline for reuse.

**Batch processing**
1. Upload up to 20 product photos.
2. Build one pipeline, for example Resize (scale factor), Brightness (+5) and Sharpen.
3. Select all images and click **Apply Pipeline**.
4. Download the results from the grid.

---

## Processing modes

| | Live Processing | Batch |
|---|---|---|
| Images | Exactly one | Any selection |
| Updates | As you edit (debounced) | When you click Apply Pipeline |
| Speed | Reuses unchanged earlier steps | Full run per image, one run at a time, can be stopped |
| Best for | Experimenting, interactive picks | Applying a finished pipeline to many images |

---

## Learning path

- **Beginner:** upload images; try Brightness, Contrast and Grayscale; learn Live Processing.
- **Intermediate:** create an account and save pipelines; explore OpenCV and Scikit-Image operations; use
  batch mode.
- **Advanced:** edge detection, morphology and segmentation; interactive operations (Flood Fill, Crop,
  Inpaint Region); build reusable pipelines.

---

## Next steps

- [Adding Custom Operations](ADDING_OPERATIONS.md)
- [Admin Panel Guide](ADMIN_PANEL.md)
- [API Reference](API_REFERENCE.md)
- [Deployment Guide](../deployment/DEPLOYMENT_GUIDE.md)

## Need help?

- [Troubleshooting](../INSTALLATION.md#troubleshooting)
- [GitHub Issues](https://github.com/Mauryantitans/PixelFlow/issues)
