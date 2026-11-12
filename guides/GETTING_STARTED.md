# Getting Started with PixelFlow

A beginner's guide to using PixelFlow for image processing. To install and run it first, see
[INSTALLATION.md](../INSTALLATION.md).

---

## What is PixelFlow?

PixelFlow is a visual image-processing pipeline builder. You can:

- upload one or more images, or start with a sample photo;
- chain operations from a library of 77 (adjustments, filters, OpenCV, scikit-image, stylize effects, and
  more) into a pipeline, plus a Custom Kernel you type yourself;
- preview a single image live as you change parameters, or process many images in batch;
- save pipelines to your account, reuse them as your own filters, and share them by link.

---

## Your first pipeline (5 minutes)

### Step 1: Upload images

1. Go to `http://localhost:3000/app`.
2. Add images in any of three ways:
   - Click **Upload Image(s)** and pick one or more files.
   - Drag files from your computer and drop them anywhere on the workspace.
   - Click **Try a sample** and pick one of the sample photos (astronaut, cat, coffee, rocket, coins,
     microscopy). They are public-domain or CC0 images.

   JPEG, PNG, BMP and TIFF are supported, up to 50 MB each and 20 per upload.
3. The images appear in the image list. **Gallery** shows all of them.

### Step 2: Select images

- Click images to select them.
- Select **one** image for Live Processing, or several for batch processing.
- Your selection and the Live Processing toggle are kept when you reload the page.

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
3. Click **Apply Pipeline**. Results appear one by one as each image finishes. Click **Stop** to cancel
   the run.
4. Click a result to inspect it.

A batch runs on the server, not in your browser. If you reload the page during a run, it carries on
and the remaining results still arrive.

---

## The interface

```
┌──────────────────────────────────────────────────────────────┐
│  Logo · Nav · Connection · Load · Save · Theme · Account     │  ← Header
├─────────────┬────────────────────────────────────────────────┤
│ OPERATIONS  │  Upload Image(s) · Gallery · Apply Pipeline    │
│             │  Try a sample · Live Processing toggle         │
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
- **Palette (Appearance):** choose a theme (Classic, Spectrum, Verdant, Cobalt, Fjord, Orchid, Safelight)
  and the mode. Signed out, your choice is saved in this browser. Signed in, it is saved to your account
  and follows you to other browsers.
- Account menu.

### Operations sidebar
- **Search** at the top (Ctrl+K).
- Grouped by library: **Basic**, **OpenCV**, **Scikit-Image**, **Stylize** and **Custom**. Click a category
  to expand it.
- **Custom** holds **Custom Kernel** and, when you are signed in, **My filters**.

### Pipeline
- Steps run top to bottom. Each step shows its parameters, and an error banner if that step failed (the other
  steps still run).
- Reorder steps with the up/down buttons or **Alt+Arrow** keys.
- **Turn a step off** with its power button. The step stays in the pipeline with its settings, but is
  skipped, so you can compare the result with and without it. Press the button again to turn it back on.
- **Undo / Redo** and **Reset**. The pipeline is kept when you reload the page.

### Interactive parameters
Some operations take input from the image itself. For example, **Flood Fill** needs a seed point, **Crop**
and **Inpaint Region** need a dragged rectangle, and color parameters have an eyedropper. Picking works on the
live preview, so turn on Live Processing with one image selected and use the Normal view. Then click the
step's pick button and click or drag on the image.

### Custom Kernel
**Custom → Kernels → Custom Kernel** applies a convolution matrix you edit. Each output pixel is the
weighted sum of its neighbours.

1. Pick a **Preset** (Sharpen, Box blur, Gaussian blur, Edge detect, Emboss, Sobel, Motion blur, and
   more) as a starting point.
2. Choose a size from 3×3 to 9×9. Growing pads the matrix with zeros; shrinking trims the edges.
3. Type the weights (−100 to 100). The centre cell is the pixel itself.
4. **Normalize** divides by the sum of the weights so brightness stays the same. **Absolute value** helps
   edge kernels, whose results can be negative. **Offset** is added afterwards (128 centres emboss-style
   kernels on grey).

### My filters (reusable filters)
Save a pipeline as your own filter and use it as one step in other pipelines. You need to be signed in.

1. Build the pipeline you want to reuse.
2. Click **Save**, tick **Save as a reusable filter**, give it a name and save.
3. The filter appears under **Custom → My filters**. Clicking it adds a single step that runs all its
   steps in order.

A filter step stores a copy of the steps at the time you add it. If you change the saved filter later,
pipelines that already use it keep the old version; add the filter again to pick up the change.

### Results and Inspector
- **Grid:** all processed results, with downloads. Downloaded files are named after the original image,
  e.g. `coffee-pixelflow.jpg`.
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

## Sharing a pipeline

1. Sign in and save the pipeline.
2. Click **Load**, find the pipeline and click **Share**.
3. Click **Create link**, then **Copy**. The panel also shows how many times the link was opened.
4. Anyone with the link sees the pipeline's name, description, steps and their settings, without signing
   in, and can click **Open in workspace** to try it on their own images. Your images are never shared.
5. **Stop sharing** turns the link off. The old link then stops working.

---

## Your account

- **Forgot your password?** On the sign-in page, click **Forgot password?** and enter your email. If the
  account exists, you get a link to set a new password. It is valid for one hour and works once. A reset
  signs your other browsers out (within 30 minutes at most); then sign in with the new password.
- **Verify your email.** After you register, PixelFlow emails you a verification link (valid 48 hours). A
  banner in the workspace reminds you until you verify and can send the link again. You can use every
  feature before verifying.
- Accounts that use Google sign-in have no PixelFlow password. A reset request for one sends a reminder to
  sign in with Google instead.

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
| Images | Exactly one | Any selection (up to 100 per run) |
| Updates | As you edit (debounced) | When you click Apply Pipeline |
| Speed | Reuses unchanged earlier steps | Full run per image on the server, one run at a time, can be stopped |
| Reload during a run | Re-renders the preview | The run continues and its results still arrive |
| Best for | Experimenting, interactive picks | Applying a finished pipeline to many images |

---

## Learning path

- **Beginner:** upload images; try Brightness, Contrast and Grayscale; learn Live Processing.
- **Intermediate:** create an account and save pipelines; explore OpenCV and Scikit-Image operations; use
  batch mode.
- **Advanced:** edge detection, morphology and segmentation; interactive operations (Flood Fill, Crop,
  Inpaint Region); your own kernels; reusable filters; sharing pipelines by link.

---

## Next steps

- [Adding Custom Operations](ADDING_OPERATIONS.md)
- [Admin Panel Guide](ADMIN_PANEL.md)
- [API Reference](API_REFERENCE.md)
- [Deployment Guide](../deployment/DEPLOYMENT_GUIDE.md)

## Need help?

- [Troubleshooting](../INSTALLATION.md#troubleshooting)
- [GitHub Issues](https://github.com/Mauryantitans/PixelFlow/issues)
